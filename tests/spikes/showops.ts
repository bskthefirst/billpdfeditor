import { readFileSync } from 'node:fs';
import { PdfFile } from '../../src/pdf/file';
import { TextExtractor } from '../../src/pdf/text';
import { parseContent } from '../../src/pdf/content';
const f = PdfFile.load(new Uint8Array(readFileSync(process.argv[2])));
const page = f.pages()[Number(process.argv[3] ?? 0)];
const n = Number(process.argv[4] ?? 6);
const ex = new TextExtractor(f, { pdfiumWidths: true });
const ops = ex.extractPage(page);
const fmt = (m: number[]) => m.map((x) => +x.toFixed(3)).join(' ');
for (const o of ops.slice(0, n)) {
  const bytes = o.unit.bytes;
  console.log(
    `${o.op} font=${o.font?.baseFont} fs=${o.fontSize} tm=[${fmt(o.tm)}] ctm=[${fmt(o.ctm)}] rise=${o.rise} tc=${o.tc} tw=${o.tw} th=${o.th} tr=${o.renderMode}\n   first glyph origin=(${o.glyphs[0]?.x.toFixed(3)}, ${o.glyphs[0]?.y.toFixed(3)})  src: ${Buffer.from(
      bytes.subarray(o.start, Math.min(o.end, o.start + 90)),
    )
      .toString('latin1')
      .replace(/\s+/g, ' ')}`,
  );
}
void parseContent;
