/** Validates src/pdf against PDFium over a corpus. Usage: tsx tests/spikes/pdf-layer.ts [external|pdf] */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runBatch } from '../helpers/batch';
import { CORPUS_DIR, writeOut } from '../helpers/node-core';
import type { PdfLayerResult } from './pdf-layer.worker';

const dirKey = process.argv[2] ?? 'external';
const dir = dirKey === 'pdf' ? CORPUS_DIR : join(CORPUS_DIR, '..', dirKey);
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.pdf'))
  .map((f) => join(dir, f));
const res = await runBatch<PdfLayerResult>(new URL('./pdf-layer.worker.ts', import.meta.url), files, { timeoutMs: 30000 });
const nm = (p: string) => p.split('/').pop()!;
const ok = res.filter((r) => r.ok) as Extract<(typeof res)[number], { ok: true }>[];
const bad = res.filter((r) => !r.ok) as Extract<(typeof res)[number], { ok: false }>[];
const cnt = (pred: (r: PdfLayerResult) => boolean) => ok.filter((r) => pred(r.result)).length;
console.log(`files=${res.length}  parsed=${ok.length}  parse-failed=${bad.length}`);
console.log(
  `encrypted=${cnt((r) => r.status === 'encrypted')}  repaired(xref rebuilt)=${cnt((r) => r.repaired)}  xref-streams=${cnt((r) => r.xref === 'stream')}`,
);
const mism = ok.filter((r) => r.result.status === 'ok' && r.result.pdfiumPages >= 0 && r.result.pages !== r.result.pdfiumPages);
console.log(`page-count mismatches vs PDFium: ${mism.length}`);
for (const r of mism.slice(0, 15)) console.log(`   ${nm(r.item).padEnd(44)} ours=${r.result.pages} pdfium=${r.result.pdfiumPages}`);
console.log(`content decode errors: ${cnt((r) => !!r.contentError)}`);
const ce = new Map<string, number>();
for (const r of ok) if (r.result.contentError) ce.set(r.result.contentError, (ce.get(r.result.contentError) ?? 0) + 1);
for (const [k, v] of [...ce].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`   ${String(v).padStart(3)}× ${k}`);
console.log(
  `incremental no-op round trip: identical=${cnt((r) => r.roundtrip === 'identical')} differs=${cnt((r) => r.roundtrip === 'differs')} error=${cnt((r) => r.roundtrip === 'error')} skipped=${cnt((r) => r.roundtrip === 'skipped')}`,
);
for (const r of ok.filter((x) => x.result.roundtrip === 'differs' || x.result.roundtrip === 'error').slice(0, 20))
  console.log(`   ${nm(r.item).padEnd(44)} ${r.result.roundtrip}: ${r.result.roundtripDetail}`);
console.log(`parse failures (first 20):`);
for (const r of bad.slice(0, 20)) console.log(`   ${nm(r.item).padEnd(44)} ${r.error.split('\n')[0].slice(0, 100)}`);
writeOut(
  `pdf-layer/${dirKey}.json`,
  JSON.stringify(
    { ok: ok.map((r) => ({ f: nm(r.item), ...r.result })), bad: bad.map((r) => ({ f: nm(r.item), e: r.error.split('\n')[0] })) },
    null,
    1,
  ),
);
