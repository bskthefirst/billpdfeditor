/**
 * The logical text model: glyphs from many show-text operators are merged into *lines* (a baseline plus the contiguous
 * words along it), with virtual spaces wherever the PDF leaves a word gap without a space glyph. This is what the user
 * sees and edits; `planLineEdit` (below) maps an edit of that text back onto individual operators.
 */
import {
  planAdjustmentRemoval,
  planElementReplace,
  planElementReplaceWithFonts,
  type ByteEdit,
  type SubstituteSegment,
} from '../pdf/patch';
import type { ContentUnit, ShowOp } from '../pdf/text';

export type Vec = [number, number];

/** A gap wider than this (in em of the preceding glyph) starts a new line (table cell, column, tab stop). */
export const LINE_GAP_EM = 1.0;
/** A gap wider than this becomes a virtual space inside a line. */
export const SPACE_GAP_EM = 0.17;
const SAME_BASELINE_EM = 0.3;

export interface LineItem {
  kind: 'glyph' | 'gap';
  /** Unicode text of the item (a single UTF-16 unit; ' ' for gaps). */
  ch: string;
  /** Position and advance in user space (for gaps: where the gap starts and how wide it is). */
  x: number;
  y: number;
  ax: number;
  ay: number;
  op?: ShowOp;
  elem?: number;
  /** Index into `op.glyphs` (glyph items only). */
  gi?: number;
  /** For a gap that is a TJ adjustment between two elements of the same op: index of that adjustment element. */
  adjElem?: number;
  editable: boolean;
}

export interface Line {
  id: string;
  page: number;
  items: LineItem[];
  text: string;
  /** Unit vector along the baseline, its normal, and the em-box axes of the dominant op. */
  u: Vec;
  n: Vec;
  up: Vec;
  size: number;
  ascent: number;
  descent: number;
  ops: ShowOp[];
  editable: boolean;
  reason?: string;
}

const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1];

interface OpInfo {
  op: ShowOp;
  key: string;
  u: Vec;
  n: Vec;
  size: number;
  /** Position of the first glyph origin and of the end of the last glyph, in user space. */
  start: Vec;
  end: Vec;
  v: number;
}

function glyphEditable(op: ShowOp, unicode: string): string | null {
  const f = op.font;
  if (!f) return 'no font';
  if (f.vertical) return 'vertical writing is not editable yet';
  if (f.subtype === 'Type3') return 'Type 3 fonts draw glyphs as shapes and cannot be re-typed';
  if (!f.metricsKnown) return 'this font is not embedded and has no width table, so its layout cannot be reproduced';
  if (op.unit.kind !== 'page') return 'text inside a reusable form (shared copy-on-write is coming)';
  if (!unicode) return 'some characters have no Unicode mapping';
  if (unicode.length !== 1) return 'ligatures and composed characters are not editable yet';
  return null;
}

export function buildLines(ops: ShowOp[], keyOf: (op: ShowOp) => string, page: number): Line[] {
  const infos: OpInfo[] = [];
  for (const op of ops) {
    if (!op.glyphs.length || op.renderMode === 3 || op.renderMode >= 4) continue;
    const len = Math.hypot(op.right[0], op.right[1]);
    if (!len) continue;
    const u: Vec = [op.right[0] / len, op.right[1] / len];
    const n: Vec = [-u[1], u[0]];
    const g0 = op.glyphs[0];
    const gl = op.glyphs[op.glyphs.length - 1];
    const size = Math.hypot(op.up[0], op.up[1]) || Math.abs(op.fontSize) || 1;
    infos.push({
      op,
      key: keyOf(op),
      u,
      n,
      size,
      start: [g0.x, g0.y],
      end: [gl.x + gl.ax, gl.y + gl.ay],
      v: dot([g0.x, g0.y], n),
    });
  }
  // cluster by direction, then baseline offset
  const unitIds = new Map<ShowOp['unit'], number>();
  const dirKey = (i: OpInfo) => {
    if (!unitIds.has(i.op.unit)) unitIds.set(i.op.unit, unitIds.size);
    return `${unitIds.get(i.op.unit)}|${Math.round(i.u[0] * 500)},${Math.round(i.u[1] * 500)}`; // lines never mix content units
  };
  const byDir = new Map<string, OpInfo[]>();
  for (const i of infos) {
    const k = dirKey(i);
    let l = byDir.get(k);
    if (!l) byDir.set(k, (l = []));
    l.push(i);
  }
  const lines: Line[] = [];
  for (const group of byDir.values()) {
    const u = group[0].u;
    const n = group[0].n;
    const sorted = group.slice().sort((a, b) => a.v - b.v);
    const clusters: OpInfo[][] = [];
    for (const i of sorted) {
      const last = clusters[clusters.length - 1];
      if (last && Math.abs(i.v - last[0].v) <= SAME_BASELINE_EM * Math.min(i.size, last[0].size)) last.push(i);
      else clusters.push([i]);
    }
    for (const cl of clusters) {
      cl.sort((a, b) => dot(a.start, u) - dot(b.start, u) || a.op.opIndex - b.op.opIndex);
      let current: OpInfo[] = [];
      let prevEnd = -Infinity;
      for (const i of cl) {
        const s = dot(i.start, u);
        if (current.length && s - prevEnd > LINE_GAP_EM * current[current.length - 1].size) {
          lines.push(makeLine(current, u, n, page));
          current = [];
          prevEnd = -Infinity;
        }
        current.push(i);
        prevEnd = Math.max(prevEnd, dot(i.end, u));
      }
      if (current.length) lines.push(makeLine(current, u, n, page));
    }
  }
  // reading order: top to bottom (by baseline along the normal), then left to right
  lines.sort((a, b) => {
    const dv = dot([b.items[0].x, b.items[0].y], [0, 1]) - dot([a.items[0].x, a.items[0].y], [0, 1]);
    return Math.abs(dv) > 1 ? dv : a.items[0].x - b.items[0].x;
  });
  return lines;
}

/**
 * Letter-spaced (tracked) text has a constant extra distance between glyphs. Calibrate the word-gap threshold to the
 * median gap between consecutive non-space glyphs so tracking isn't mistaken for word spaces.
 */
function wordGapThreshold(infos: OpInfo[], u: Vec): number {
  const size = Math.max(...infos.map((i) => i.size));
  const gaps: number[] = [];
  let prevEnd: number | null = null;
  let prevSpace = true;
  for (const { op } of infos) {
    for (const g of op.glyphs) {
      const isSpace = g.unicode === ' ' || g.unicode === '\u0000' || g.unicode === '\u00a0';
      const pos = g.x * u[0] + g.y * u[1];
      if (prevEnd !== null && !isSpace && !prevSpace) gaps.push(pos - prevEnd);
      prevEnd = pos + (g.ax * u[0] + g.ay * u[1]);
      prevSpace = isSpace;
    }
  }
  const sorted = gaps.slice().sort((a, b) => a - b);
  const median = sorted.length >= 4 ? sorted[sorted.length >> 1] : 0;
  return Math.max(SPACE_GAP_EM * size, median + 0.12 * size);
}

function makeLine(infos: OpInfo[], u: Vec, n: Vec, page: number): Line {
  const items: LineItem[] = [];
  let reason: string | undefined;
  let prevEnd = -Infinity;
  let prev: LineItem | null = null;
  const threshold = wordGapThreshold(infos, u);
  for (const info of infos) {
    const { op } = info;
    for (let gi = 0; gi < op.glyphs.length; gi++) {
      const g = op.glyphs[gi];
      const pos = dot([g.x, g.y], u);
      const gap = pos - prevEnd;
      if (prev && gap > threshold && prev.kind === 'glyph' && prev.ch !== ' ' && g.unicode !== ' ') {
        const adjElem = prev.op === op && prev.elem !== g.elem ? betweenElements(op, prev.elem!, g.elem) : undefined;
        const gapItem: LineItem = {
          kind: 'gap',
          ch: ' ',
          x: prev.x + prev.ax,
          y: prev.y + prev.ay,
          ax: gap * u[0],
          ay: gap * u[1],
          editable: true,
          adjElem,
        };
        if (prev.op === op && prev.elem !== g.elem && adjElem === undefined) gapItem.editable = false;
        items.push(gapItem);
      }
      const why = glyphEditable(op, g.unicode);
      if (why && !reason) reason = why;
      const item: LineItem = {
        kind: 'glyph',
        ch: g.unicode || '□',
        x: g.x,
        y: g.y,
        ax: g.ax,
        ay: g.ay,
        op,
        elem: g.elem,
        gi,
        editable: !why,
      };
      items.push(item);
      prev = item;
      prevEnd = Math.max(prevEnd, dot([g.x + g.ax, g.y + g.ay], u));
    }
  }
  const first = infos[0];
  const dominant = infos.reduce((a, b) => (b.size > a.size ? b : a));
  const f = dominant.op.font;
  const text = items.map((i) => i.ch).join('');
  return {
    id: `${page}:L${first.key}`,
    page,
    items,
    text,
    u,
    n,
    up: dominant.op.up,
    size: dominant.size,
    ascent: (f?.ascent ?? 800) / 1000,
    descent: (f?.descent ?? -200) / 1000,
    ops: infos.map((i) => i.op),
    editable: items.some((i) => i.kind === 'glyph' && i.editable),
    reason,
  };
}

/** The adjustment element between string elements `a` and `b` of a TJ, if exactly one sits there. */
function betweenElements(op: ShowOp, a: number, b: number): number | undefined {
  if (b !== a + 2) return undefined;
  return op.elements[a + 1]?.kind === 'adj' ? a + 1 : undefined;
}

// ───────────── editing ─────────────

/** Minimal single-range diff over code points: replace `[i, j)` of `a` with `mid`. */
export function diffText(a: string, b: string): { i: number; j: number; mid: string } {
  const A = Array.from(a);
  const B = Array.from(b);
  let p = 0;
  while (p < A.length && p < B.length && A[p] === B[p]) p++;
  let q = 0;
  while (q < A.length - p && q < B.length - p && A[A.length - 1 - q] === B[B.length - 1 - q]) q++;
  return { i: p, j: A.length - q, mid: B.slice(p, B.length - q).join('') };
}

/** Where inserted text goes: into the string of the glyph at `i` (prepend) or after the glyph at `i - 1` (append). */
export function insertionAnchor(line: Line, i: number): { item: number; mode: 'before' | 'after' } | null {
  const it = line.items;
  if (i < it.length && it[i].kind === 'glyph' && it[i].editable) return { item: i, mode: 'before' };
  if (i > 0 && it[i - 1].kind === 'glyph' && it[i - 1].editable) return { item: i - 1, mode: 'after' };
  return null;
}

export type GlyphBox = [number, number, number, number];

export type LineEditResult =
  | {
      ok: true;
      unitEdits: Map<ContentUnit, ByteEdit[]>;
      /** Explicit repositioning of ops that follow the edit on the line (user-space vectors). */
      shifts: Map<ShowOp, Vec>;
      /** Ops whose whole operator is replaced (font switching). */
      replacedOps: Set<ShowOp>;
      /** Overlay geometry for each character of the new text. */
      glyphs: GlyphBox[];
      /** Net change of the line's width along its baseline, in user-space units. */
      deltaWidth: number;
    }
  | { ok: false; reason: 'missing-glyphs'; missing: string[]; anchor: ShowOp; mid: string }
  | { ok: false; reason: 'unsupported'; detail: string };

const lin = (op: ShowOp): Vec => [op.tm[0] * op.ctm[0] + op.tm[1] * op.ctm[2], op.tm[0] * op.ctm[1] + op.tm[1] * op.ctm[3]];
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1]];
const scale = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k];

const elemStarts = new WeakMap<ShowOp, Map<number, number>>();
function elemStart(op: ShowOp, elem: number): number {
  let m = elemStarts.get(op);
  if (!m) {
    m = new Map();
    op.glyphs.forEach((g, i) => {
      if (!m!.has(g.elem)) m!.set(g.elem, i);
    });
    elemStarts.set(op, m);
  }
  return m.get(elem) ?? 0;
}

interface Recipe {
  op: ShowOp;
  elem: number;
  a: number;
  b: number;
  mid?: string;
}

/**
 * Turn "replace items [i, j) of this line with `mid`" into byte edits, explicit shifts for the operators after it, and the
 * new overlay geometry. `subFor` supplies fonts for characters the anchor glyph's font cannot draw.
 */
export function planLineEdit(
  line: Line,
  newText: string,
  subFor?: (anchor: ShowOp, mid: string) => SubstituteSegment[] | null,
): LineEditResult {
  const { i, j, mid } = diffText(line.text, newText);
  const items = line.items;
  const u = line.u;
  const unsupported = (detail: string): LineEditResult => ({ ok: false, reason: 'unsupported', detail });
  for (let k = i; k < j; k++) if (!items[k].editable) return unsupported(line.reason ?? 'this part of the line cannot be edited yet');

  const anchor = mid ? insertionAnchor(line, i) : null;
  if (mid && !anchor) return unsupported('there is no editable text next to the caret');

  // ── 1. recipes per string element ──
  const recipes = new Map<string, Recipe>();
  const keyOf = (op: ShowOp, elem: number) => `${line.ops.indexOf(op)}|${elem}`;
  const unitEdits = new Map<ContentUnit, ByteEdit[]>();
  const push = (unit: ContentUnit, e: ByteEdit) => {
    let l = unitEdits.get(unit);
    if (!l) unitEdits.set(unit, (l = []));
    l.push(e);
  };
  const opDelta = new Map<ShowOp, Vec>(); // net pen change inside each op
  const addDelta = (op: ShowOp, deltaTx: number) => opDelta.set(op, add(opDelta.get(op) ?? [0, 0], scale(lin(op), deltaTx)));

  for (let k = i; k < j; k++) {
    const it = items[k];
    if (it.kind === 'glyph') {
      const rel = it.gi! - elemStart(it.op!, it.elem!);
      const key = keyOf(it.op!, it.elem!);
      const r = recipes.get(key);
      if (r) r.b = Math.max(r.b, rel + 1);
      else recipes.set(key, { op: it.op!, elem: it.elem!, a: rel, b: rel + 1 });
    } else if (it.adjElem !== undefined) {
      // the gap is a TJ adjustment inside one op: close it by zeroing that number
      const prevOp = items[k - 1]?.op;
      const plan = prevOp ? planAdjustmentRemoval(prevOp, it.adjElem) : null;
      if (!plan) return unsupported('cannot close this word gap');
      push(prevOp!.unit, plan.edit);
      addDelta(prevOp!, plan.deltaTx);
    }
  }
  if (anchor) {
    const it = items[anchor.item];
    const rel = it.gi! - elemStart(it.op!, it.elem!) + (anchor.mode === 'after' ? 1 : 0);
    const key = keyOf(it.op!, it.elem!);
    const r = recipes.get(key);
    if (!r) recipes.set(key, { op: it.op!, elem: it.elem!, a: rel, b: rel, mid });
    else if (r.a === rel) r.mid = mid;
    else return unsupported('the edit is not contiguous inside one string');
  }

  // ── 2. plan each element ──
  let newGlyphs: { ch: string; tx: number }[] = [];
  let anchorOp: ShowOp | null = null;
  const replaced = new Set<ShowOp>();
  const perOp = new Map<ShowOp, number>();
  for (const r of recipes.values()) perOp.set(r.op, (perOp.get(r.op) ?? 0) + 1);
  for (const r of recipes.values()) {
    let plan = planElementReplace(r.op, r.elem, r.a, r.b, r.mid ?? '');
    if (!plan.ok && plan.reason === 'missing-glyphs' && r.mid) {
      const segs = subFor?.(r.op, r.mid);
      if (!segs) return { ok: false, reason: 'missing-glyphs', missing: plan.missing, anchor: r.op, mid: r.mid };
      if (perOp.get(r.op)! > 1) return unsupported('this edit mixes font fallback with other changes in the same text run');
      plan = planElementReplaceWithFonts(r.op, r.elem, r.a, r.b, segs);
      if (plan.ok) replaced.add(r.op);
    }
    if (!plan.ok)
      return plan.reason === 'missing-glyphs'
        ? { ok: false, reason: 'missing-glyphs', missing: plan.missing, anchor: r.op, mid: r.mid ?? '' }
        : unsupported(plan.detail);
    push(plan.unit, plan.edit);
    addDelta(r.op, plan.deltaTx);
    if (r.mid) {
      newGlyphs = plan.glyphs;
      anchorOp = r.op;
    }
  }

  // ── 3. how far the rest of the line moves ──
  // Measured from actual positions (not summed natural advances), so justified spaces and other unmodelled whitespace keep
  // their size: the first surviving item keeps the same distance from the end of the new text as before.
  const projU = (v: Vec) => v[0] * u[0] + v[1] * u[1];
  const posU = (k: number) => items[k].x * u[0] + items[k].y * u[1];
  const survivorsAfter = j < items.length;
  const l = anchorOp ? lin(anchorOp) : ([0, 0] as Vec);
  const newWidth = newGlyphs.reduce((w, g) => w + g.tx, 0) * Math.hypot(l[0], l[1]);
  let startPoint: Vec;
  if (anchor?.mode === 'after') startPoint = [items[anchor.item].x + items[anchor.item].ax, items[anchor.item].y + items[anchor.item].ay];
  else if (i < items.length) startPoint = [items[i].x, items[i].y];
  else startPoint = i > 0 ? [items[i - 1].x + items[i - 1].ax, items[i - 1].y + items[i - 1].ay] : [0, 0];
  const S = survivorsAfter ? newWidth - (posU(j) - projU(startPoint)) : 0;

  const firstIdx = new Map<ShowOp, number>();
  const lastIdx = new Map<ShowOp, number>();
  items.forEach((it, k) => {
    if (!it.op) return;
    if (!firstIdx.has(it.op)) firstIdx.set(it.op, k);
    lastIdx.set(it.op, k);
  });
  const shifts = new Map<ShowOp, Vec>();
  if (survivorsAfter && Math.abs(S) > 1e-4) {
    for (const op of line.ops) {
      const f = firstIdx.get(op)!;
      if (lastIdx.get(op)! < j) continue; // nothing of this op follows the edit
      if (f < i) continue; // the edit is inside this op: its tail follows the pen
      const pen = projU(opDelta.get(op) ?? [0, 0]); // natural width change inside the op, applied to its tail by the pen
      if (Math.abs(S - pen) > 1e-4) shifts.set(op, scale(u, S - pen));
    }
  }

  // ── 4. overlay geometry for the new text ──
  const out: GlyphBox[] = [];
  for (let k = 0; k < i; k++) out.push([items[k].x, items[k].y, items[k].ax, items[k].ay]);
  if (mid && anchorOp) {
    let p: Vec = startPoint;
    for (const g of newGlyphs) {
      out.push([p[0], p[1], g.tx * l[0], g.tx * l[1]]);
      p = [p[0] + g.tx * l[0], p[1] + g.tx * l[1]];
    }
  }
  for (let k = j; k < items.length; k++) out.push([items[k].x + u[0] * S, items[k].y + u[1] * S, items[k].ax, items[k].ay]);

  return {
    ok: true,
    unitEdits,
    shifts,
    replacedOps: replaced,
    glyphs: out,
    deltaWidth: newWidth - (survivorsAfter ? posU(j) - projU(startPoint) : 0),
  };
}
