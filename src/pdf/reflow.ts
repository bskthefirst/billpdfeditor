/**
 * Line reflow: when an edit changes the width of a word, the rest of the line (the contiguous words after it on the
 * same baseline) moves with it, like in any word processor. Many producers position every word absolutely, so the
 * moved words get explicit `Tm` operators; the first word that stays put is pinned with its original matrix so relative
 * moves (`Td`, `T*`) can't drag it along. Words separated by a large gap (table cells, columns) are left alone.
 */
import { fmtNumber } from './writer';
import type { ByteEdit } from './patch';
import { invert, type Mat } from './matrix';
import type { ContentUnit, ShowOp } from './text';

const MAX_GAP_EM = 1.6; // wider than a (justified) word gap, narrower than a table-cell or column gap
const SAME_BASELINE_EM = 0.35;

type Vec = [number, number];

interface Extent {
  /** Start and end of the op's text along its baseline, in user space. */
  start: Vec;
  end: Vec;
  /** Unit vector along the baseline and its normal. */
  u: Vec;
  n: Vec;
  size: number;
}

function extentOf(op: ShowOp): Extent | null {
  const g = op.glyphs;
  if (!g.length) return null;
  const len = Math.hypot(op.right[0], op.right[1]);
  if (!len) return null;
  const u: Vec = [op.right[0] / len, op.right[1] / len];
  const last = g[g.length - 1];
  return {
    start: [g[0].x, g[0].y],
    end: [last.x + last.ax, last.y + last.ay],
    u,
    n: [-u[1], u[0]],
    size: Math.hypot(op.up[0], op.up[1]) || Math.abs(op.fontSize) || 1,
  };
}

const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1];

/** The ops that belong to the same line as `edited` and come after it, nearest first. */
export function followingOnLine(edited: ShowOp, ops: ShowOp[]): ShowOp[] {
  const e = extentOf(edited);
  if (!e) return [];
  const cands: Array<{ op: ShowOp; ext: Extent; from: number; to: number }> = [];
  for (const op of ops) {
    if (op === edited || op.unit !== edited.unit || op.renderMode === 3) continue;
    const x = extentOf(op);
    if (!x) continue;
    if (dot(x.u, e.u) < 0.995) continue; // same direction
    if (Math.abs(dot([x.start[0] - e.start[0], x.start[1] - e.start[1]], e.n)) > SAME_BASELINE_EM * e.size) continue; // same baseline
    const from = dot(x.start, e.u);
    cands.push({ op, ext: x, from, to: dot(x.end, e.u) });
  }
  cands.sort((a, b) => a.from - b.from);
  const chain: ShowOp[] = [];
  let prevEnd = dot(e.end, e.u);
  for (const c of cands) {
    if (c.from < prevEnd - 0.5 * e.size) continue; // starts before the edited text ends: not "after" it
    if (c.from - prevEnd > MAX_GAP_EM * e.size) break; // a big gap: another cell / column
    chain.push(c.op);
    prevEnd = Math.max(prevEnd, c.to);
  }
  return chain;
}

/** `a b c d e f Tm` that places `op`'s text origin `shift` (user space) away from where it was. */
function shiftedTm(op: ShowOp, shift: Vec): string {
  const L = invert([op.ctm[0], op.ctm[1], op.ctm[2], op.ctm[3], 0, 0] as Mat);
  const de = shift[0] * (L?.[0] ?? 1) + shift[1] * (L?.[2] ?? 0);
  const df = shift[0] * (L?.[1] ?? 0) + shift[1] * (L?.[3] ?? 1);
  const m = op.tm;
  return `${[m[0], m[1], m[2], m[3], m[4] + de, m[5] + df].map(fmtNumber).join(' ')} Tm`;
}

const dec = (u: ContentUnit, a: number, b: number) => new TextDecoder('latin1').decode(u.bytes.subarray(a, b));
const latin1 = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 255);

/** Positioning operators that, between two show operations, make the later one independent of the former. */
const RESETS = new Set(['Tm', 'BT', 'ET']);

/**
 * Byte edits that move every op in `shifts` by its vector and pin the text that must not move.
 * `skip` lists ops whose bytes are already being replaced by another edit (their shift is not applied).
 */
export function planShifts(
  unit: ContentUnit,
  shifts: Map<ShowOp, Vec>,
  allOps: ShowOp[],
  replaced: Set<ShowOp>,
): { edits: ByteEdit[]; applied: Map<ShowOp, Vec> } {
  const edits: ByteEdit[] = [];
  const applied = new Map<ShowOp, Vec>();
  const inUnit = allOps.filter((o) => o.unit === unit);

  // converting `'` / `"` into Tj + Tm is only needed when they must be pinned or shifted; skip shifting those if also replaced
  const convert = (op: ShowOp, tm: string): ByteEdit | null => {
    const raw = unit.ops[op.opIndex];
    if (op.op === 'Tj' || op.op === 'TJ') return { start: op.start, end: op.start, bytes: latin1(`${tm}\n`) };
    // ' and ": a line move is baked into the operator. Rewrite as explicit state + Tj.
    const strIdx = op.op === "'" ? 0 : 2;
    const str = dec(unit, raw.argRanges[strIdx][0], raw.argRanges[strIdx][1]);
    const lead =
      op.op === '"'
        ? `${dec(unit, raw.argRanges[0][0], raw.argRanges[0][1])} Tw ${dec(unit, raw.argRanges[1][0], raw.argRanges[1][1])} Tc `
        : '';
    return { start: op.start, end: op.end, bytes: latin1(`${lead}${tm}\n${str} Tj`) };
  };

  const shiftedSet = new Set<ShowOp>();
  for (const [op, v] of shifts) {
    if (replaced.has(op) && (op.op === "'" || op.op === '"')) continue;
    if (Math.hypot(v[0], v[1]) < 1e-4) continue;
    const e = convert(op, shiftedTm(op, v));
    if (!e) continue;
    edits.push(e);
    applied.set(op, v);
    shiftedSet.add(op);
  }

  // pin: after the last shifted op of each stretch, the next show op that is not shifted but positioned relative to it
  const pinned = new Set<ShowOp>();
  inUnit.forEach((op, i) => {
    if (!shiftedSet.has(op)) return;
    const next = inUnit[i + 1];
    if (!next || shiftedSet.has(next) || pinned.has(next) || (replaced.has(next) && (next.op === "'" || next.op === '"'))) return;
    for (let k = op.opIndex + 1; k < next.opIndex; k++) if (RESETS.has(unit.ops[k].op)) return; // already absolute
    const e = convert(next, shiftedTm(next, [0, 0]));
    if (e) {
      edits.push(e);
      pinned.add(next);
    }
  });
  return { edits, applied };
}
