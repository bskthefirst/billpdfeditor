import { readFileSync } from 'node:fs';
import { loadCore, diffBitmaps, writeOut, bitmapToPng } from '../helpers/node-core';
import { PdfFile } from '../../src/pdf/file';
import { IncrementalUpdate } from '../../src/pdf/writer';
import { PdfNewStream } from '../../src/pdf/objects';
const core = await loadCore();
const path = process.argv[2];
const mode = process.argv[3] ?? 'both';
const bytes = new Uint8Array(readFileSync(path));
const f = PdfFile.load(bytes);
const page = f.pages()[0];
const up = new IncrementalUpdate(f);
const s = f.contentStreams(page)[0];
if (mode === 'both' || mode === 'stream') {
  const d = new Map(s.stream.dict);
  d.delete('Filter');
  d.delete('DecodeParms');
  up.set(s.num, new PdfNewStream(d, f.decode(s.stream)));
}
if (mode === 'both' || mode === 'page') up.set(page.num, page.dict);
const out = up.build();
writeOut(`roundtrip-debug/${path.split('/').pop()}.${mode}.pdf`, out);
const r = (b: Uint8Array) => {
  const d = core.open(b);
  const p = core.loadPage(d, 0);
  const x = core.render(p, 1.25);
  core.closePage(p);
  core.close(d);
  return x;
};
r(bytes); // warm up PDFium's font mapper
const a = r(bytes),
  b = r(out);
console.log(path.split('/').pop(), mode, 'diff', diffBitmaps(a, b).diffPixels, 'px');
if (diffBitmaps(a, b).diffPixels) {
  writeOut('roundtrip-debug/a.png', bitmapToPng(a));
  writeOut('roundtrip-debug/b.png', bitmapToPng(b));
}
