/** Pure geometry helpers shared by the page overlay (hit testing, caret and selection placement). */
import type { Mat6, LineInfo } from '../engine/api';

export type Pt = [number, number];

export const apply = (m: Mat6, x: number, y: number): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

export function invert(m: Mat6): Mat6 {
  const det = m[0] * m[3] - m[1] * m[2] || 1e-12;
  const a = m[3] / det;
  const b = -m[1] / det;
  const c = -m[2] / det;
  const d = m[0] / det;
  return [a, b, c, d, -(m[4] * a + m[5] * c), -(m[4] * b + m[5] * d)];
}

export const scaleMat = (m: Mat6, k: number): Mat6 => [m[0] * k, m[1] * k, m[2] * k, m[3] * k, m[4] * k, m[5] * k];

/** Position of the caret boundary `i` (0…n) in user space. */
export function boundary(run: LineInfo, i: number): Pt {
  const n = run.glyphs.length;
  if (n === 0) return [0, 0];
  if (i <= 0) return [run.glyphs[0][0], run.glyphs[0][1]];
  if (i >= n) {
    const g = run.glyphs[n - 1];
    return [g[0] + g[2], g[1] + g[3]];
  }
  return [run.glyphs[i][0], run.glyphs[i][1]];
}

const add = (p: Pt, v: [number, number], k: number): Pt => [p[0] + v[0] * k, p[1] + v[1] * k];

/** Quad covering boundaries [a, b) of a run, in CSS pixels. */
export function spanQuad(run: LineInfo, a: number, b: number, toCss: Mat6): Pt[] {
  const p0 = boundary(run, a);
  const p1 = boundary(run, b);
  const lo = run.descent;
  const hi = run.ascent;
  return [add(p0, run.up, lo), add(p1, run.up, lo), add(p1, run.up, hi), add(p0, run.up, hi)].map((p) => apply(toCss, p[0], p[1]));
}

export function caretSegment(run: LineInfo, i: number, toCss: Mat6): [Pt, Pt] {
  const p = boundary(run, i);
  const a = add(p, run.up, run.descent);
  const b = add(p, run.up, run.ascent);
  return [apply(toCss, a[0], a[1]), apply(toCss, b[0], b[1])];
}

export function pointInQuad(q: Pt[], x: number, y: number): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const cross = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (cross !== 0) {
      const s = cross > 0 ? 1 : -1;
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
  }
  return true;
}

/** Caret boundary nearest to a user-space point, measured along the run's baseline. */
export function caretIndexAt(run: LineInfo, ux: number, uy: number): number {
  const n = run.glyphs.length;
  if (n === 0) return 0;
  const len = Math.hypot(run.right[0], run.right[1]) || 1;
  const d: Pt = [run.right[0] / len, run.right[1] / len];
  const o = boundary(run, 0);
  const s = (ux - o[0]) * d[0] + (uy - o[1]) * d[1];
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i <= n; i++) {
    const p = boundary(run, i);
    const bs = (p[0] - o[0]) * d[0] + (p[1] - o[1]) * d[1];
    const dist = Math.abs(s - bs);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}
