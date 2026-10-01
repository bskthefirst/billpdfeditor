import { readFileSync } from 'node:fs';
import { loadCore } from '../helpers/node-core';
import { PdfFile } from '../../src/pdf/file';
for (const path of process.argv.slice(2)) {
  const bytes = new Uint8Array(readFileSync(path));
  const f = PdfFile.load(bytes);
  const p = f.pages()[0];
  const core = await loadCore();
  const doc = core.open(bytes);
  const pg = core.loadPage(doc, 0);
  const dump = (v: unknown): string =>
    v instanceof Map
      ? '<<' + [...v].map(([k, x]) => `/${k} ${dump(x)}`).join(' ') + '>>'
      : Array.isArray(v)
        ? '[' + v.map(dump).join(' ') + ']'
        : String(v);
  console.log(
    path.split('/').pop(),
    'media',
    p.mediaBox.join(' '),
    'crop',
    p.cropBox?.join(' ') ?? '-',
    'rotate',
    p.rotate,
    'userunit',
    dump(p.dict.get('UserUnit') ?? '-'),
    '| pdfium size',
    pg.width.toFixed(2),
    pg.height.toFixed(2),
  );
}
