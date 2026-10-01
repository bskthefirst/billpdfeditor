import { readFileSync } from 'node:fs';
import { loadCore, diffBitmaps } from '../helpers/node-core';
const core = await loadCore();
const src = new Uint8Array(readFileSync(process.argv[2]));
const doc = core.open(src);
const page = core.loadPage(doc, 0);
const before = core.render(page, 1.5);
const n = core.countObjects(page);
for (let k = 0; k < n; k++) core.touch(core.getObject(page, k));
core.generateContent(page);
core.closePage(page);
const saved = core.save(doc);
const text = (b: Uint8Array) => Buffer.from(b).toString('latin1');
const countOp = (s: string, re: RegExp) => (s.match(re) ?? []).length;
const s0 = text(src),
  s1 = text(saved);
for (const [label, re] of [
  ['k (CMYK fill)', /\d \d?\.?\d* \d?\.?\d* \d?\.?\d* k\b/g],
  ['rg (RGB fill)', / rg\b/g],
  ['sh (shading)', /\bsh\b/g],
  ['scn/cs (spot/pattern)', /\bscn\b/g],
] as const) {
  console.log(`${label.padEnd(24)} original=${countOp(s0, re)}  regenerated=${countOp(s1, re)}`);
}
const doc2 = core.open(saved);
const p2 = core.loadPage(doc2, 0);
const d = diffBitmaps(before, core.render(p2, 1.5));
console.log(`pixel diff after regeneration: ${d.diffPixels}px, maxΔ=${d.maxDelta}`);
import { writeOut } from '../helpers/node-core';
writeOut('spike-a-detail/saved.pdf', saved);
