/**
 * Spike B′ — replace a word by rewriting only the string operand of the original Tj/TJ (same font, same state),
 * save as an incremental update, and verify against PDFium: identical pixels outside the edited line, new text present.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { loadCore, diffBitmaps, bitmapToPng, writeOut } from '../helpers/node-core';
import { PdfFile } from '../../src/pdf/file';
import { TextExtractor, type ShowOp } from '../../src/pdf/text';
import { planReplace, commitUnitEdits, userDelta } from '../../src/pdf/patch';
import { IncrementalUpdate } from '../../src/pdf/writer';

const core = await loadCore();
const SCALE = 3;

function pickWord(ops: ShowOp[]): { op: ShowOp; from: number; to: number; word: string } | null {
  for (const op of ops) {
    if (!op.font || op.font.subtype === 'Type3' || op.glyphs.length < 12) continue;
    const s = op.glyphs.map((g) => g.unicode || '\u0000').join('');
    const m = /[A-Za-z]{5,}/.exec(s.slice(3)); // skip the very start so a prefix survives
    if (m) {
      const from = m.index + 3;
      if (op.glyphs.slice(from, from + m[0].length).every((g) => g.unicode.length === 1))
        return { op, from, to: from + m[0].length, word: m[0] };
    }
  }
  return null;
}

for (const path of process.argv.slice(2)) {
  const name = basename(path, '.pdf');
  const bytes = new Uint8Array(readFileSync(path));
  const f = PdfFile.load(bytes);
  const ops = new TextExtractor(f).extractPage(f.pages()[0]);
  const pick = pickWord(ops);
  if (!pick) {
    console.log(`${name}: no suitable word`);
    continue;
  }
  const { op, from, to, word } = pick;
  const newWord = [...word].reverse().join(''); // only letters that already exist in the (subset) font
  const plan = planReplace(op, from, to, newWord);
  if (!plan.ok) {
    console.log(`${name}: plan failed ${JSON.stringify(plan)}`);
    continue;
  }
  const update = new IncrementalUpdate(f);
  commitUnitEdits(update, plan.unit, [plan.edit]);
  const patched = update.build();
  writeOut(`spike-b/${name}.patched.pdf`, patched);

  // render fresh docs (warm-up first: PDFium's first load differs for non-embedded fonts)
  const render = (b: Uint8Array) => {
    const d = core.open(b);
    const p = core.loadPage(d, 0);
    const img = core.render(p, SCALE);
    const tp = core.loadTextPage(p);
    const chars = core.textChars(tp);
    core.closeTextPage(tp);
    const h = p.height;
    core.closePage(p);
    core.close(d);
    return { img, text: chars.map((c) => String.fromCodePoint(c.unicode)).join(''), h };
  };
  render(bytes);
  const before = render(bytes);
  const after = render(patched);

  // the edited line's region (user space → pixels), generously padded; everything outside must be identical
  const g0 = op.glyphs[0];
  const gl = op.glyphs[op.glyphs.length - 1];
  const x0 = Math.min(g0.x, gl.x) - 4;
  const x1 = Math.max(g0.x, gl.x) + op.fontSize * 2 + Math.abs(userDelta(op, plan)) + 8;
  const yTop = g0.y + op.fontSize * 1.2;
  const yBot = g0.y - op.fontSize * 0.5;
  const px = (x: number) => Math.round(x * SCALE);
  const py = (y: number) => Math.round((before.h - y) * SCALE);
  const region = { l: px(x0), r: px(x1), t: py(yTop), b: py(yBot) };
  let outside = 0;
  let inside = 0;
  for (let y = 0; y < before.img.height; y++)
    for (let x = 0; x < before.img.width; x++) {
      const i = (y * before.img.width + x) * 4;
      const d =
        before.img.data[i] !== after.img.data[i] ||
        before.img.data[i + 1] !== after.img.data[i + 1] ||
        before.img.data[i + 2] !== after.img.data[i + 2];
      if (!d) continue;
      if (x >= region.l && x <= region.r && y >= region.t && y <= region.b) inside++;
      else outside++;
    }
  const dd = diffBitmaps(before.img, after.img, { makePng: true });
  const total = dd.diffPixels;
  if (dd.png) writeOut(`spike-b/${name}.diff.png`, dd.png);

  const oldText = op.glyphs.map((g) => g.unicode).join('');
  const hasNew = after.text.includes(oldText.slice(0, from) + newWord);
  const hasOld = after.text.includes(oldText.slice(0, from) + word);
  // re-extract with OUR interpreter from the patched bytes
  const f2 = PdfFile.load(patched);
  const ops2 = new TextExtractor(f2).extractPage(f2.pages()[0]);
  const same = ops2.length === ops.length;
  const op2 = ops2[ops.indexOf(op)];
  const reText = op2 ? op2.glyphs.map((g) => g.unicode).join('') : '(missing)';
  const fontObjs = (b: PdfFile) =>
    [...b.xref.keys()].filter((n) => {
      const o = b.getObject(n);
      return o instanceof Map && b.name(o.get('Type') ?? null) === 'Font';
    }).length;

  console.log(
    `\n${name}: font=${op.font!.baseFont} (${op.font!.subtype}${op.font!.embedded ? ', embedded' : ', not embedded'}) fs=${op.fontSize}`,
  );
  console.log(
    `  "${word}" → "${newWord}"  glyphs ${from}..${to}   Δwidth=${userDelta(op, plan).toFixed(2)}pt   file ${bytes.length}→${patched.length} bytes (+${patched.length - bytes.length})`,
  );
  console.log(`  pixels changed: ${inside} inside edited line, ${outside} OUTSIDE (must be 0)  [total ${total}]`);
  console.log(
    `  PDFium text has new word: ${hasNew}   still has old word: ${hasOld}   our re-parse: "${reText.slice(Math.max(0, from - 2), from + newWord.length + 3)}" ops same count: ${same}`,
  );
  console.log(`  font objects: ${fontObjs(f)} → ${fontObjs(f2)} (must be equal)`);
  // side-by-side crop for eyeballing
  writeOut(`spike-b/${name}.before.png`, bitmapToPng(before.img));
  writeOut(`spike-b/${name}.after.png`, bitmapToPng(after.img));
}
