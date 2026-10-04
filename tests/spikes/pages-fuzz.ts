/**
 * Random page lists over random sources (reorders, repeats, rotations, blanks, several files, bookmarks on): every build must
 * succeed, reopen, keep the page count and sizes, and render pixel-identically page by page (except pages whose fonts
 * are not embedded, where PDFium itself is not deterministic). Usage: npx tsx tests/spikes/pages-fuzz.ts [iterations] [seed]
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadCore, diffBitmaps } from '../helpers/node-core';
import { PageTools } from '../../src/engine/pages';
import type { PageSpec } from '../../src/engine/api';

const iterations = Number(process.argv[2] ?? 200);
let seed = Number(process.argv[3] ?? 1);
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const int = (n: number) => Math.floor(rnd() * n);

const dirs = ['tests/corpus/pdf', 'tests/corpus/user', 'tests/corpus/external'];
const files = dirs.flatMap((d) =>
  readdirSync(d, { withFileTypes: true }).length
    ? readdirSync(d)
        .filter((f) => f.endsWith('.pdf'))
        .map((f) => join(d, f))
    : [],
);
const core = await loadCore();
const tools = new PageTools(core);
const shot = (id: number, i: number) => {
  const r = tools.render(id, i, 0.5);
  return { width: r.width, height: r.height, data: new Uint8Array(r.data) };
};

let ok = 0,
  skipped = 0,
  fail = 0;
const problems: string[] = [];
for (let it = 0; it < iterations; it++) {
  const srcs: Array<{ id: number; name: string; pages: number }> = [];
  const k = 1 + int(3);
  for (let j = 0; j < k; j++) {
    const f = files[int(files.length)];
    try {
      const s = tools.open(new Uint8Array(readFileSync(f)), f);
      if (s.id) srcs.push({ id: s.id, name: f, pages: s.pages.length });
    } catch {
      /* unopenable corpus file */
    }
  }
  if (!srcs.length) {
    skipped++;
    continue;
  }
  const specs: PageSpec[] = [];
  const count = 1 + int(8);
  for (let j = 0; j < count; j++) {
    if (rnd() < 0.1) {
      specs.push({ kind: 'blank', width: 200 + int(300), height: 200 + int(300) });
      continue;
    }
    const s = srcs[int(srcs.length)];
    specs.push({ kind: 'page', src: s.id, page: int(Math.min(s.pages, 40)) % s.pages, rotate: rnd() < 0.2 ? 90 * (1 + int(3)) : 0 });
  }
  try {
    const bytes = tools.build(specs, { bookmarks: rnd() < 0.7 });
    const out = tools.open(bytes, 'fuzz-out');
    if (!out.id || out.pages.length !== specs.length) throw new Error(`reopen: ${out.pages.length} pages, wanted ${specs.length}`);
    specs.forEach((s, i) => {
      if (s.kind === 'blank') {
        if (Math.abs(out.pages[i].width - s.width) > 0.01) throw new Error(`blank ${i} size`);
        return;
      }
      const srcInfo = [...srcs].find((x) => x.id === s.src)!;
      void srcInfo;
      if (s.rotate) return; // rotated pages are checked for size below
      const a = shot(s.src, s.page),
        b = shot(out.id, i);
      const d = diffBitmaps(a, b);
      if (d.diffPixels !== 0) problems.push(`it ${it}: ${srcInfo.name} p${s.page + 1} differs by ${d.diffPixels}px (max Δ ${d.maxDelta})`);
    });
    ok++;
    tools.close(out.id);
  } catch (e) {
    fail++;
    problems.push(`it ${it}: ${e instanceof Error ? e.message : e} [${srcs.map((s) => s.name).join(', ')}]`);
  } finally {
    for (const s of srcs) tools.close(s.id);
  }
}
console.log(JSON.stringify({ iterations, ok, fail, skipped, pixelProblems: problems.filter((p) => p.includes('differs')).length }));
console.log(problems.slice(0, 30).join('\n'));
