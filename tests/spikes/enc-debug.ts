import { readFileSync } from 'node:fs';
import { loadCore } from '../helpers/node-core';
import { PdfFile } from '../../src/pdf/file';
const core = await loadCore();
for (const name of process.argv.slice(2)) {
  const bytes = new Uint8Array(readFileSync(`tests/corpus/external/${name}.pdf`));
  let first = 'ok';
  try {
    const f = PdfFile.load(bytes);
    first = `ok encrypted=${f.encrypted}`;
  } catch (e) {
    first = String(e).slice(0, 60);
  }
  const doc = core.open(bytes, '');
  const perms = core.permissions(doc);
  const enc = core.isEncrypted(doc);
  const removed = enc ? core.removeEncryption(doc) : false;
  const out = core.save(doc);
  core.close(doc);
  let second = 'ok';
  try {
    const f2 = PdfFile.load(out);
    second = `ok pages=${f2.pages().length} encrypted=${f2.encrypted} xref=${f2.xrefKind} repaired=${f2.repaired}`;
  } catch (e) {
    second = String(e).slice(0, 80);
  }
  const head = Buffer.from(out.subarray(0, 8)).toString('latin1').replace(/\n/g, ' ');
  const hasEncrypt = Buffer.from(out).toString('latin1').includes('/Encrypt');
  console.log(
    `${name}: ourParse(original)=${first} | pdfium pages=${core.open(out).pageCount} perms=0x${perms.toString(16)} enc=${enc} removed=${removed} | saved ${out.length}B head="${head}" has/Encrypt=${hasEncrypt} → ourParse(saved)=${second}`,
  );
}
