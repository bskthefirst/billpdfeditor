/** Stress test of the line editor: one width-changing edit per file; nothing outside the line may change. */
import { readFileSync } from 'node:fs';
import { defineWorker } from '../helpers/batch';
import { makeSession } from '../helpers/node-session';
import { loadCore } from '../helpers/node-core';

export type LineCorpusResult =
  | { status: 'no-candidate'; lines: number }
  | { status: 'refused'; error: string }
  | { status: 'edited'; inside: number; outside: number; textOk: boolean; lineLen: number; shifted: boolean; growth: number };

const SCALE = 2;

export default defineWorker<LineCorpusResult>(async (path) => {
  const bytes = new Uint8Array(readFileSync(path));
  const s = await makeSession();
  const info = s.open(bytes);
  if (info.encrypted) throw new Error('encrypted');
  const lines = s.getLines(0);
  // a line with a word of 5+ letters somewhere not at the very start
  let pick: {
    id: string;
    text: string;
    at: number;
    word: string;
    width: number;
    ys: [number, number];
    xs: [number, number];
    size: number;
  } | null = null;
  for (const l of lines) {
    if (!l.editable || l.text.length < 10 || l.size < 4) continue;
    const m = /[A-Za-z]{5,}/.exec(l.text.slice(2));
    if (!m) continue;
    const at = m.index + 2;
    const xs = l.glyphs.map((g) => g[0]);
    const ys = l.glyphs.map((g) => g[1]);
    pick = {
      id: l.id,
      text: l.text,
      at,
      word: m[0],
      width: 0,
      size: l.size,
      xs: [Math.min(...xs), Math.max(...xs)],
      ys: [Math.min(...ys), Math.max(...ys)],
    };
    break;
  }
  if (!pick) return { status: 'no-candidate', lines: lines.length };
  const newText = pick.text.slice(0, pick.at + 2) + pick.text.slice(pick.at + 3); // drop one letter from the word
  const core = await loadCore();
  const render = (b: Uint8Array) => {
    const d = core.open(b);
    const pg = core.loadPage(d, 0);
    const img = core.render(pg, SCALE);
    const dev = (x: number, y: number) => core.pageToDevice(pg, img.width, img.height, x, y);
    const m = pick!.size * 2;
    const pts = [dev(pick!.xs[0] - m, pick!.ys[0] - m), dev(pick!.xs[1] + m * 4, pick!.ys[1] + m)];
    const tp = core.loadTextPage(pg);
    const text = core
      .textChars(tp)
      .map((c) => String.fromCodePoint(c.unicode))
      .join('');
    core.closeTextPage(tp);
    core.closePage(pg);
    core.close(d);
    return {
      img,
      text,
      box: {
        x0: Math.min(pts[0][0], pts[1][0]),
        x1: Math.max(pts[0][0], pts[1][0]),
        y0: Math.min(pts[0][1], pts[1][1]),
        y1: Math.max(pts[0][1], pts[1][1]),
      },
    };
  };
  render(bytes); // warm-up: PDFium's first render of a non-embedded font differs from later ones
  const before = render(bytes);
  const r = await s.setLineText(pick.id, newText);
  if (!r.ok) return { status: 'refused', error: r.error ?? (r.missing ? `missing ${r.missing.join('')}` : 'unknown') };
  const patched = s.save();
  render(patched); // same warm-up for the new document
  const after = render(patched);
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
  const flat = (t: string) => t.replace(/\s+/g, '');
  const expect = flat(newText).slice(0, 24);
  return {
    status: 'edited',
    inside,
    outside,
    textOk: after.text !== before.text || flat(after.text).includes(expect),
    lineLen: pick.text.length,
    shifted: after.text !== before.text,
    growth: patched.length - bytes.length,
  };
});
