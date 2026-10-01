/**
 * Spike A — how faithful is PDFium's content-stream regeneration?
 * Worst case: mark EVERY top-level page object dirty, regenerate, save, reload, re-render, compare pixels.
 */
import { loadCore, corpusFiles, readCorpus, diffBitmaps, writeOut } from '../helpers/node-core';

const core = await loadCore();
const SCALE = 2;
let totalPages = 0;
let identicalPages = 0;
const rows: string[] = [];

for (const file of corpusFiles()) {
  const src = readCorpus(file);
  const doc = core.open(src);
  const before: ReturnType<typeof core.render>[] = [];
  const counts: number[] = [];
  for (let i = 0; i < doc.pageCount; i++) {
    const page = core.loadPage(doc, i);
    before.push(core.render(page, SCALE));
    const n = core.countObjects(page);
    counts.push(n);
    for (let k = 0; k < n; k++) core.touch(core.getObject(page, k));
    if (!core.generateContent(page)) console.warn(`  GenerateContent failed on ${file} p${i + 1}`);
    core.closePage(page);
  }
  const saved = core.save(doc);
  core.close(doc);

  const doc2 = core.open(saved);
  let worst = { pixels: 0, delta: 0, page: -1 };
  let ident = 0;
  for (let i = 0; i < doc2.pageCount; i++) {
    const page = core.loadPage(doc2, i);
    const after = core.render(page, SCALE);
    core.closePage(page);
    const d = diffBitmaps(before[i], after, { makePng: true });
    totalPages++;
    if (d.diffPixels === 0) {
      ident++;
      identicalPages++;
    } else {
      if (d.diffPixels > worst.pixels) worst = { pixels: d.diffPixels, delta: d.maxDelta, page: i + 1 };
      if (d.png && i < 3) writeOut(`spike-a/${file}.p${i + 1}.diff.png`, d.png);
    }
  }
  core.close(doc2);
  rows.push(
    `${file.padEnd(24)} pages=${String(doc2.pageCount).padStart(3)} objs(p1)=${String(counts[0]).padStart(4)} ` +
      `${(src.length / 1024).toFixed(0).padStart(5)}KB→${(saved.length / 1024).toFixed(0).padStart(5)}KB  ` +
      `identical=${ident}/${doc2.pageCount}` +
      (worst.page > 0 ? `  worst: p${worst.page} ${worst.pixels}px differ (maxΔ=${worst.delta})` : ''),
  );
}
console.log(rows.join('\n'));
console.log(`\nSpike A: ${identicalPages}/${totalPages} pages pixel-identical after full regeneration`);
