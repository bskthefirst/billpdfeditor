import { readFileSync } from 'node:fs';
import { loadCore, diffBitmaps } from '../helpers/node-core';
const core = await loadCore();
for (const path of process.argv.slice(2)) {
  const bytes = new Uint8Array(readFileSync(path));
  const renders = [0, 1, 2].map(() => {
    const d = core.open(bytes);
    const p = core.loadPage(d, 0);
    const r = core.render(p, 1.25);
    core.closePage(p);
    core.close(d);
    return r;
  });
  console.log(
    path.split('/').pop(),
    'render#1 vs #2:',
    diffBitmaps(renders[0], renders[1]).diffPixels,
    'px;  #2 vs #3:',
    diffBitmaps(renders[1], renders[2]).diffPixels,
    'px',
  );
}
