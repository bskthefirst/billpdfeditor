/** Usage: tsx tests/spikes/spike-e.ts [external|pdf] */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runBatch } from '../helpers/batch';
import { CORPUS_DIR, writeOut } from '../helpers/node-core';
import type { SpikeEResult } from './spike-e.worker';

const dirKey = process.argv[2] ?? 'external';
const dir = dirKey === 'pdf' ? CORPUS_DIR : join(CORPUS_DIR, '..', dirKey);
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.pdf'))
  .map((f) => join(dir, f));
const res = await runBatch<SpikeEResult>(new URL('./spike-e.worker.ts', import.meta.url), files, { timeoutMs: 30000 });
const nm = (p: string) => p.split('/').pop()!;
const ok = res.filter((r) => r.ok) as Extract<(typeof res)[number], { ok: true }>[];
const bad = res.filter((r) => !r.ok);
const withText = ok.filter((r) => r.result.pdfiumChars > 0);
const tot = withText.reduce(
  (a, r) => ({
    c: a.c + r.result.pdfiumChars,
    o: a.o + r.result.matchedOrigin,
    b: a.b + r.result.matchedBoth,
    l: a.l + r.result.matchedLoose,
  }),
  { c: 0, o: 0, b: 0, l: 0 },
);
console.log(`files: ${res.length}  processed=${ok.length}  failed/skipped=${bad.length}  with-text=${withText.length}`);
console.log(`PDFium characters: ${tot.c}`);
console.log(`  origin within ${0.06}pt : ${tot.o} (${((100 * tot.o) / tot.c).toFixed(2)}%)`);
console.log(`  origin + unicode match : ${tot.b} (${((100 * tot.b) / tot.c).toFixed(2)}%)`);
console.log(`  origin within 1pt      : ${tot.l} (${((100 * tot.l) / tot.c).toFixed(2)}%)`);
const rate = (r: SpikeEResult) => r.matchedOrigin / Math.max(1, r.pdfiumChars);
const perfect = withText.filter((r) => rate(r.result) >= 0.999).length;
console.log(`files with ≥99.9% origin match: ${perfect}/${withText.length}`);
console.log(`\nWorst files by unmatched chars:`);
for (const r of [...withText]
  .sort((a, b) => b.result.pdfiumChars - b.result.matchedOrigin - (a.result.pdfiumChars - a.result.matchedOrigin))
  .slice(0, 30)) {
  const x = r.result;
  console.log(
    `  ${nm(r.item).padEnd(40)} chars=${String(x.pdfiumChars).padStart(5)} origin=${String(x.matchedOrigin).padStart(5)} loose=${String(x.matchedLoose).padStart(5)} ours=${String(x.ourGlyphs).padStart(5)} [${x.fontKinds.join(',')}] ${x.fontNotes.slice(0, 2).join(' | ').slice(0, 70)}`,
  );
}
writeOut(
  `spike-e/${dirKey}.json`,
  JSON.stringify(
    ok.map((r) => ({ f: nm(r.item), ...r.result })),
    null,
    1,
  ),
);

const agg = new Map<string, number>();
const byFont = new Map<string, number>();
for (const r of ok)
  for (const [k, v] of Object.entries(r.result.uniMismatch)) {
    agg.set(k, (agg.get(k) ?? 0) + v);
    const font = k.split(':')[0];
    byFont.set(font, (byFont.get(font) ?? 0) + v);
  }
console.log(
  '\nUnicode mismatches by font kind:',
  [...byFont]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}=${v}`)
    .join('  '),
);
console.log('Top mismatched pairs (ours→pdfium):');
for (const [k, v] of [...agg].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${String(v).padStart(5)}  ${k}`);
const uniFiles = ok
  .filter((r) => Object.keys(r.result.uniMismatch).length)
  .map((r) => [nm(r.item), Object.values(r.result.uniMismatch).reduce((a, b) => a + b, 0)] as const)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 12);
console.log('Files with most unicode mismatches:', uniFiles.map(([f, n]) => `${f}=${n}`).join('  '));
