import { loadCore, diffBitmaps } from '../helpers/node-core';
import { defineWorker } from '../helpers/batch';
import { readFileSync } from 'node:fs';

export interface SpikeAResult {
  pages: number;
  tested: number;
  identical: number;
  worstPixels: number;
  worstDelta: number;
  worstPage: number;
  objects: number;
  inBytes: number;
  outBytes: number;
  genFailed: number;
}

const MAX_PAGES = 3;
const SCALE = 1.5;

export default defineWorker<SpikeAResult>(async (path) => {
  const core = await loadCore();
  const src = new Uint8Array(readFileSync(path));
  const doc = core.open(src);
  const tested = Math.min(doc.pageCount, MAX_PAGES);
  const before = [];
  let objects = 0;
  let genFailed = 0;
  for (let i = 0; i < tested; i++) {
    const page = core.loadPage(doc, i);
    before.push(core.render(page, SCALE));
    const n = core.countObjects(page);
    objects += n;
    for (let k = 0; k < n; k++) core.touch(core.getObject(page, k));
    if (!core.generateContent(page)) genFailed++;
    core.closePage(page);
  }
  const saved = core.save(doc);
  core.close(doc);

  const doc2 = core.open(saved);
  const r: SpikeAResult = {
    pages: doc2.pageCount,
    tested,
    identical: 0,
    worstPixels: 0,
    worstDelta: 0,
    worstPage: 0,
    objects,
    inBytes: src.length,
    outBytes: saved.length,
    genFailed,
  };
  for (let i = 0; i < tested; i++) {
    const page = core.loadPage(doc2, i);
    const after = core.render(page, SCALE);
    core.closePage(page);
    const d = diffBitmaps(before[i], after);
    if (d.diffPixels === 0) r.identical++;
    else if (d.diffPixels > r.worstPixels) {
      r.worstPixels = d.diffPixels;
      r.worstDelta = d.maxDelta;
      r.worstPage = i + 1;
    }
  }
  core.close(doc2);
  return r;
});
