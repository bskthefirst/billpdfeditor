/**
 * Builds the PDF objects for an embedded CID TrueType font (Type0 / CIDFontType2, Identity-H, CID = GID) from a
 * HarfBuzz subset that retains the original glyph ids.
 */
import { zlibSync } from 'fflate';
import { parseSfnt, type SfntFont } from './sfnt';
import { PdfName, PdfNewStream, PdfRef, PdfString, dict, type PdfDict, type PdfValue } from '../pdf/objects';
import type { IncrementalUpdate } from '../pdf/writer';

export interface EmbeddedFont {
  ref: PdfRef;
  baseName: string;
  /** Code point → glyph id (also the character code in the PDF string). */
  gids: Map<number, number>;
  /** Code point → advance in thousandths of an em. */
  widths: Map<number, number>;
}

const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 255);
const flate = (dictEntries: Record<string, PdfValue>, data: Uint8Array) =>
  new PdfNewStream(dict({ ...dictEntries, Filter: new PdfName('FlateDecode') }), zlibSync(data));
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Deterministic 6-letter subset tag so the same charset always yields the same BaseFont name. */
export function subsetTag(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
  let t = '';
  for (let i = 0; i < 6; i++) {
    t += String.fromCharCode(65 + (h % 26));
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
  }
  return t;
}

function toUnicodeCMap(entries: Array<[number, number]>): Uint8Array {
  const hex4 = (n: number) => n.toString(16).toUpperCase().padStart(4, '0');
  const utf16 = (cp: number) => {
    if (cp < 0x10000) return hex4(cp);
    const v = cp - 0x10000;
    return hex4(0xd800 + (v >> 10)) + hex4(0xdc00 + (v & 0x3ff));
  };
  let s =
    '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n';
  for (let i = 0; i < entries.length; i += 100) {
    const chunk = entries.slice(i, i + 100);
    s += `${chunk.length} beginbfchar\n${chunk.map(([gid, cp]) => `<${hex4(gid)}> <${utf16(cp)}>`).join('\n')}\nendbfchar\n`;
  }
  s += 'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n';
  return ascii(s);
}

export function embedCidTrueType(
  update: IncrementalUpdate,
  font: SfntFont,
  subsetBytes: Uint8Array,
  codePoints: number[],
  baseName: string,
): EmbeddedFont {
  const upm = font.unitsPerEm;
  const k = 1000 / upm;
  const tag = subsetTag(baseName + codePoints.join(','));
  const psName = `${tag}+${baseName.replace(/[^A-Za-z0-9-]/g, '')}`;

  // Advances come from the subset itself: a variable font pinned to a weight has different metrics than its default instance.
  const instance = parseSfnt(subsetBytes);
  const gids = new Map<number, number>();
  const widths = new Map<number, number>();
  for (const cp of codePoints) {
    const gid = font.glyphFor(cp);
    if (!gid) continue;
    gids.set(cp, gid);
    widths.set(cp, r3(instance.advance(gid) * k));
  }

  const fontFile = update.alloc();
  const descriptor = update.alloc();
  const cidFont = update.alloc();
  const toUnicode = update.alloc();
  const type0 = update.alloc();

  update.set(fontFile, flate({ Length1: subsetBytes.length }, subsetBytes), 0);

  const italic = font.italicAngle !== 0;
  const flags = 32 | (italic ? 64 : 0) | (font.isFixedPitch ? 1 : 0);
  const [x0, y0, x1, y1] = font.bbox;
  const d: PdfDict = dict({
    Type: new PdfName('FontDescriptor'),
    FontName: new PdfName(psName),
    Flags: flags,
    FontBBox: [Math.round(x0 * k), Math.round(y0 * k), Math.round(x1 * k), Math.round(y1 * k)],
    ItalicAngle: font.italicAngle,
    Ascent: Math.round(font.ascender * k),
    Descent: Math.round(font.descender * k),
    CapHeight: Math.round(font.capHeight * k),
    StemV: Math.round(80 + Math.max(0, font.weightClass - 400) / 4),
    FontFile2: new PdfRef(fontFile, 0),
  });
  update.set(descriptor, d, 0);

  // /W: one entry per used glyph (CID = GID)
  const w: PdfValue[] = [];
  for (const [cp, gid] of [...gids].sort((a, b) => a[1] - b[1])) w.push(gid, [widths.get(cp)!]);
  update.set(
    cidFont,
    dict({
      Type: new PdfName('Font'),
      Subtype: new PdfName('CIDFontType2'),
      BaseFont: new PdfName(psName),
      CIDSystemInfo: dict({ Registry: new PdfString(ascii('Adobe')), Ordering: new PdfString(ascii('Identity')), Supplement: 0 }),
      FontDescriptor: new PdfRef(descriptor, 0),
      DW: 1000,
      W: w,
      CIDToGIDMap: new PdfName('Identity'),
    }),
    0,
  );

  update.set(
    toUnicode,
    flate({}, toUnicodeCMap([...gids].map(([cp, gid]) => [gid, cp] as [number, number]).sort((a, b) => a[0] - b[0]))),
    0,
  );
  update.set(
    type0,
    dict({
      Type: new PdfName('Font'),
      Subtype: new PdfName('Type0'),
      BaseFont: new PdfName(psName),
      Encoding: new PdfName('Identity-H'),
      DescendantFonts: [new PdfRef(cidFont, 0)],
      ToUnicode: new PdfRef(toUnicode, 0),
    }),
    0,
  );
  return { ref: new PdfRef(type0, 0), baseName: psName, gids, widths };
}
