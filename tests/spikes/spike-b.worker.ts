/** Spike B′ at scale: patch one word per file and verify with PDFium. */
import { readFileSync } from 'node:fs';
import { loadCore } from '../helpers/node-core';
import { defineWorker } from '../helpers/batch';
import { PdfFile } from '../../src/pdf/file';
import { TextExtractor, effectiveFontSize, type ShowOp } from '../../src/pdf/text';
import { planReplace, commitUnitEdits, userDelta } from '../../src/pdf/patch';
import { IncrementalUpdate } from '../../src/pdf/writer';

export type SpikeBResult =
  | { status: 'no-candidate'; ops: number }
  | { status: 'plan-failed'; reason: string; detail: string; font: string }
  | {
      status: 'patched';
      font: string;
      inside: number;
      outside: number;
      textFound: boolean;
      reparseOk: boolean;
      fontObjsBefore: number;
      fontObjsAfter: number;
      growth: number;
      unit: string;
    };

const SCALE = 2;

function pick(ops: ShowOp[]): { op: ShowOp; from: number; to: number; word: string } | null {
  for (const op of ops) {
    if (!op.font || op.glyphs.length < 8 || op.renderMode === 3 || op.renderMode >= 4) continue;
    if (!op.glyphs.every((g) => g.unicode.length === 1 && g.unicode.charCodeAt(0) < 0x2000)) continue;
    // a word must live inside ONE string element: TJ adjustments between strings usually encode word gaps
    const s = op.glyphs
      .map((g, i) => `${g.unicode}`.replace(/./, (c) => (i > 0 && g.elem !== op.glyphs[i - 1].elem ? `\u0001${c}` : c)))
      .join('');
    const re = /[A-Za-z]{4,}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      const from = op.glyphs.findIndex((_, i) => s.slice(0, m!.index).replace(/\u0001/g, '').length === i);
      if (from < 0) continue;
      const to = from + m[0].length;
      if (op.glyphs.slice(from, to).every((g) => g.elem === op.glyphs[from].elem)) return { op, from, to, word: m[0] };
    }
  }
  return null;
}

export default defineWorker<SpikeBResult>(async (path) => {
  const bytes = new Uint8Array(readFileSync(path));
  const f = PdfFile.load(bytes);
  if (f.encrypted) throw new Error('encrypted');
  const page = f.pages()[0];
  const ex = new TextExtractor(f);
  const ops = ex.extractPage(page);
  const p = pick(ops);
  if (!p) return { status: 'no-candidate', ops: ops.length };
  const { op, from, to, word } = p;
  let newWord = [...word].reverse().join('');
  if (newWord === word) newWord = word.slice(1) + word[0];
  const plan = planReplace(op, from, to, newWord);
  const fontName = `${op.font!.subtype}${op.font!.embedded ? '' : '/noemb'} ${op.font!.baseFont}`;
  if (!plan.ok)
    return {
      status: 'plan-failed',
      reason: plan.reason,
      detail: plan.reason === 'missing-glyphs' ? plan.missing.join('') : plan.detail,
      font: fontName,
    };

  const update = new IncrementalUpdate(f);
  commitUnitEdits(update, plan.unit, [plan.edit]);
  const patched = update.build();

  const core = await loadCore();
  const render = (b: Uint8Array, L: number, B: number, R: number, T: number) => {
    const d = core.open(b);
    const pg = core.loadPage(d, 0);
    const img = core.render(pg, SCALE);
    const tp = core.loadTextPage(pg);
    const text = core
      .textChars(tp)
      .map((c) => String.fromCodePoint(c.unicode))
      .join('');
    core.closeTextPage(tp);
    const toDev = (x: number, y: number) => core.pageToDevice(pg, img.width, img.height, x, y);
    // user-space bbox → device-space bbox (4 corners; handles /Rotate and non-zero page-box origins)
    const devBox = (l: number, b: number, r: number, t: number) => {
      const pts = [toDev(l, b), toDev(r, b), toDev(l, t), toDev(r, t)];
      return {
        x0: Math.min(...pts.map((q) => q[0])),
        x1: Math.max(...pts.map((q) => q[0])),
        y0: Math.min(...pts.map((q) => q[1])),
        y1: Math.max(...pts.map((q) => q[1])),
      };
    };
    const box = devBox(L, B, R, T);
    core.closePage(pg);
    core.close(d);
    return { img, text, box };
  };
  // region = bbox of all glyph origins of the op ± generous margin (covers rotation / width change)
  const xs = op.glyphs.map((g) => g.x);
  const ys = op.glyphs.map((g) => g.y);
  const m = effectiveFontSize(op) * 2 + Math.abs(userDelta(op, plan)) + 6;
  const L = Math.min(...xs) - m;
  const R = Math.max(...xs) + m;
  const B = Math.min(...ys) - m;
  const T = Math.max(...ys) + m;
  render(bytes, L, B, R, T);
  const before = render(bytes, L, B, R, T);
  const after = render(patched, L, B, R, T);
  let inside = 0;
  let outside = 0;
  const w = before.img.width;
  for (let y = 0; y < before.img.height; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (
        before.img.data[i] === after.img.data[i] &&
        before.img.data[i + 1] === after.img.data[i + 1] &&
        before.img.data[i + 2] === after.img.data[i + 2]
      )
        continue;
      if (x >= before.box.x0 && x <= before.box.x1 && y >= before.box.y0 && y <= before.box.y1) inside++;
      else outside++;
    }
  const oldText = op.glyphs.map((g) => g.unicode).join('');
  const expected = oldText.slice(0, from) + newWord + oldText.slice(to);
  const f2 = PdfFile.load(patched);
  const ops2 = new TextExtractor(f2).extractPage(f2.pages()[0]);
  const op2 = ops2[ops.indexOf(op)];
  const reparseOk = !!op2 && op2.glyphs.map((g) => g.unicode).join('') === expected;
  const countFonts = (x: PdfFile) =>
    [...x.xref.keys()].filter((n) => {
      const o = x.getObject(n);
      return o instanceof Map && x.name(o.get('Type') ?? null) === 'Font';
    }).length;
  return {
    status: 'patched',
    font: fontName,
    inside,
    outside,
    textFound: after.text.includes(newWord),
    reparseOk,
    fontObjsBefore: countFonts(f),
    fontObjsAfter: countFonts(f2),
    growth: patched.length - bytes.length,
    unit: op.unit.kind,
  };
});
