/**
 * Checks the editor against your own PDFs in tests/corpus/user (git-ignored). Prints aggregates only — never document text.
 * Usage: npx tsx tests/spikes/user-corpus.ts
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeSession } from '../helpers/node-session';
import { CORPUS_DIR } from '../helpers/node-core';

const dir = join(CORPUS_DIR, '..', 'user');
const files = readdirSync(dir)
  .filter((f) => f.toLowerCase().endsWith('.pdf'))
  .sort();
const SCALE = 2;
const median = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : 0);
const ms = (t: number) => Math.round(performance.now() - t);

for (const file of files) {
  const bytes = new Uint8Array(readFileSync(join(dir, file)));
  const s = await makeSession();
  let t = performance.now();
  const info = s.open(bytes);
  const openMs = ms(t);
  const n = info.pages.length;
  const sample = [
    ...new Set(Array.from({ length: Math.min(8, n) }, (_, i) => Math.floor((i * (n - 1)) / Math.max(1, Math.min(8, n) - 1)))),
  ];

  let lines = 0;
  let editable = 0;
  const reasons = new Map<string, number>();
  const fonts = new Map<string, number>();
  const lineMs: number[] = [];
  const editMs: number[] = [];
  let tried = 0;
  let clean = 0;
  let refused = 0;
  let outsideTotal = 0;
  const refusals = new Map<string, number>();

  for (const p of sample) {
    t = performance.now();
    const ls = s.getLines(p);
    lineMs.push(ms(t));
    for (const l of ls) {
      lines++;
      if (l.editable) editable++;
      else reasons.set((l.reason ?? 'unknown').slice(0, 60), (reasons.get((l.reason ?? 'unknown').slice(0, 60)) ?? 0) + 1);
      const k = `${l.font.subtype || '?'}${l.font.embedded ? '' : '/not-embedded'}`;
      fonts.set(k, (fonts.get(k) ?? 0) + 1);
    }
    const pick = ls.find((l) => l.editable && l.text.length >= 12 && /[A-Za-z]{5,}/.test(l.text.slice(2)));
    if (!pick) continue;
    const m = /[A-Za-z]{5,}/.exec(pick.text.slice(2))!;
    const at = m.index + 2;
    const newText = pick.text.slice(0, at + 2) + pick.text.slice(at + 3); // drop one letter: forces the rest of the line to move
    const dev = info.pages[p].toDevice;
    const toDev = (x: number, y: number): [number, number] => [
      (dev[0] * x + dev[2] * y + dev[4]) * SCALE,
      (dev[1] * x + dev[3] * y + dev[5]) * SCALE,
    ];
    const xs = pick.glyphs.map((g) => g[0]);
    const ys = pick.glyphs.map((g) => g[1]);
    const mg = pick.size * 2;
    const c1 = toDev(Math.min(...xs) - mg, Math.min(...ys) - mg);
    const c2 = toDev(Math.max(...xs) + mg * 4, Math.max(...ys) + mg);
    const box = { x0: Math.min(c1[0], c2[0]), x1: Math.max(c1[0], c2[0]), y0: Math.min(c1[1], c2[1]), y1: Math.max(c1[1], c2[1]) };
    s.render(p, SCALE);
    const before = new Uint8Array(s.render(p, SCALE).data);
    const w = s.render(p, SCALE).width;
    tried++;
    t = performance.now();
    const r = await s.setLineText(pick.id, newText);
    if (!r.ok) {
      refused++;
      refusals.set(
        (r.error ?? (r.missing ? 'missing glyph' : 'unknown')).slice(0, 60),
        (refusals.get((r.error ?? 'x').slice(0, 60)) ?? 0) + 1,
      );
      continue;
    }
    s.render(p, SCALE);
    const after = new Uint8Array(s.render(p, SCALE).data);
    editMs.push(ms(t));
    let outside = 0;
    for (let i = 0; i < before.length; i += 4) {
      if (before[i] === after[i] && before[i + 1] === after[i + 1] && before[i + 2] === after[i + 2]) continue;
      const px = (i >> 2) % w;
      const py = Math.floor(i / 4 / w);
      if (!(px >= box.x0 && px <= box.x1 && py >= box.y0 && py <= box.y1)) outside++;
    }
    outsideTotal += outside;
    if (outside === 0) clean++;
    await s.resetLine(pick.id);
  }
  const top = (m: Map<string, number>, k = 3) =>
    [...m]
      .sort((a, b) => b[1] - a[1])
      .slice(0, k)
      .map(([a, b]) => `${a}×${b}`)
      .join(', ') || '—';
  console.log(`${file}  (${Math.round(bytes.length / 1024)} KB, ${n} pages)`);
  console.log(`   open ${openMs} ms · lines/page extract median ${median(lineMs)} ms · ${sample.length} pages sampled`);
  console.log(`   lines ${lines}: ${lines ? Math.round((100 * editable) / lines) : 0}% editable · not editable because: ${top(reasons)}`);
  console.log(`   fonts (per line): ${top(fonts, 5)}`);
  console.log(
    `   edit trials ${tried}: clean ${clean}, refused ${refused}${refused ? ` (${top(refusals)})` : ''}, pixels outside the line ${outsideTotal} · edit+render median ${median(editMs)} ms`,
  );
}
