/**
 * Open-licensed fallback fonts (downloaded by scripts/fetch-fonts.mjs into public/fonts) and the rules that decide which
 * one stands in for an original PDF font. Metric-compatible families come first because identical advance widths keep
 * the surrounding layout intact.
 */

export type StyleKey = 'regular' | 'bold' | 'italic' | 'boldItalic';
export type Kind = 'sans' | 'serif' | 'mono';

export interface FamilyFile {
  file: string;
  /** Variable-font axes to pin when subsetting (e.g. weight). */
  variations?: Record<string, number>;
}

export interface CatalogFamily {
  id: string;
  label: string;
  kind: Kind;
  /** Plain-language note shown in the font inspector. */
  note: string;
  styles: Record<StyleKey, FamilyFile>;
}

const vf = (file: string, italicFile: string, extra: Record<string, number> = {}): CatalogFamily['styles'] => ({
  regular: { file, variations: { wght: 400, ...extra } },
  bold: { file, variations: { wght: 700, ...extra } },
  italic: { file: italicFile, variations: { wght: 400, ...extra } },
  boldItalic: { file: italicFile, variations: { wght: 700, ...extra } },
});
const statics = (base: string): CatalogFamily['styles'] => ({
  regular: { file: `${base}-Regular.ttf` },
  bold: { file: `${base}-Bold.ttf` },
  italic: { file: `${base}-Italic.ttf` },
  boldItalic: { file: `${base}-BoldItalic.ttf` },
});

export const FAMILIES: Record<string, CatalogFamily> = {
  arimo: {
    id: 'arimo',
    label: 'Arimo',
    kind: 'sans',
    note: 'metric-compatible with Arial and Helvetica',
    styles: vf('Arimo-VF.ttf', 'Arimo-Italic-VF.ttf'),
  },
  tinos: { id: 'tinos', label: 'Tinos', kind: 'serif', note: 'metric-compatible with Times New Roman', styles: statics('Tinos') },
  cousine: { id: 'cousine', label: 'Cousine', kind: 'mono', note: 'metric-compatible with Courier New', styles: statics('Cousine') },
  carlito: { id: 'carlito', label: 'Carlito', kind: 'sans', note: 'metric-compatible with Calibri', styles: statics('Carlito') },
  caladea: { id: 'caladea', label: 'Caladea', kind: 'serif', note: 'metric-compatible with Cambria', styles: statics('Caladea') },
  gelasio: {
    id: 'gelasio',
    label: 'Gelasio',
    kind: 'serif',
    note: 'metric-compatible with Georgia',
    styles: vf('Gelasio-VF.ttf', 'Gelasio-Italic-VF.ttf'),
  },
  notosans: {
    id: 'notosans',
    label: 'Noto Sans',
    kind: 'sans',
    note: 'broad Latin, Greek and Cyrillic coverage',
    styles: vf('NotoSans-VF.ttf', 'NotoSans-Italic-VF.ttf', { wdth: 100 }),
  },
  notoserif: {
    id: 'notoserif',
    label: 'Noto Serif',
    kind: 'serif',
    note: 'broad Latin, Greek and Cyrillic coverage',
    styles: vf('NotoSerif-VF.ttf', 'NotoSerif-Italic-VF.ttf', { wdth: 100 }),
  },
  nanumgothic: {
    id: 'nanumgothic',
    label: 'Nanum Gothic',
    kind: 'sans',
    note: 'Korean (Hangul) sans-serif',
    styles: {
      regular: { file: 'NanumGothic-Regular.ttf' },
      bold: { file: 'NanumGothic-Bold.ttf' },
      italic: { file: 'NanumGothic-Regular.ttf' },
      boldItalic: { file: 'NanumGothic-Bold.ttf' },
    },
  },
  nanummyeongjo: {
    id: 'nanummyeongjo',
    label: 'Nanum Myeongjo',
    kind: 'serif',
    note: 'Korean (Hangul) serif',
    styles: {
      regular: { file: 'NanumMyeongjo-Regular.ttf' },
      bold: { file: 'NanumMyeongjo-Bold.ttf' },
      italic: { file: 'NanumMyeongjo-Regular.ttf' },
      boldItalic: { file: 'NanumMyeongjo-Bold.ttf' },
    },
  },
};

/** Describes the original font well enough to choose a stand-in. */
export interface FontIdentity {
  baseFont: string;
  /** FontDescriptor /Flags (bit 1 fixed pitch, bit 2 serif, bit 7 italic, bit 19 force bold). */
  flags?: number;
}

export interface Style {
  bold: boolean;
  italic: boolean;
}

const norm = (s: string) =>
  s
    .replace(/^[A-Z]{6}\+/, '')
    .replace(/[\s,_\-.]/g, '')
    .toLowerCase();

export function styleOf(id: FontIdentity): Style {
  const n = norm(id.baseFont);
  const f = id.flags ?? 0;
  return {
    bold: /bold|black|heavy|semibold|demibold|extrabold|ultrabold/.test(n) || (f & 262144) !== 0,
    italic: /italic|oblique|kursiv|ital$|it$/.test(n) || (f & 64) !== 0,
  };
}

const RULES: Array<[RegExp, string]> = [
  [/^(arial|helvetica|arimo|liberationsans|nimbussans|swiss)/, 'arimo'],
  [/^(timesnewroman|times|tinos|liberationserif|nimbusroman|nimbusromno9)/, 'tinos'],
  [/^(couriernew|courier|cousine|liberationmono|nimbusmono|monaco|menlo|lucidaconsole|andalemono|sfmono)/, 'cousine'],
  [/^(calibri|carlito)/, 'carlito'],
  [/^(cambria|caladea)/, 'caladea'],
  [/^(georgia|gelasio)/, 'gelasio'],
  [
    /^(garamond|palatino|bookantiqua|minion|baskerville|bodoni|didot|hoefler|sabon|constantia|century|charter|sylfaen|perpetua)/,
    'notoserif',
  ],
  [
    /^(verdana|tahoma|segoe|trebuchet|opensans|roboto|lato|frutiger|myriad|gillsans|optima|futura|avenir|sfpro|sanfrancisco|ubuntu|aptos|source)/,
    'notosans',
  ],
  [/^(nanummyeongjo|myeongjo|batang|gungsuh|notoserifkr|notoserifcjk|mincho|song)/, 'nanummyeongjo'],
  [/^(malgun|nanumgothic|gulim|dotum|applegothic|applesdgothic|notosanskr|pretendard|notosanscjk|gothic)/, 'nanumgothic'],
];

/**
 * Ordered candidate families for the original font: the specific match first (when we recognise the name), then
 * generic stand-ins of the same kind, then Korean (for Hangul). The resolver picks, per character, the first candidate
 * whose font actually has a glyph.
 */
export function candidateFamilies(id: FontIdentity): CatalogFamily[] {
  const n = norm(id.baseFont);
  const f = id.flags ?? 0;
  const out: CatalogFamily[] = [];
  const add = (key: string) => {
    const fam = FAMILIES[key];
    if (fam && !out.includes(fam)) out.push(fam);
  };
  for (const [re, fam] of RULES) if (re.test(n)) add(fam);
  const kind: Kind = f & 1 ? 'mono' : f & 2 || /serif|roman|mincho|song|myeongjo|batang/.test(n) ? 'serif' : 'sans';
  if (kind === 'mono') add('cousine');
  if (kind === 'serif') {
    add('tinos');
    add('notoserif');
  } else {
    add('arimo');
    add('notosans');
  }
  add(kind === 'serif' ? 'nanummyeongjo' : 'nanumgothic');
  add(kind === 'serif' ? 'nanumgothic' : 'nanummyeongjo');
  return out;
}

export function fileFor(family: CatalogFamily, style: Style): FamilyFile {
  return family.styles[style.bold ? (style.italic ? 'boldItalic' : 'bold') : style.italic ? 'italic' : 'regular'];
}
