import { readFileSync } from 'node:fs';
import { PdfFile } from '../../src/pdf/file';
const f = PdfFile.load(new Uint8Array(readFileSync(process.argv[2])));
const dump = (v: unknown, d = 0): string =>
  v instanceof Map
    ? '<<' + [...v].map(([k, x]) => `/${k} ${dump(x, d + 1)}`).join(' ') + '>>'
    : Array.isArray(v)
      ? '[' + v.map((x) => dump(x, d + 1)).join(' ') + ']'
      : String(v);
console.log('trailer', dump(f.trailer));
console.log('root', dump(f.catalog));
for (const [n] of [...f.xref].slice(0, 12)) console.log(n, dump(f.getObject(n)).slice(0, 220));
console.log('pages:', f.pages().length);
