/** Inspect one file: object histogram + before/after/diff PNGs of page 1 after full regeneration. */
import { basename } from 'node:path';
import { readFileSync } from 'node:fs';
import { loadCore, diffBitmaps, bitmapToPng, writeOut } from '../helpers/node-core';
import { ObjType } from '../../src/engine/core';

const core = await loadCore();
for (const path of process.argv.slice(2)) {
  const name = basename(path, '.pdf');
  const doc = core.open(new Uint8Array(readFileSync(path)));
  const page = core.loadPage(doc, 0);
  const before = core.render(page, 1.5);
  const hist: Record<string, number> = {};
  const fonts = new Set<string>();
  const tp = core.loadTextPage(page);
  const n = core.countObjects(page);
  for (let k = 0; k < n; k++) {
    const o = core.getObject(page, k);
    const t = core.objType(o);
    const label = Object.entries(ObjType).find(([, v]) => v === t)?.[0] ?? String(t);
    hist[label] = (hist[label] ?? 0) + 1;
    if (t === ObjType.Text) {
      const fi = core.fontInfo(core.fontOf(o));
      fonts.add(`${fi.baseName}${fi.embedded ? '' : '(not emb)'} tr=${core.renderMode(o)}`);
    }
    core.touch(o);
  }
  core.closeTextPage(tp);
  core.generateContent(page);
  core.closePage(page);
  const saved = core.save(doc);
  core.close(doc);
  const doc2 = core.open(saved);
  const page2 = core.loadPage(doc2, 0);
  const after = core.render(page2, 1.5);
  const d = diffBitmaps(before, after, { makePng: true });
  console.log(
    `${name}: objs=${JSON.stringify(hist)} fonts=[${[...fonts].slice(0, 4).join('; ')}] diff=${d.diffPixels}px maxΔ=${d.maxDelta}`,
  );
  writeOut(`spike-a-one/${name}.before.png`, bitmapToPng(before));
  writeOut(`spike-a-one/${name}.after.png`, bitmapToPng(after));
  if (d.png) writeOut(`spike-a-one/${name}.diff.png`, d.png);
}
