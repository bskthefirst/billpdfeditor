/** Usage: tsx tests/spikes/line-corpus.ts [external|pdf] */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runBatch } from '../helpers/batch';
import { CORPUS_DIR, writeOut } from '../helpers/node-core';
import type { LineCorpusResult } from './line-corpus.worker';

const dirKey = process.argv[2] ?? 'external';
const dir = dirKey === 'pdf' ? CORPUS_DIR : join(CORPUS_DIR, '..', dirKey);
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.pdf'))
  .map((f) => join(dir, f));
const res = await runBatch<LineCorpusResult>(new URL('./line-corpus.worker.ts', import.meta.url), files, {
  timeoutMs: 60000,
  concurrency: 4,
});
const nm = (p: string) => p.split('/').pop()!;
type OK = Extract<(typeof res)[number], { ok: true }>;
const ok = res.filter((r) => r.ok) as OK[];
const errs = res.filter((r) => !r.ok);
const edited = ok.filter((r) => r.result.status === 'edited') as Array<OK & { result: Extract<LineCorpusResult, { status: 'edited' }> }>;
const clean = edited.filter((r) => r.result.outside === 0 && r.result.textOk);
console.log(
  `files=${res.length} no-candidate=${ok.filter((r) => r.result.status === 'no-candidate').length} refused=${ok.filter((r) => r.result.status === 'refused').length} errors=${errs.length} edited=${edited.length}`,
);
console.log(`edited & clean (0 px outside the line band, text found): ${clean.length}/${edited.length}`);
console.log('\nNOT clean:');
for (const r of edited.filter((x) => !clean.includes(x)).slice(0, 40))
  console.log(
    `  ${nm(r.item).padEnd(40)} outside=${String(r.result.outside).padStart(6)} inside=${String(r.result.inside).padStart(5)} textOk=${r.result.textOk} lineLen=${r.result.lineLen}`,
  );
const ref = new Map<string, number>();
for (const r of ok)
  if (r.result.status === 'refused') ref.set(r.result.error.slice(0, 70), (ref.get(r.result.error.slice(0, 70)) ?? 0) + 1);
console.log(
  '\nrefused reasons:',
  [...ref]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([k, v]) => `${v}× ${k}`)
    .join(' | '),
);
console.log('\nerrors:');
for (const r of errs.slice(0, 12)) console.log(`  ${nm(r.item).padEnd(40)} ${(r as { error: string }).error.split('\n')[0].slice(0, 110)}`);
writeOut(
  `line-corpus/${dirKey}.json`,
  JSON.stringify(
    ok.map((r) => ({ f: nm(r.item), ...r.result })),
    null,
    1,
  ),
);
