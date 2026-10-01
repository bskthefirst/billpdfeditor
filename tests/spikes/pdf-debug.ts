import { readFileSync } from 'node:fs';
import { PdfFile } from '../../src/pdf/file';
const path = process.argv[2];
const bytes = new Uint8Array(readFileSync(path));
const f = PdfFile.load(bytes);
console.log('repaired', f.repaired, 'xrefKind', f.xrefKind, 'startxref', f.startxref, 'size', bytes.length);
const pages = f.pages();
const p = pages[0];
console.log('page obj', p.num, 'keys', [...p.dict.keys()].join(','));
const cs = f.contentStreams(p);
for (const s of cs) {
  const d = [...s.stream.dict.entries()].map(([k, v]) => `${k}=${String(v)}`).join(' ');
  const dec = f.decode(s.stream);
  console.log('stream obj', s.num, d, 'raw', s.stream.raw.length, 'decoded', dec.length);
  console.log(Buffer.from(dec).toString('latin1').slice(0, 300).replace(/\n/g, '\\n'));
}
const tail = Buffer.from(bytes.subarray(Math.max(0, bytes.length - 200))).toString('latin1');
console.log('--- tail ---\n' + tail);
