/** Spike E — does our interpreter reproduce PDFium's per-character origins? */
import { readFileSync } from 'node:fs';
import { loadCore } from '../helpers/node-core';
import { defineWorker } from '../helpers/batch';
import { PdfFile } from '../../src/pdf/file';
import { TextExtractor } from '../../src/pdf/text';

export interface SpikeEResult {
  pages: number;
  pdfiumChars: number;
  matchedOrigin: number;
  matchedBoth: number;
  matchedLoose: number;
  ourGlyphs: number;
  showOps: number;
  fontNotes: string[];
  fontKinds: string[];
  /** `ours → pdfium` pairs where the origin matched but Unicode differed. */
  uniMismatch: Record<string, number>;
}

const TOL = 0.06;
const isSpace = (u: number) => u <= 32 || u === 0xa0 || u === 0xfeff || u === 0x2028 || u === 0x2029;

export default defineWorker<SpikeEResult>(async (path) => {
  const bytes = new Uint8Array(readFileSync(path));
  const f = PdfFile.load(bytes);
  const r: SpikeEResult = {
    pages: 0,
    pdfiumChars: 0,
    matchedOrigin: 0,
    matchedBoth: 0,
    matchedLoose: 0,
    ourGlyphs: 0,
    showOps: 0,
    fontNotes: [],
    fontKinds: [],
    uniMismatch: {},
  };
  if (f.encrypted) throw new Error('encrypted');
  const core = await loadCore();
  const doc = core.open(bytes);
  const pages = f.pages().slice(0, 3);
  const notes = new Set<string>();
  const kinds = new Set<string>();
  for (let pi = 0; pi < pages.length && pi < doc.pageCount; pi++) {
    r.pages++;
    const ex = new TextExtractor(f, { pdfiumWidths: true });
    const ops = ex.extractPage(pages[pi]);
    r.showOps += ops.length;
    const glyphs = ops.flatMap((o) => o.glyphs.map((g) => ({ g, o })));
    for (const o of ops) {
      if (o.font) {
        kinds.add(`${o.font.subtype}${o.font.embedded ? '' : '/noemb'}`);
        for (const n of o.font.notes) notes.add(n);
      }
    }
    const grid = new Map<string, Array<{ x: number; y: number; u: string; font: string }>>();
    const key = (x: number, y: number) => `${Math.round(x / 2)},${Math.round(y / 2)}`;
    for (const { g, o } of glyphs) {
      if (g.unicode && /^\s*$/.test(g.unicode)) continue;
      r.ourGlyphs++;
      for (const dx of [-1, 0, 1])
        for (const dy of [-1, 0, 1]) {
          const k = key(g.x + dx * 2, g.y + dy * 2);
          let l = grid.get(k);
          if (!l) grid.set(k, (l = []));
          l.push({
            x: g.x,
            y: g.y,
            u: g.unicode,
            font: o.font ? `${o.font.subtype}${o.font.embedded ? '' : '/noemb'}${o.font.hasToUnicode ? '+tu' : ''}` : 'none',
          });
        }
    }
    const page = core.loadPage(doc, pi);
    const tp = core.loadTextPage(page);
    const chars = core.textChars(tp);
    core.closeTextPage(tp);
    core.closePage(page);
    for (const c of chars) {
      if (c.generated || isSpace(c.unicode) || !Number.isFinite(c.x)) continue;
      r.pdfiumChars++;
      const cand = grid.get(key(c.x, c.y)) ?? [];
      let best: { d: number; u: string; font: string } | null = null;
      for (const q of cand) {
        const d = Math.hypot(q.x - c.x, q.y - c.y);
        if (!best || d < best.d) best = { d, u: q.u, font: q.font };
      }
      if (!best) continue;
      if (best.d <= 1.0) r.matchedLoose++;
      if (best.d <= TOL) {
        r.matchedOrigin++;
        if (!best.u || best.u === String.fromCharCode(c.unicode)) r.matchedBoth++;
        else {
          const k = `${best.font}: ${JSON.stringify(best.u)}→${JSON.stringify(String.fromCharCode(c.unicode))}`;
          r.uniMismatch[k] = (r.uniMismatch[k] ?? 0) + 1;
        }
      }
    }
  }
  core.close(doc);
  r.fontNotes = [...notes];
  r.fontKinds = [...kinds];
  return r;
});
