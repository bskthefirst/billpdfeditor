/** Usage: tsx tests/spikes/spike-b-corpus.ts [external|pdf] */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runBatch } from '../helpers/batch';
import { CORPUS_DIR, writeOut } from '../helpers/node-core';
import type { SpikeBResult } from './spike-b.worker';

const dirKey = process.argv[2] ?? 'external';
const dir = dirKey === 'pdf' ? CORPUS_DIR : join(CORPUS_DIR, '..', dirKey);
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.pdf'))
  .map((f) => join(dir, f));
const res = await runBatch<SpikeBResult>(new URL('./spike-b.worker.ts', import.meta.url), files, { timeoutMs: 40000 });
const nm = (p: string) => p.split('/').pop()!;
type OK = Extract<(typeof res)[number], { ok: true }>;
const ok = res.filter((r) => r.ok) as OK[];
const errs = res.filter((r) => !r.ok) as Extract<(typeof res)[number], { ok: false }>[];
const patched = ok.filter((r) => r.result.status === 'patched') as Array<OK & { result: Extract<SpikeBResult, { status: 'patched' }> }>;
const clean = patched.filter(
  (r) => r.result.outside === 0 && r.result.textFound && r.result.reparseOk && r.result.fontObjsBefore === r.result.fontObjsAfter,
);
console.log(
  `files=${res.length}  no-candidate=${ok.filter((r) => r.result.status === 'no-candidate').length}  plan-failed=${ok.filter((r) => r.result.status === 'plan-failed').length}  errors=${errs.length}  patched=${patched.length}`,
);
console.log(`patched & fully verified (0 px outside, text found, re-parse ok, no new fonts): ${clean.length}/${patched.length}`);
const bad = patched.filter((r) => !clean.includes(r));
console.log(`\nNOT clean (${bad.length}):`);
for (const r of bad.slice(0, 40)) {
  const x = r.result;
  console.log(
    `  ${nm(r.item).padEnd(40)} outside=${String(x.outside).padStart(6)} inside=${String(x.inside).padStart(5)} text=${x.textFound} reparse=${x.reparseOk} fonts ${x.fontObjsBefore}→${x.fontObjsAfter} unit=${x.unit} ${x.font.slice(0, 40)}`,
  );
}
const pf = new Map<string, number>();
for (const r of ok)
  if (r.result.status === 'plan-failed')
    pf.set(`${r.result.reason}: ${r.result.detail.slice(0, 20)}`, (pf.get(`${r.result.reason}: ${r.result.detail.slice(0, 20)}`) ?? 0) + 1);
console.log(
  '\nplan-failed reasons:',
  [...pf]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([k, v]) => `${v}× ${k}`)
    .join(' | '),
);
console.log('errors:');
for (const r of errs.slice(0, 12)) console.log(`  ${nm(r.item).padEnd(40)} ${r.error.split('\n')[0].slice(0, 110)}`);
writeOut(
  `spike-b/${dirKey}.json`,
  JSON.stringify(
    ok.map((r) => ({ f: nm(r.item), ...r.result })),
    null,
    1,
  ),
);
