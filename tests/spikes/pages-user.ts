/** Split/merge checks on the user's own PDFs (tests/corpus/user, git-ignored). Prints counts and timings only. */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadCore, diffBitmaps } from '../helpers/node-core';
import { PageTools } from '../../src/engine/pages';
const dir = 'tests/corpus/user';
const core = await loadCore();
const tools = new PageTools(core);
const ms = (t: number) => `${(performance.now() - t).toFixed(0)}ms`;
for (const f of readdirSync(dir)
  .filter((x) => x.endsWith('.pdf'))
  .sort()) {
  const bytes = new Uint8Array(readFileSync(join(dir, f)));
  let t = performance.now();
  const src = tools.open(bytes, f);
  const tOpen = ms(t);
  const n = src.pages.length;
  t = performance.now();
  const outline = tools.outline(src.id);
  const tOutline = ms(t);
  const shot = (id: number, i: number) => {
    const r = tools.render(id, i, 1);
    return { width: r.width, height: r.height, data: new Uint8Array(r.data) };
  };
  const picks = [0, Math.floor(n / 2), n - 1];
  t = performance.now();
  const part = tools.build(picks.map((page) => ({ kind: 'page' as const, src: src.id, page })));
  const tPart = ms(t);
  const po = tools.open(part, 'part');
  const same = picks.every((p, i) => diffBitmaps(shot(src.id, p), shot(po.id, i)).diffPixels === 0);
  t = performance.now();
  const all = tools.build(Array.from({ length: n }, (_, page) => ({ kind: 'page' as const, src: src.id, page })));
  const tAll = ms(t);
  const ao = tools.open(all, 'all');
  const sameAll = ao.pages.length === n && picks.every((p) => diffBitmaps(shot(src.id, p), shot(ao.id, p)).diffPixels === 0);
  // every-10-pages split of the whole document (what "Every N pages" does)
  t = performance.now();
  let parts = 0,
    bytesTotal = 0;
  for (let a = 0; a < n; a += 10) {
    const b = tools.build(Array.from({ length: Math.min(10, n - a) }, (_, k) => ({ kind: 'page' as const, src: src.id, page: a + k })));
    parts++;
    bytesTotal += b.length;
  }
  const tSplit = ms(t);
  console.log(
    `${f.padEnd(28)} ${String(n).padStart(3)}p ${(bytes.length / 1e6).toFixed(1)}MB | open ${tOpen}, outline ${outline.length} (${tOutline}) | 3 pages ${tPart} ${same ? 'identical' : 'DIFFERENT'} (${(part.length / 1e3).toFixed(0)}KB) | whole ${tAll} ${sameAll ? 'identical' : 'DIFFERENT'} (${(all.length / 1e6).toFixed(1)}MB) | ${parts} parts of 10: ${tSplit}, total ${(bytesTotal / 1e6).toFixed(1)}MB`,
  );
}
