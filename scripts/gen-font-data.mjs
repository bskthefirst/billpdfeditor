#!/usr/bin/env node
// One-off generator: converts pdf.js's (Apache-2.0) core data tables into compact JSON under src/pdf/data/.
// Source: https://github.com/mozilla/pdf.js/tree/master/src/core  (metrics.js, encodings.js, glyphlist.js)
// Usage: node scripts/gen-font-data.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'src', 'pdf', 'data');
mkdirSync(OUT, { recursive: true });
const BASE = 'https://raw.githubusercontent.com/mozilla/pdf.js/master/src/core/';
const get = async (f) => (await fetch(BASE + f)).text();

const getLookupTableFactory = (init) => {
  let lookup;
  return () => {
    if (init) {
      lookup = Object.create(null);
      init(lookup);
      init = null;
    }
    return lookup;
  };
};
function load(src, returns) {
  const code = src
    .replace(/^import .*$/gm, '')
    .replace(/^export \{[^}]*\};?$/gm, '')
    .replace(/^export (const|function) /gm, '$1 ');
  return new Function('getLookupTableFactory', `${code}\nreturn {${returns}};`)(getLookupTableFactory);
}

// ── core-14 metrics ────────────────────────────────────────────────────────────
const metricsSrc = await get('metrics.js');
const { getMetrics } = load(metricsSrc, 'getMetrics');
const metrics = getMetrics();
const CORE = ['Courier', 'Courier-Bold', 'Courier-BoldOblique', 'Courier-Oblique', 'Helvetica', 'Helvetica-Bold', 'Helvetica-BoldOblique', 'Helvetica-Oblique', 'Symbol', 'Times-Roman', 'Times-Bold', 'Times-BoldItalic', 'Times-Italic', 'ZapfDingbats'];
const widths = {};
for (const name of CORE) {
  const m = metrics[name];
  if (typeof m === 'number') widths[name] = m; // monospaced: one width for every glyph
  else if (typeof m === 'function') widths[name] = { ...m() };
  else console.warn('missing metrics for', name);
}
writeFileSync(join(OUT, 'std14-widths.json'), JSON.stringify(widths));

// ── encodings ──────────────────────────────────────────────────────────────────
const encSrc = await get('encodings.js');
const enc = load(encSrc, 'StandardEncoding, WinAnsiEncoding, MacRomanEncoding, MacExpertEncoding, SymbolSetEncoding, ZapfDingbatsEncoding');
const encodings = {
  StandardEncoding: enc.StandardEncoding,
  WinAnsiEncoding: enc.WinAnsiEncoding,
  MacRomanEncoding: enc.MacRomanEncoding,
  MacExpertEncoding: enc.MacExpertEncoding,
  Symbol: enc.SymbolSetEncoding,
  ZapfDingbats: enc.ZapfDingbatsEncoding,
};
writeFileSync(join(OUT, 'encodings.json'), JSON.stringify(encodings));

// ── Adobe Glyph List (+ ZapfDingbats) ──────────────────────────────────────────
const glSrc = await get('glyphlist.js');
const gl = load(glSrc, 'getGlyphsUnicode, getDingbatsGlyphsUnicode');
const glyphs = { ...gl.getGlyphsUnicode() };
const dingbats = { ...gl.getDingbatsGlyphsUnicode() };
writeFileSync(join(OUT, 'glyphlist.json'), JSON.stringify({ glyphs, dingbats }));

console.log('core fonts:', Object.keys(widths).length, '| encodings:', Object.keys(encodings).length, '| AGL glyphs:', Object.keys(glyphs).length, '| dingbats:', Object.keys(dingbats).length);
