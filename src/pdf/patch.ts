/**
 * Surgical text edits. Replaces the string bytes of an existing `Tj`/`TJ` and leaves every other byte of the content
 * stream untouched. When the original font cannot draw the new characters, the operation is split so only the new text
 * switches to another embedded font. Results are written as an incremental update (`IncrementalUpdate`).
 */
import { zlibSync } from 'fflate';
import { PdfName, PdfNewStream } from './objects';
import type { ContentUnit, ShowOp, Segment } from './text';
import { fmtNumber, type IncrementalUpdate } from './writer';

export interface ByteEdit {
  start: number;
  end: number;
  bytes: Uint8Array;
}

/** One newly drawn character and its advance in text-space units (including Tc/Tw/Th). */
export interface NewGlyph {
  ch: string;
  tx: number;
}

export type ReplacePlan =
  | {
      ok: true;
      unit: ContentUnit;
      edit: ByteEdit;
      /** The new characters in order, for overlay geometry. */
      glyphs: NewGlyph[];
      /** Change in text-space advance of everything after the edit (new width − old width, incl. dropped TJ adjustments). */
      deltaTx: number;
      /** TJ adjustments inside the replaced range that were dropped (thousandths of text space); they usually encode word gaps. */
      droppedAdjustments: number;
    }
  | { ok: false; reason: 'missing-glyphs'; missing: string[] }
  | { ok: false; reason: 'unsupported'; detail: string };

/** A font other than the op's own, already embedded, used to draw characters the original font lacks. */
export interface SubstituteFont {
  /** Name registered in the page's /Resources /Font (without the slash). */
  resName: string;
  /** Bytes representing `ch` in a PDF string of this font, or null if it cannot draw it. */
  encode(ch: string): Uint8Array | null;
  /** Advance of `ch` in thousandths of an em. */
  advance(ch: string): number;
}
export interface SubstituteSegment {
  font: SubstituteFont;
  text: string;
}

const hex = (b: Uint8Array): string => {
  let s = '<';
  for (const x of b) s += x.toString(16).padStart(2, '0').toUpperCase();
  return s + '>';
};
const latin1 = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 255);
const concat = (parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
const nameToken = (n: string): string => {
  let out = '/';
  for (const c of n)
    out +=
      c.charCodeAt(0) < 33 || c.charCodeAt(0) > 126 || '()<>[]{}/%#'.includes(c) ? `#${c.charCodeAt(0).toString(16).padStart(2, '0')}` : c;
  return out;
};

/** Checks shared by both planners; returns an error plan or the resolved pieces of the surrounding strings. */
function locate(op: ShowOp, from: number, to: number) {
  const font = op.font;
  if (!font) return { fail: { ok: false, reason: 'unsupported', detail: 'no font in effect' } as ReplacePlan };
  if (font.vertical) return { fail: { ok: false, reason: 'unsupported', detail: 'vertical writing' } as ReplacePlan };
  if (font.subtype === 'Type3') return { fail: { ok: false, reason: 'unsupported', detail: 'Type3 font' } as ReplacePlan };
  const g = op.glyphs;
  if (from < 0 || to < from || to > g.length)
    return { fail: { ok: false, reason: 'unsupported', detail: 'glyph range out of bounds' } as ReplacePlan };
  if (!op.elements.some((e) => e.kind === 'str'))
    return { fail: { ok: false, reason: 'unsupported', detail: 'operation has no string' } as ReplacePlan };
  const insertion = to === from;
  const first = from < g.length ? g[from] : g[g.length - 1];
  const last = insertion ? first : g[to - 1];
  const eFirst = op.elements[first.elem];
  const eLast = op.elements[last.elem];
  if (eFirst.kind !== 'str' || eLast.kind !== 'str')
    return { fail: { ok: false, reason: 'unsupported', detail: 'malformed TJ' } as ReplacePlan };
  const prefix = from < g.length ? eFirst.bytes.subarray(0, first.offset) : eFirst.bytes;
  const suffix = insertion
    ? from < g.length
      ? eFirst.bytes.subarray(first.offset)
      : new Uint8Array(0)
    : eLast.bytes.subarray(last.offset + last.len);
  let oldTx = 0;
  for (let i = from; i < to; i++) oldTx += g[i].tx;
  let dropped = 0;
  for (let k = first.elem + 1; k < last.elem; k++) {
    const el = op.elements[k];
    if (el.kind === 'adj') dropped += el.value;
  }
  oldTx += (-dropped / 1000) * op.fontSize * op.th;
  return { fail: undefined, font, first, last, eFirst, eLast, prefix, suffix, oldTx, dropped };
}

/**
 * Replace glyphs `[from, to)` of `op` with `text`, encoded in the op's own font. Fails (touching nothing) if the font
 * cannot encode every character.
 */
export function planReplace(op: ShowOp, from: number, to: number, text: string): ReplacePlan {
  const loc = locate(op, from, to);
  if (loc.fail) return loc.fail;
  const { font, eFirst, eLast, prefix, suffix, oldTx, dropped } = loc;
  const missing: string[] = [];
  const parts: Uint8Array[] = [];
  const glyphs: NewGlyph[] = [];
  let newTx = 0;
  for (const ch of text) {
    const code = font.codeFor(ch);
    if (code === null) {
      if (!missing.includes(ch)) missing.push(ch);
      continue;
    }
    const bytes = font.encode(code);
    parts.push(bytes);
    const tx = (font.advance(code) * op.fontSize + op.tc + (font.isWordSpace(code, bytes.length) ? op.tw : 0)) * op.th;
    glyphs.push({ ch, tx });
    newTx += tx;
  }
  if (missing.length) return { ok: false, reason: 'missing-glyphs', missing };
  return {
    ok: true,
    unit: op.unit,
    edit: { start: eFirst.range[0], end: eLast.range[1], bytes: latin1(hex(concat([prefix, ...parts, suffix]))) },
    glyphs,
    deltaTx: newTx - oldTx,
    droppedAdjustments: dropped,
  };
}

/**
 * Like `planReplace`, but the replacement is drawn with other fonts (one per segment). The operation is split so
 * everything outside the replaced range keeps its original font:
 *   [before… (prefix)]TJ   /Sub1 fs Tf <new>Tj  /Sub2 fs Tf <new>Tj   /Orig fs Tf   [(suffix) after…]TJ
 * The text matrix keeps advancing, so baseline, size, colour and spacing parameters are untouched.
 */
export function planReplaceWithFonts(op: ShowOp, from: number, to: number, segments: SubstituteSegment[]): ReplacePlan {
  const loc = locate(op, from, to);
  if (loc.fail) return loc.fail;
  const { font, first, last, eFirst, eLast, prefix, suffix, oldTx, dropped } = loc;
  if (!font.resName || font.resName === 'gs-font')
    return { ok: false, reason: 'unsupported', detail: 'font was selected through an ExtGState' };
  if (first.elem !== last.elem) return { ok: false, reason: 'unsupported', detail: 'range spans several TJ strings' };

  const missing: string[] = [];
  const glyphs: NewGlyph[] = [];
  const pieces: Array<{ resName: string; bytes: Uint8Array }> = [];
  let newTx = 0;
  for (const seg of segments) {
    const parts: Uint8Array[] = [];
    for (const ch of seg.text) {
      const b = seg.font.encode(ch);
      if (!b) {
        if (!missing.includes(ch)) missing.push(ch);
        continue;
      }
      parts.push(b);
      const tx = ((seg.font.advance(ch) / 1000) * op.fontSize + op.tc + (ch === ' ' ? op.tw : 0)) * op.th;
      glyphs.push({ ch, tx });
      newTx += tx;
    }
    if (parts.length) pieces.push({ resName: seg.font.resName, bytes: concat(parts) });
  }
  if (missing.length) return { ok: false, reason: 'missing-glyphs', missing };

  const buf = op.unit.bytes;
  const slice = (a: number, b: number) => new TextDecoder('latin1').decode(buf.subarray(a, b));
  const fs = fmtNumber(op.fontSize);
  const restore = `${nameToken(font.resName)} ${fs} Tf`;
  const mids = pieces.map((p) => `${nameToken(p.resName)} ${fs} Tf ${hex(p.bytes)} Tj`);
  const k = first.elem;
  const out: string[] = [];
  if (op.op === 'TJ') {
    const firstEl = op.elements[0];
    const lastEl = op.elements[op.elements.length - 1];
    const before = k > 0 ? slice(firstEl.range[0], eFirst.range[0]) : '';
    const after = k < op.elements.length - 1 ? slice(eLast.range[1], lastEl.range[1]) : '';
    if (before || prefix.length) out.push(`[${before}${prefix.length ? hex(prefix) : ''}]TJ`);
    out.push(...mids, restore);
    if (after || suffix.length) out.push(`[${suffix.length ? hex(suffix) : ''}${after}]TJ`);
  } else {
    // Tj, ' and ": the original operator (with its line move / spacing operands) keeps the prefix
    const lead = op.unit.ops[op.opIndex].argRanges
      .slice(0, -1)
      .map((r) => slice(r[0], r[1]))
      .join(' ');
    if (op.op === 'Tj') {
      if (prefix.length) out.push(`${hex(prefix)} Tj`);
    } else out.push(`${lead ? lead + ' ' : ''}${hex(prefix)} ${op.op}`);
    out.push(...mids, restore);
    if (suffix.length) out.push(`${hex(suffix)} Tj`);
  }
  return {
    ok: true,
    unit: op.unit,
    edit: { start: op.start, end: op.end, bytes: latin1(out.join('\n')) },
    glyphs,
    deltaTx: newTx - oldTx,
    droppedAdjustments: dropped,
  };
}

/** Apply non-overlapping byte edits to a unit's bytes. */
export function applyEdits(bytes: Uint8Array, edits: ByteEdit[]): Uint8Array {
  // zero-length insertions at an offset must come before a replacement that starts at the same offset
  const sorted = [...edits].sort((a, b) => a.start - b.start || a.end - a.start - (b.end - b.start));
  let len = bytes.length;
  for (const e of sorted) len += e.bytes.length - (e.end - e.start);
  const out = new Uint8Array(len);
  let o = 0;
  let p = 0;
  for (const e of sorted) {
    if (e.start < p) throw new Error('overlapping edits');
    out.set(bytes.subarray(p, e.start), o);
    o += e.start - p;
    out.set(e.bytes, o);
    o += e.bytes.length;
    p = e.end;
  }
  out.set(bytes.subarray(p), o);
  return out;
}

/**
 * Write the patched content of `unit` into `update`: only the content streams that actually contain an edit are
 * replaced (recompressed with Flate); all other streams and objects stay byte-identical.
 */
export function commitUnitEdits(update: IncrementalUpdate, unit: ContentUnit, edits: ByteEdit[]): void {
  const bySegment = new Map<Segment, ByteEdit[]>();
  for (const e of edits) {
    const seg = unit.segments.find((s) => e.start >= s.start && e.end <= s.end);
    if (!seg) throw new Error('edit straddles content streams (merge not implemented yet)');
    let l = bySegment.get(seg);
    if (!l) bySegment.set(seg, (l = []));
    l.push(e);
  }
  for (const [seg, list] of bySegment) {
    if (!seg.num) throw new Error('content stream has no object number');
    const local = list.map((e) => ({ start: e.start - seg.start, end: e.end - seg.start, bytes: e.bytes }));
    const data = applyEdits(unit.bytes.subarray(seg.start, seg.end), local);
    const dict = new Map(seg.stream.dict);
    for (const k of ['DecodeParms', 'DP', 'F']) dict.delete(k);
    dict.set('Filter', new PdfName('FlateDecode'));
    update.set(seg.num, new PdfNewStream(dict, zlibSync(data)));
  }
}

/** Shift of the text after an edit along the baseline, in user-space units. */
export function userDelta(op: ShowOp, plan: Extract<ReplacePlan, { ok: true }>): number {
  return plan.deltaTx * Math.hypot(op.tm[0] * op.ctm[0] + op.tm[1] * op.ctm[2], op.tm[0] * op.ctm[1] + op.tm[1] * op.ctm[3]);
}

// ───────────── element-relative planners (used by the line editor) ─────────────

/**
 * Resolve glyphs `[a, b)` *of one string element* (indices relative to that string, 0…count) to the bytes around them.
 * Unlike global glyph indices this is unambiguous at string boundaries: appending at the end of a string is `a = b = count`.
 */
function locateElem(op: ShowOp, elem: number, a: number, b: number) {
  const font = op.font;
  type Fail = { fail: ReplacePlan };
  const fail = (detail: string): Fail => ({ fail: { ok: false, reason: 'unsupported', detail } });
  if (!font) return fail('no font in effect');
  if (font.vertical) return fail('vertical writing');
  if (font.subtype === 'Type3') return fail('Type3 font');
  const el = op.elements[elem];
  if (!el || el.kind !== 'str') return fail('not a string element');
  const g = op.glyphs;
  const idx: number[] = [];
  for (let i = 0; i < g.length; i++) if (g[i].elem === elem) idx.push(i);
  if (a < 0 || b < a || b > idx.length) return fail('glyph range out of bounds');
  const prefix = a < idx.length ? el.bytes.subarray(0, g[idx[a]].offset) : el.bytes;
  const suffix = b < idx.length ? el.bytes.subarray(g[idx[b]].offset) : new Uint8Array(0);
  let oldTx = 0;
  for (let k = a; k < b; k++) oldTx += g[idx[k]].tx;
  return { fail: undefined, font, el, prefix, suffix, oldTx };
}

/** Replace glyphs `[a, b)` of string element `elem` with `text`, using the op's own font. */
export function planElementReplace(op: ShowOp, elem: number, a: number, b: number, text: string): ReplacePlan {
  const loc = locateElem(op, elem, a, b);
  if (loc.fail) return loc.fail;
  const { font, el, prefix, suffix, oldTx } = loc;
  const missing: string[] = [];
  const parts: Uint8Array[] = [];
  const glyphs: NewGlyph[] = [];
  let newTx = 0;
  for (const ch of text) {
    const code = font.codeFor(ch);
    if (code === null) {
      if (!missing.includes(ch)) missing.push(ch);
      continue;
    }
    const bytes = font.encode(code);
    parts.push(bytes);
    const tx = (font.advance(code) * op.fontSize + op.tc + (font.isWordSpace(code, bytes.length) ? op.tw : 0)) * op.th;
    glyphs.push({ ch, tx });
    newTx += tx;
  }
  if (missing.length) return { ok: false, reason: 'missing-glyphs', missing };
  return {
    ok: true,
    unit: op.unit,
    edit: { start: el.range[0], end: el.range[1], bytes: latin1(hex(concat([prefix, ...parts, suffix]))) },
    glyphs,
    deltaTx: newTx - oldTx,
    droppedAdjustments: 0,
  };
}

/** As `planElementReplace`, but the new text is drawn with other fonts (the op is split around it). */
export function planElementReplaceWithFonts(op: ShowOp, elem: number, a: number, b: number, segments: SubstituteSegment[]): ReplacePlan {
  const loc = locateElem(op, elem, a, b);
  if (loc.fail) return loc.fail;
  const { font, el, prefix, suffix, oldTx } = loc;
  if (!font.resName || font.resName === 'gs-font')
    return { ok: false, reason: 'unsupported', detail: 'font was selected through an ExtGState' };
  const missing: string[] = [];
  const glyphs: NewGlyph[] = [];
  const pieces: Array<{ resName: string; bytes: Uint8Array }> = [];
  let newTx = 0;
  for (const seg of segments) {
    const parts: Uint8Array[] = [];
    for (const ch of seg.text) {
      const bytes = seg.font.encode(ch);
      if (!bytes) {
        if (!missing.includes(ch)) missing.push(ch);
        continue;
      }
      parts.push(bytes);
      const tx = ((seg.font.advance(ch) / 1000) * op.fontSize + op.tc + (ch === ' ' ? op.tw : 0)) * op.th;
      glyphs.push({ ch, tx });
      newTx += tx;
    }
    if (parts.length) pieces.push({ resName: seg.font.resName, bytes: concat(parts) });
  }
  if (missing.length) return { ok: false, reason: 'missing-glyphs', missing };

  const buf = op.unit.bytes;
  const slice = (x: number, y: number) => new TextDecoder('latin1').decode(buf.subarray(x, y));
  const fs = fmtNumber(op.fontSize);
  const restore = `${nameToken(font.resName)} ${fs} Tf`;
  const mids = pieces.map((p) => `${nameToken(p.resName)} ${fs} Tf ${hex(p.bytes)} Tj`);
  const out: string[] = [];
  if (op.op === 'TJ') {
    const firstEl = op.elements[0];
    const lastEl = op.elements[op.elements.length - 1];
    const before = elem > 0 ? slice(firstEl.range[0], el.range[0]) : '';
    const after = elem < op.elements.length - 1 ? slice(el.range[1], lastEl.range[1]) : '';
    if (before || prefix.length) out.push(`[${before}${prefix.length ? hex(prefix) : ''}]TJ`);
    out.push(...mids, restore);
    if (after || suffix.length) out.push(`[${suffix.length ? hex(suffix) : ''}${after}]TJ`);
  } else {
    const lead = op.unit.ops[op.opIndex].argRanges
      .slice(0, -1)
      .map((r) => slice(r[0], r[1]))
      .join(' ');
    if (op.op === 'Tj') {
      if (prefix.length) out.push(`${hex(prefix)} Tj`);
    } else out.push(`${lead ? lead + ' ' : ''}${hex(prefix)} ${op.op}`);
    out.push(...mids, restore);
    if (suffix.length) out.push(`${hex(suffix)} Tj`);
  }
  return {
    ok: true,
    unit: op.unit,
    edit: { start: op.start, end: op.end, bytes: latin1(out.join('\n')) },
    glyphs,
    deltaTx: newTx - oldTx,
    droppedAdjustments: 0,
  };
}

/** Close a gap that is encoded as a TJ adjustment by setting the adjustment to 0. Returns the edit and the pen change. */
export function planAdjustmentRemoval(op: ShowOp, adjElem: number): { edit: ByteEdit; deltaTx: number } | null {
  const el = op.elements[adjElem];
  if (!el || el.kind !== 'adj') return null;
  return { edit: { start: el.range[0], end: el.range[1], bytes: latin1('0') }, deltaTx: (el.value / 1000) * op.fontSize * op.th };
}
