/** Minimal read-only sfnt (TrueType / OpenType / TTC) parser: just what PDF embedding and text layout need. */

export interface SfntFont {
  data: Uint8Array;
  numGlyphs: number;
  unitsPerEm: number;
  /** hhea metrics in font units. */
  ascender: number;
  descender: number;
  lineGap: number;
  capHeight: number;
  xHeight: number;
  /** Degrees, counter-clockwise from vertical (negative = leaning right), as in `post`. */
  italicAngle: number;
  weightClass: number;
  /** OS/2 fsType embedding permissions (0 = installable). */
  fsType: number;
  /** [xMin, yMin, xMax, yMax] in font units. */
  bbox: [number, number, number, number];
  isCFF: boolean;
  isFixedPitch: boolean;
  names: { family?: string; style?: string; full?: string; postscript?: string };
  /** Glyph index for a Unicode code point (0 when the font has no glyph). */
  glyphFor(codePoint: number): number;
  /** Advance width in font units. */
  advance(gid: number): number;
}

const be16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const bs16 = (b: Uint8Array, o: number) => ((b[o] << 24) >> 16) | b[o + 1];
const be32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const tagAt = (b: Uint8Array, o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

function decodeName(b: Uint8Array, platform: number, start: number, len: number): string {
  const s = b.subarray(start, start + len);
  if (platform === 3 || platform === 0) return new TextDecoder('utf-16be').decode(s);
  let out = '';
  for (const c of s) out += String.fromCharCode(c);
  return out;
}

export function parseSfnt(data: Uint8Array, ttcIndex = 0): SfntFont {
  let base = 0;
  if (tagAt(data, 0) === 'ttcf') {
    const n = be32(data, 8);
    if (ttcIndex >= n) throw new Error(`TTC index ${ttcIndex} out of range (${n} fonts)`);
    base = be32(data, 12 + ttcIndex * 4);
  }
  const version = tagAt(data, base);
  if (!(version === '\0\x01\0\0' || version === 'OTTO' || version === 'true' || version === 'typ1')) throw new Error('not an sfnt font');
  const numTables = be16(data, base + 4);
  const tables = new Map<string, { offset: number; length: number }>();
  for (let i = 0; i < numTables; i++) {
    const r = base + 12 + i * 16;
    tables.set(tagAt(data, r), { offset: be32(data, r + 8), length: be32(data, r + 12) });
  }
  const need = (t: string) => {
    const e = tables.get(t);
    if (!e) throw new Error(`font has no '${t}' table`);
    return e.offset;
  };

  const head = need('head');
  const unitsPerEm = be16(data, head + 18) || 1000;
  const bbox: SfntFont['bbox'] = [bs16(data, head + 36), bs16(data, head + 38), bs16(data, head + 40), bs16(data, head + 42)];
  const hhea = need('hhea');
  const ascender = bs16(data, hhea + 4);
  const descender = bs16(data, hhea + 6);
  const lineGap = bs16(data, hhea + 8);
  const numHMetrics = be16(data, hhea + 34);
  const numGlyphs = be16(data, need('maxp') + 4);
  const hmtx = tables.get('hmtx')?.offset ?? 0;

  let weightClass = 400;
  let fsType = 0;
  let capHeight = 0;
  let xHeight = 0;
  const os2 = tables.get('OS/2');
  if (os2) {
    weightClass = be16(data, os2.offset + 4);
    fsType = be16(data, os2.offset + 8);
    const ver = be16(data, os2.offset);
    if (ver >= 2 && os2.length >= 90) {
      xHeight = bs16(data, os2.offset + 86);
      capHeight = bs16(data, os2.offset + 88);
    }
  }
  let italicAngle = 0;
  let isFixedPitch = false;
  const post = tables.get('post');
  if (post) {
    italicAngle = ((be32(data, post.offset + 4) | 0) / 65536) as number;
    isFixedPitch = be32(data, post.offset + 12) !== 0;
  }

  const names: SfntFont['names'] = {};
  const nameT = tables.get('name');
  if (nameT) {
    const o = nameT.offset;
    const count = be16(data, o + 2);
    const strOff = o + be16(data, o + 4);
    const keyOf: Record<number, keyof SfntFont['names']> = { 1: 'family', 2: 'style', 4: 'full', 6: 'postscript' };
    for (let i = 0; i < count; i++) {
      const r = o + 6 + i * 12;
      const platform = be16(data, r);
      const key = keyOf[be16(data, r + 6)];
      if (!key) continue;
      const v = decodeName(data, platform, strOff + be16(data, r + 10), be16(data, r + 8));
      // prefer Windows (3) names, then anything
      if (!names[key] || platform === 3) names[key] = v;
    }
  }

  // ── cmap ──
  let lookup: (cp: number) => number = () => 0;
  const cmap = tables.get('cmap');
  if (cmap) {
    const o = cmap.offset;
    const n = be16(data, o + 2);
    type Sub = { platform: number; encoding: number; off: number; format: number };
    const subs: Sub[] = [];
    for (let i = 0; i < n; i++) {
      const r = o + 4 + i * 8;
      const off = o + be32(data, r + 4);
      subs.push({ platform: be16(data, r), encoding: be16(data, r + 2), off, format: be16(data, off) });
    }
    const rank = (s: Sub) =>
      s.platform === 3 && s.encoding === 10
        ? 0
        : s.platform === 0 && (s.encoding === 4 || s.encoding === 6)
          ? 1
          : s.platform === 3 && s.encoding === 1
            ? 2
            : s.platform === 0
              ? 3
              : 9;
    const best = subs
      .filter((s) => rank(s) < 9 && (s.format === 4 || s.format === 12 || s.format === 6))
      .sort((a, b) => rank(a) - rank(b))[0];
    if (best) {
      const f = best.off;
      if (best.format === 12) {
        const groups = be32(data, f + 12);
        lookup = (cp) => {
          let lo = 0;
          let hi = groups - 1;
          while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            const g = f + 16 + mid * 12;
            const start = be32(data, g);
            const end = be32(data, g + 4);
            if (cp < start) hi = mid - 1;
            else if (cp > end) lo = mid + 1;
            else return be32(data, g + 8) + (cp - start);
          }
          return 0;
        };
      } else if (best.format === 4) {
        const segX2 = be16(data, f + 6);
        const endCodes = f + 14;
        const startCodes = endCodes + segX2 + 2;
        const deltas = startCodes + segX2;
        const rangeOffs = deltas + segX2;
        lookup = (cp) => {
          if (cp > 0xffff) return 0;
          for (let i = 0; i < segX2; i += 2) {
            if (cp > be16(data, endCodes + i)) continue;
            const start = be16(data, startCodes + i);
            if (cp < start) return 0;
            const ro = be16(data, rangeOffs + i);
            if (ro === 0) return (cp + be16(data, deltas + i)) & 0xffff;
            const g = be16(data, rangeOffs + i + ro + (cp - start) * 2);
            return g === 0 ? 0 : (g + be16(data, deltas + i)) & 0xffff;
          }
          return 0;
        };
      } else if (best.format === 6) {
        const first = be16(data, f + 6);
        const count = be16(data, f + 8);
        lookup = (cp) => (cp >= first && cp < first + count ? be16(data, f + 10 + (cp - first) * 2) : 0);
      }
    }
  }

  return {
    data,
    numGlyphs,
    unitsPerEm,
    ascender,
    descender,
    lineGap,
    capHeight: capHeight || Math.round(ascender * 0.7),
    xHeight,
    italicAngle,
    weightClass,
    fsType,
    bbox,
    isCFF: version === 'OTTO' || tables.has('CFF ') || tables.has('CFF2'),
    isFixedPitch,
    names,
    glyphFor: lookup,
    advance(gid) {
      if (!hmtx || numHMetrics === 0) return 0;
      const i = Math.min(gid, numHMetrics - 1);
      return be16(data, hmtx + i * 4);
    },
  };
}
