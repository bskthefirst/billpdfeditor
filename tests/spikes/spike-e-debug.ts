import { readFileSync } from 'node:fs';
import { loadCore } from '../helpers/node-core';
import { PdfFile } from '../../src/pdf/file';
import { TextExtractor } from '../../src/pdf/text';
const path = process.argv[2];
const pageIdx = Number(process.argv[3] ?? 0);
const limit = Number(process.argv[4] ?? 25);
const bytes = new Uint8Array(readFileSync(path));
const f = PdfFile.load(bytes);
const core = await loadCore();
const doc = core.open(bytes);
const ops = new TextExtractor(f, { pdfiumWidths: true }).extractPage(f.pages()[pageIdx]);
const glyphs = ops.flatMap((o) => o.glyphs.map((g) => ({ g, o })));
const page = core.loadPage(doc, pageIdx);
const tp = core.loadTextPage(page);
const chars = core.textChars(tp).filter((c) => !c.generated && c.unicode > 32);
let shown = 0;
for (const c of chars) {
  let best: (typeof glyphs)[number] | null = null,
    bd = 1e9;
  for (const q of glyphs) {
    const d = Math.hypot(q.g.x - c.x, q.g.y - c.y);
    if (d < bd) {
      bd = d;
      best = q;
    }
  }
  if (best && bd > 0.06 && shown++ < limit) {
    const o = best.o;
    console.log(
      `'${String.fromCharCode(c.unicode)}' pdfium=(${c.x.toFixed(3)},${c.y.toFixed(3)}) ours=(${best.g.x.toFixed(3)},${best.g.y.toFixed(3)}) d=${bd.toFixed(3)} dx=${(best.g.x - c.x).toFixed(3)} fs=${o.fontSize} tc=${o.tc} tw=${o.tw} th=${o.th} font=${o.font?.baseFont} code=${best.g.code}`,
    );
  }
}
