/**
 * Font model: everything the editor needs to know about a PDF font *without* parsing its font program —
 * how bytes map to character codes, code → Unicode, and glyph advances.
 */
import { parseCMap, type CMapData } from './cmap';
import type { PdfFile } from './file';
import { PdfName, isArray, isDict, isName, isNum, isRef, isStream, type PdfDict, type PdfValue } from './objects';
import std14Widths from './data/std14-widths.json';
import encodingData from './data/encodings.json';
import glyphData from './data/glyphlist.json';

const WIDTHS = std14Widths as unknown as Record<string, number | Record<string, number>>;
const ENCODINGS = encodingData as unknown as Record<string, string[]>;
const AGL = (glyphData as unknown as { glyphs: Record<string, number>; dingbats: Record<string, number> }).glyphs;
const DINGBATS = (glyphData as unknown as { glyphs: Record<string, number>; dingbats: Record<string, number> }).dingbats;

export interface FontFileRef {
  kind: 'FontFile' | 'FontFile2' | 'FontFile3';
  num: number;
}

export interface PdfFont {
  readonly dict: PdfDict;
  /** Object number of the font dictionary (0 when the dictionary is direct). */
  readonly num: number;
  readonly resName: string;
  readonly subtype: string;
  readonly baseFont: string;
  readonly subsetTag: string | null;
  readonly composite: boolean;
  readonly vertical: boolean;
  readonly embedded: boolean;
  readonly fontFile: FontFileRef | null;
  readonly hasToUnicode: boolean;
  /** False when advances cannot be known (non-embedded font with no /Widths and no standard-14 metrics). */
  readonly metricsKnown: boolean;
  /** FontDescriptor /Flags (0 when absent). */
  readonly flags: number;
  /** From the font descriptor, in 1/1000 em (defaults 800 / -200). */
  readonly ascent: number;
  readonly descent: number;
  /** Anything that limits editing or exact geometry (unsupported CMap, vertical writing, …). */
  readonly notes: string[];
  nextCode(bytes: Uint8Array, pos: number): { code: number; len: number };
  /** Advance in text-space units for font size 1 (i.e. width/1000 for normal fonts), before Tc/Tw/Th. */
  advance(code: number): number;
  unicode(code: number): string;
  isWordSpace(code: number, len: number): boolean;
  /** Reverse lookup used when encoding new text: Unicode string → character code (single character). */
  codeFor(char: string): number | null;
  /** Bytes that represent `code` inside a PDF string (1 byte for simple fonts, the CMap's code length for composite). */
  encode(code: number): Uint8Array;
}

// ───────────── glyph names ─────────────
export function glyphNameToUnicode(name: string, dingbats = false): string {
  if (!name) return '';
  const table = dingbats ? DINGBATS : AGL;
  const direct = table[name] ?? AGL[name];
  if (direct !== undefined) return String.fromCodePoint(direct);
  const dot = name.indexOf('.');
  if (dot > 0) return glyphNameToUnicode(name.slice(0, dot), dingbats);
  if (name.includes('_'))
    return name
      .split('_')
      .map((p) => glyphNameToUnicode(p, dingbats))
      .join('');
  let m = /^uni([0-9A-Fa-f]{4})+$/.exec(name);
  if (m) {
    let s = '';
    for (let i = 3; i + 4 <= name.length; i += 4) s += String.fromCharCode(parseInt(name.slice(i, i + 4), 16));
    return s;
  }
  m = /^u([0-9A-Fa-f]{4,6})$/.exec(name);
  if (m) return String.fromCodePoint(parseInt(m[1], 16));
  return '';
}

// ───────────── standard 14 ─────────────
export function standardFontName(baseFont: string): string | null {
  const n = baseFont
    .replace(/^[A-Z]{6}\+/, '')
    .replace(/[\s,_-]/g, '')
    .toLowerCase();
  const bold = n.includes('bold') || n.includes('black') || n.includes('heavy');
  const italic = n.includes('italic') || n.includes('oblique');
  if (n.startsWith('courier') || n.startsWith('couriernew'))
    return 'Courier' + (bold || italic ? '-' + (bold ? 'Bold' : '') + (italic ? 'Oblique' : '') : '');
  if (n.startsWith('helvetica') || n.startsWith('arial'))
    return 'Helvetica' + (bold || italic ? '-' + (bold ? 'Bold' : '') + (italic ? 'Oblique' : '') : '');
  if (n.startsWith('times') || n.startsWith('timesnewroman'))
    return bold && italic ? 'Times-BoldItalic' : bold ? 'Times-Bold' : italic ? 'Times-Italic' : 'Times-Roman';
  if (n === 'symbol') return 'Symbol';
  if (n.startsWith('zapfdingbats')) return 'ZapfDingbats';
  return null;
}

// ───────────── loader ─────────────
function numArray(file: PdfFile, v: PdfValue): number[] {
  const a = file.resolve(v);
  return isArray(a) ? a.map((x) => file.resolve(x)).map((x) => (isNum(x) ? x : 0)) : [];
}

export function loadFont(file: PdfFile, fontVal: PdfValue, resName: string): PdfFont | null {
  const dict = file.resolve(fontVal);
  if (!isDict(dict)) return null;
  const num = isRef(fontVal) ? fontVal.num : 0;
  const subtype = file.name(dict.get('Subtype') ?? null) ?? 'Type1';
  const rawBase = file.name(dict.get('BaseFont') ?? null) ?? '';
  const tagMatch = /^([A-Z]{6})\+(.*)$/.exec(rawBase);
  const baseFont = tagMatch ? tagMatch[2] : rawBase;
  const notes: string[] = [];

  // ToUnicode
  let toUni: CMapData | null = null;
  const tu = file.resolve(dict.get('ToUnicode') ?? null);
  if (isStream(tu)) {
    try {
      toUni = parseCMap(file.decode(tu));
    } catch {
      notes.push('ToUnicode unreadable');
    }
  }

  if (subtype === 'Type0') return loadType0(file, dict, num, resName, baseFont, tagMatch ? tagMatch[1] : null, toUni, notes);
  return loadSimple(file, dict, num, resName, subtype, baseFont, tagMatch ? tagMatch[1] : null, toUni, notes);
}

function metricsOf(file: PdfFile, descriptor: PdfValue): { ascent: number; descent: number } {
  const d = file.resolve(descriptor);
  const num = (k: string) => (isDict(d) && isNum(file.resolve(d.get(k) ?? null)) ? (file.resolve(d.get(k) ?? null) as number) : undefined);
  const a = num('Ascent');
  const dsc = num('Descent');
  return { ascent: a && a > 0 ? a : 800, descent: dsc !== undefined && dsc < 0 ? dsc : -200 };
}

function descriptorFlags(file: PdfFile, descriptor: PdfValue): number {
  const d = file.resolve(descriptor);
  const f = isDict(d) ? file.resolve(d.get('Flags') ?? null) : null;
  return isNum(f) ? f : 0;
}

function fontFileOf(file: PdfFile, desc: PdfValue): FontFileRef | null {
  const d = file.resolve(desc);
  if (!isDict(d)) return null;
  for (const kind of ['FontFile', 'FontFile2', 'FontFile3'] as const) {
    const v = d.get(kind);
    if (v !== undefined && isRef(v) && isStream(file.resolve(v))) return { kind, num: v.num };
  }
  return null;
}

function loadSimple(
  file: PdfFile,
  dict: PdfDict,
  num: number,
  resName: string,
  subtype: string,
  baseFont: string,
  subsetTag: string | null,
  toUni: CMapData | null,
  notes: string[],
): PdfFont {
  const descriptor = file.resolve(dict.get('FontDescriptor') ?? null);
  const fontFile = fontFileOf(file, dict.get('FontDescriptor') ?? null);
  const flags =
    isDict(descriptor) && isNum(file.resolve(descriptor.get('Flags') ?? null))
      ? (file.resolve(descriptor.get('Flags') ?? null) as number)
      : 0;
  const symbolic = (flags & 4) !== 0 && (flags & 32) === 0;
  const std = !fontFile ? standardFontName(baseFont) : null;
  const isSymbolStd = std === 'Symbol' || std === 'ZapfDingbats';

  // encoding → glyph names
  const enc = file.resolve(dict.get('Encoding') ?? null);
  let baseEncName: string | null = null;
  let differences: PdfValue[] = [];
  if (isName(enc)) baseEncName = enc.name;
  else if (isDict(enc)) {
    baseEncName = file.name(enc.get('BaseEncoding') ?? null);
    const d = file.resolve(enc.get('Differences') ?? null);
    if (isArray(d)) differences = d.map((x) => file.resolve(x));
  }
  let names: string[];
  const fixedEncoding = baseEncName && ENCODINGS[baseEncName] ? ENCODINGS[baseEncName] : null;
  if (fixedEncoding) names = fixedEncoding.slice();
  else if (isSymbolStd) names = ENCODINGS[std!].slice();
  else if (subtype === 'TrueType' && !symbolic) names = ENCODINGS.WinAnsiEncoding.slice();
  else names = ENCODINGS.StandardEncoding.slice();
  if (names.length < 256) names.length = 256;
  let code = 0;
  for (const item of differences) {
    if (isNum(item)) code = item;
    else if (item instanceof PdfName) names[code++] = item.name;
  }
  const hasExplicitNames = differences.length > 0 || !!fixedEncoding || isSymbolStd || (subtype !== 'TrueType' && !symbolic);

  // widths
  const firstChar = isNum(file.resolve(dict.get('FirstChar') ?? null)) ? (file.resolve(dict.get('FirstChar') ?? null) as number) : 0;
  const widths = numArray(file, dict.get('Widths') ?? null);
  const missing =
    isDict(descriptor) && isNum(file.resolve(descriptor.get('MissingWidth') ?? null))
      ? (file.resolve(descriptor.get('MissingWidth') ?? null) as number)
      : 0;
  const stdWidths = std ? WIDTHS[std] : undefined;
  const type3 = subtype === 'Type3';
  let widthScale = 0.001;
  if (type3) {
    const fm = numArray(file, dict.get('FontMatrix') ?? null);
    widthScale = fm.length >= 1 && fm[0] ? fm[0] : 0.001;
    notes.push('Type3 font: glyphs are drawing procedures and cannot be re-encoded');
  }
  if (!widths.length && !stdWidths && !type3) notes.push('no /Widths and not a standard-14 font: advances unknown');

  const unicodeOf = (c: number): string => {
    const u = toUni?.unicode.get(c);
    if (u !== undefined) return u;
    const n = names[c];
    if (n && hasExplicitNames) {
      const s = glyphNameToUnicode(n, std === 'ZapfDingbats');
      if (s) return s;
    }
    if (!toUni && !hasExplicitNames && c >= 32 && c < 256) return String.fromCharCode(c); // TrueType w/o encoding ≈ Latin-1
    return '';
  };

  let reverse: Map<string, number> | null = null;
  const buildReverse = () => {
    reverse = new Map();
    for (let c = 255; c >= 0; c--) {
      const u = unicodeOf(c);
      if (u && !reverse.has(u)) reverse.set(u, c);
      else if (u) reverse.set(u, c); // iterate high→low so the lowest code wins
    }
  };

  return {
    dict,
    num,
    resName,
    subtype,
    baseFont,
    subsetTag,
    composite: false,
    vertical: false,
    embedded: !!fontFile,
    fontFile,
    hasToUnicode: !!toUni,
    ...metricsOf(file, descriptor),
    metricsKnown: widths.length > 0 || stdWidths !== undefined || type3,
    flags,
    notes,
    nextCode: (b, pos) => ({ code: b[pos], len: 1 }),
    advance(c) {
      const i = c - firstChar;
      if (widths.length && i >= 0 && i < widths.length) return widths[i] * widthScale;
      if (stdWidths !== undefined && !widths.length) {
        if (typeof stdWidths === 'number') return stdWidths * widthScale;
        const w = stdWidths[names[c] ?? ''];
        if (w !== undefined) return w * widthScale;
      }
      return missing * widthScale;
    },
    unicode: unicodeOf,
    isWordSpace: (c, len) => len === 1 && c === 32,
    codeFor(ch) {
      if (!reverse) buildReverse();
      return reverse!.get(ch) ?? null;
    },
    encode: (c) => Uint8Array.of(c & 255),
  };
}

function loadType0(
  file: PdfFile,
  dict: PdfDict,
  num: number,
  resName: string,
  baseFont: string,
  subsetTag: string | null,
  toUni: CMapData | null,
  notes: string[],
): PdfFont {
  const enc = file.resolve(dict.get('Encoding') ?? null);
  let encName = 'Identity-H';
  let cmap: CMapData | null = null;
  let identity = true;
  let vertical = false;
  if (isName(enc)) {
    encName = enc.name;
    vertical = /-V$/.test(encName);
    if (!/^Identity-[HV]$/.test(encName)) {
      identity = false;
      notes.push(`predefined CMap ${encName} is not bundled: code lengths and CIDs are assumed to be 2-byte identity`);
      identity = true;
    }
  } else if (isStream(enc)) {
    try {
      cmap = parseCMap(file.decode(enc));
      identity = false;
      vertical = cmap.wmode === 1 || file.resolve(enc.dict.get('WMode') ?? 0) === 1;
      if (cmap.useCMap && !/^Identity-[HV]$/.test(cmap.useCMap)) notes.push(`embedded CMap uses ${cmap.useCMap}`);
    } catch {
      notes.push('embedded CMap unreadable');
    }
  }
  if (vertical) notes.push('vertical writing mode');

  // descendant CIDFont
  const desc = file.resolve(dict.get('DescendantFonts') ?? null);
  const cidFont = isArray(desc) ? file.resolve(desc[0] ?? null) : null;
  const cidDict = isDict(cidFont) ? cidFont : new Map<string, PdfValue>();
  const descriptorVal = cidDict.get('FontDescriptor') ?? null;
  const fontFile = fontFileOf(file, descriptorVal);
  const dw = isNum(file.resolve(cidDict.get('DW') ?? null)) ? (file.resolve(cidDict.get('DW') ?? null) as number) : 1000;
  const wMap = new Map<number, number>();
  const wRanges: Array<{ lo: number; hi: number; w: number }> = [];
  const wArr = file.resolve(cidDict.get('W') ?? null);
  if (isArray(wArr)) {
    for (let i = 0; i < wArr.length;) {
      const first = file.resolve(wArr[i++]);
      const second = file.resolve(wArr[i] ?? null);
      if (isArray(second)) {
        i++;
        second.forEach((w, k) => {
          const wv = file.resolve(w);
          if (isNum(first) && isNum(wv)) wMap.set(first + k, wv);
        });
      } else {
        const w = file.resolve(wArr[i + 1] ?? null);
        i += 2;
        if (isNum(first) && isNum(second) && isNum(w)) wRanges.push({ lo: first, hi: second, w });
      }
    }
  }
  const cidOf = (code: number, len: number): number => {
    if (!cmap) return code;
    const direct = cmap.cid.get(code);
    if (direct !== undefined) return direct;
    for (const r of cmap.cidRanges) if (r.len === len && code >= r.lo && code <= r.hi) return r.cid + (code - r.lo);
    return code;
  };
  let reverse: Map<string, number> | null = null;

  return {
    dict,
    num,
    resName,
    subtype: 'Type0',
    baseFont,
    subsetTag,
    composite: true,
    vertical,
    embedded: !!fontFile,
    fontFile,
    hasToUnicode: !!toUni,
    ...metricsOf(file, file.resolve(descriptorVal)),
    metricsKnown: true,
    flags: descriptorFlags(file, descriptorVal),
    notes,
    nextCode(b, pos) {
      if (identity || !cmap || !cmap.codespaces.length) {
        if (pos + 1 < b.length) return { code: (b[pos] << 8) | b[pos + 1], len: 2 };
        return { code: b[pos], len: 1 };
      }
      let v = 0;
      for (let len = 1; len <= 4 && pos + len <= b.length; len++) {
        v = v * 256 + b[pos + len - 1];
        if (cmap.codespaces.some((cs) => cs.len === len && v >= cs.lo && v <= cs.hi)) return { code: v, len };
      }
      const len = Math.min(cmap.codespaces[0].len, b.length - pos);
      let code = 0;
      for (let i = 0; i < len; i++) code = code * 256 + b[pos + i];
      return { code, len: Math.max(1, len) };
    },
    advance(code) {
      const cid = cidOf(code, 2);
      const w = wMap.get(cid);
      if (w !== undefined) return w * 0.001;
      for (const r of wRanges) if (cid >= r.lo && cid <= r.hi) return r.w * 0.001;
      return dw * 0.001;
    },
    unicode: (code) => toUni?.unicode.get(code) ?? '',
    isWordSpace: (code, len) => len === 1 && code === 32,
    codeFor(ch) {
      if (!toUni) return null;
      if (!reverse) {
        reverse = new Map();
        for (const [c, u] of toUni.unicode) if (!reverse.has(u) || c < reverse.get(u)!) reverse.set(u, c);
      }
      return reverse.get(ch) ?? null;
    },
    encode(code) {
      let len = 2;
      if (cmap && cmap.codespaces.length) {
        const hit = cmap.codespaces.find((cs) => code >= cs.lo && code <= cs.hi && code < 256 ** cs.len);
        len = hit ? hit.len : cmap.codespaces[0].len;
      }
      const out = new Uint8Array(len);
      for (let i = len - 1, c = code; i >= 0; i--, c = Math.floor(c / 256)) out[i] = c & 255;
      return out;
    },
  };
}
