// macOS only: reads fonts from /System/Library/Fonts (nothing from them is committed). Not part of CI.
/**
 * Prototype of the font-fallback pipeline using the machine's real Georgia Bold as the "exact local font".
 * Ground truth: Chrome's own PDF of the same page with the new title typed natively.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadCore, readCorpus, diffBitmaps, bitmapToPng, writeOut } from '../helpers/node-core';
import { PdfFile } from '../../src/pdf/file';
import { TextExtractor } from '../../src/pdf/text';
import { planReplaceWithFonts, commitUnitEdits, userDelta, type SubstituteFont } from '../../src/pdf/patch';
import { IncrementalUpdate } from '../../src/pdf/writer';
import { ResourceEditor } from '../../src/pdf/resources';
import { parseSfnt } from '../../src/fonts/sfnt';
import { Subsetter } from '../../src/fonts/subset';
import { embedCidTrueType } from '../../src/fonts/embed';

const core = await loadCore();
const sub = await Subsetter.create(readFileSync(fileURLToPath(import.meta.resolve('harfbuzzjs/dist/harfbuzz-subset.wasm'))));
const fontBytes = new Uint8Array(readFileSync('/System/Library/Fonts/Supplemental/Georgia Bold.ttf'));
const sfnt = parseSfnt(fontBytes);

const bytes = readCorpus('chrome_basic.pdf');
const f = PdfFile.load(bytes);
const page = f.pages()[0];
const ops = new TextExtractor(f).extractPage(page);
const op = ops.find((o) =>
  o.glyphs
    .map((g) => g.unicode)
    .join('')
    .startsWith('Quarterly Report'),
)!;
console.log('editing op font:', op.font!.baseFont, op.fontSize, 'resName', op.font!.resName, 'elements', op.elements.length);

const newMiddle = 'Annual';
const from = 0;
const to = 9; // "Quarterly"
const update = new IncrementalUpdate(f);
const cps = [...newMiddle].map((c) => c.codePointAt(0)!);
const subset = sub.subset(fontBytes, cps);
const emb = embedCidTrueType(update, sfnt, subset, cps, 'Georgia-Bold');
const res = new ResourceEditor(f);
const resName = res.uniqueName(page);
res.addFont(page, resName, emb.ref);
const substitute: SubstituteFont = {
  resName,
  encode: (ch) => {
    const gid = emb.gids.get(ch.codePointAt(0)!);
    return gid === undefined ? null : Uint8Array.of(gid >> 8, gid & 255);
  },
  advance: (ch) => emb.widths.get(ch.codePointAt(0)!) ?? 0,
};
const plan = planReplaceWithFonts(op, from, to, [{ font: substitute, text: newMiddle }]);
if (!plan.ok) throw new Error(JSON.stringify(plan));
console.log('replacement bytes:', Buffer.from(plan.edit.bytes).toString('latin1').replace(/\n/g, ' ⏎ '));
console.log('deltaWidth', userDelta(op, plan).toFixed(3), 'pt');
commitUnitEdits(update, plan.unit, [plan.edit]);
res.apply(update);
const patched = update.build();
writeOut('fallback-proto/patched.pdf', patched);
console.log('patched', bytes.length, '→', patched.length, 'bytes; new font objects embedded:', emb.baseName);

const render = (b: Uint8Array) => {
  const d = core.open(b);
  const p = core.loadPage(d, 0);
  const img = core.render(p, 3);
  const tp = core.loadTextPage(p);
  const text = core
    .textChars(tp)
    .map((c) => String.fromCodePoint(c.unicode))
    .join('');
  core.closeTextPage(tp);
  core.closePage(p);
  core.close(d);
  return { img, text };
};
render(bytes);
const mine = render(patched);
const truth = render(new Uint8Array(readFileSync('tests/out/ground-truth/annual.pdf')));
console.log('PDFium text of patched PDF starts with:', JSON.stringify(mine.text.slice(0, 24)));
const d = diffBitmaps(mine.img, truth.img, { makePng: true });
// restrict to the title band (top ~160 px at 3x) vs the rest
let title = 0,
  rest = 0;
for (let y = 0; y < mine.img.height; y++)
  for (let x = 0; x < mine.img.width; x++) {
    const i = (y * mine.img.width + x) * 4;
    if (
      mine.img.data[i] !== truth.img.data[i] ||
      mine.img.data[i + 1] !== truth.img.data[i + 1] ||
      mine.img.data[i + 2] !== truth.img.data[i + 2]
    ) {
      if (y < 330) title++;
      else rest++;
    }
  }
console.log(
  `patched vs Chrome-native "Annual Report 2026": ${d.diffPixels} pixels differ (title band ${title}, rest of page ${rest}), maxΔ=${d.maxDelta}`,
);
if (d.png) writeOut('fallback-proto/diff.png', d.png);
writeOut('fallback-proto/mine.png', bitmapToPng(mine.img));
writeOut('fallback-proto/truth.png', bitmapToPng(truth.img));
