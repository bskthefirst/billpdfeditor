import { readFileSync } from 'node:fs';
import { PdfFile } from '../../src/pdf/file';
import { isArray, isDict } from '../../src/pdf/objects';
const f = PdfFile.load(new Uint8Array(readFileSync(process.argv[2])));
const want = process.argv[3] ?? '';
const dump = (v: unknown): string =>
  v instanceof Map
    ? '<<' + [...v].map(([k, x]) => `/${k} ${dump(x)}`).join(' ') + '>>'
    : Array.isArray(v)
      ? '[' + v.map(dump).join(' ') + ']'
      : String(v);
for (const [n] of f.xref) {
  const o = f.getObject(n);
  if (isDict(o) && f.name(o.get('Type') ?? null) === 'Font' && (o.get('BaseFont') + '').includes(want)) {
    console.log(`obj ${n}:`, dump(o).slice(0, 300));
    const desc = f.resolve(o.get('DescendantFonts') ?? null);
    if (isArray(desc)) {
      const c = f.resolve(desc[0]);
      if (isDict(c)) console.log('  CIDFont:', dump(c).slice(0, 500));
    }
  }
}
