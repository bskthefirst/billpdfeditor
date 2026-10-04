/**
 * Fidelity check for the page tools over a corpus: for every PDF, copy (a) each of up to 4 sample pages alone and
 * (b) the whole document, and compare the renders with the originals (threshold 0) plus page counts and sizes.
 * Usage: npx tsx tests/spikes/pages-corpus.ts [dir] [limit]
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadCore, diffBitmaps } from '../helpers/node-core';
import { PageTools } from '../../src/engine/pages';

const dir = process.argv[2] ?? 'tests/corpus/external';
const limit = Number(process.argv[3] ?? 100000);
const core = await loadCore();
const tools = new PageTools(core);
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.pdf'))
  .sort()
  .slice(0, limit);

const shot = (id: number, i: number, scale = 1) => {
  const r = tools.render(id, i, scale);
  return { width: r.width, height: r.height, data: new Uint8Array(r.data) };
};

const stats = {
  files: 0,
  opened: 0,
  skipped: 0,
  pagesChecked: 0,
  identical: 0,
  diff: 0,
  sizeDiff: 0,
  buildErr: 0,
  wholeOk: 0,
  wholeBad: 0,
  outShrunk: 0,
  outGrew: 0,
};
const failures: string[] = [];
const t0 = Date.now();
for (const f of files) {
  stats.files++;
  const bytes = new Uint8Array(readFileSync(join(dir, f)));
  let src;
  try {
    src = tools.open(bytes, f);
  } catch {
    stats.skipped++;
    continue;
  }
  if (!src.id) {
    stats.skipped++;
    continue;
  }
  stats.opened++;
  const n = src.pages.length;
  const picks = [...new Set([0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1])].filter((i) => i >= 0 && i < n);
  try {
    // (a) single pages
    for (const p of picks) {
      let out;
      try {
        const copy = tools.build([{ kind: 'page', src: src.id, page: p }]);
        out = tools.open(copy, 'copy');
        if (!out.id) throw new Error('copy did not reopen');
      } catch (e) {
        stats.buildErr++;
        failures.push(`${f} p${p + 1}: build/reopen failed: ${e instanceof Error ? e.message : e}`);
        continue;
      }
      stats.pagesChecked++;
      const a = src.pages[p],
        b = out.pages[0];
      if (Math.abs(a.width - b.width) > 0.01 || Math.abs(a.height - b.height) > 0.01 || a.rotate !== b.rotate) {
        stats.sizeDiff++;
        failures.push(`${f} p${p + 1}: size/rotation changed ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
      } else {
        const d = diffBitmaps(shot(src.id, p), shot(out.id, 0));
        if (d.diffPixels === 0) stats.identical++;
        else {
          stats.diff++;
          failures.push(`${f} p${p + 1}: ${d.diffPixels} px differ (max Δ ${d.maxDelta})`);
        }
      }
      tools.close(out.id);
    }
    // (b) the whole document as a "clean save"
    if (n <= 60) {
      const all = Array.from({ length: n }, (_, i) => ({ kind: 'page' as const, src: src.id, page: i }));
      const copy = tools.build(all);
      const out = tools.open(copy, 'whole');
      let ok = out.id !== 0 && out.pages.length === n;
      if (ok) for (const p of picks) if (diffBitmaps(shot(src.id, p), shot(out.id, p)).diffPixels !== 0) ok = false;
      if (ok) stats.wholeOk++;
      else {
        stats.wholeBad++;
        failures.push(`${f}: whole-document copy differs (pages ${out.pages.length}/${n})`);
      }
      if (copy.length <= bytes.length) stats.outShrunk++;
      else stats.outGrew++;
      tools.close(out.id);
    }
  } catch (e) {
    failures.push(`${f}: ${e instanceof Error ? e.message : e}`);
  } finally {
    tools.close(src.id);
  }
}
mkdirSync('tests/out', { recursive: true });
writeFileSync('tests/out/pages-corpus.txt', failures.join('\n'));
console.log(JSON.stringify(stats), `${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(failures.slice(0, 40).join('\n'));
console.log(failures.length > 40 ? `… ${failures.length - 40} more in tests/out/pages-corpus.txt` : '');
