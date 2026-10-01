/** Spike A over a whole directory. Usage: tsx tests/spikes/spike-a-corpus.ts [external|pdf] */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runBatch } from '../helpers/batch';
import { CORPUS_DIR, writeOut } from '../helpers/node-core';
import type { SpikeAResult } from './spike-a.worker';

const dirKey = process.argv[2] ?? 'external';
const dir = dirKey === 'pdf' ? CORPUS_DIR : join(CORPUS_DIR, '..', dirKey);
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.pdf'))
  .map((f) => join(dir, f));
console.log(`Spike A over ${files.length} PDFs in ${dir}`);
const t0 = Date.now();
const res = await runBatch<SpikeAResult>(new URL('./spike-a.worker.ts', import.meta.url), files, {
  timeoutMs: 30000,
  onProgress: (d, t) => d % 100 === 0 && console.log(`  ${d}/${t}`),
});
const name = (p: string) => p.split('/').pop()!;
const ok = res.filter((r) => r.ok) as Extract<(typeof res)[number], { ok: true }>[];
const err = res.filter((r) => !r.ok) as Extract<(typeof res)[number], { ok: false }>[];
const identical = ok.filter((r) => r.result.identical === r.result.tested);
const differs = ok.filter((r) => r.result.identical !== r.result.tested).sort((a, b) => b.result.worstPixels - a.result.worstPixels);
const pages = ok.reduce((s, r) => s + r.result.tested, 0);
const identPages = ok.reduce((s, r) => s + r.result.identical, 0);
console.log(`\ndone in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.log(`files: ${ok.length} processed, ${err.length} errored/timeouts`);
console.log(`pages: ${identPages}/${pages} identical (${((100 * identPages) / pages).toFixed(2)}%)`);
console.log(`files fully identical: ${identical.length}/${ok.length}`);
console.log(`\nTop differing files (worst page pixels, maxΔ):`);
for (const r of differs.slice(0, 40))
  console.log(
    `  ${name(r.item).padEnd(52)} p${r.result.worstPage} ${String(r.result.worstPixels).padStart(8)}px  Δ${r.result.worstDelta}  (${r.result.identical}/${r.result.tested} ok)`,
  );
console.log(`\nErrors (first 25):`);
for (const r of err.slice(0, 25)) console.log(`  ${name(r.item).padEnd(52)} ${r.error.split('\n')[0].slice(0, 90)}`);
writeOut(
  `spike-a/${dirKey}.json`,
  JSON.stringify(
    { ok: ok.map((r) => ({ f: name(r.item), ...r.result })), err: err.map((r) => ({ f: name(r.item), e: r.error.split('\n')[0] })) },
    null,
    1,
  ),
);
