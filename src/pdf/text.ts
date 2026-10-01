/**
 * Text-state interpreter. Walks page (and form XObject) content streams and records every text-showing operation with
 * its byte range and per-glyph geometry. It never modifies anything; `patch.ts` uses these ranges to rewrite operators.
 */
import { parseContent, type Operation } from './content';
import type { PdfFile, PdfPage } from './file';
import { loadFont, type PdfFont } from './font';
import { Lexer } from './lexer';
import { IDENTITY, apply, mul, translate, type Mat } from './matrix';
import { PdfName, PdfString, isArray, isDict, isNum, isStream, type PdfDict, type PdfStream, type PdfValue } from './objects';

/** Where one original content stream sits inside a unit's concatenated bytes. */
export interface Segment {
  /** Object number of the stream (0 if direct, which is invalid but tolerated). */
  num: number;
  stream: PdfStream;
  start: number;
  end: number;
}

/**
 * The thing that is parsed — and later patched — as a whole: a page's content streams concatenated (the spec treats
 * them as one stream; operators and even arrays may straddle stream boundaries) or a single form XObject.
 */
export interface ContentUnit {
  kind: 'page' | 'form';
  /** Form XObject object number (0 for pages). */
  num: number;
  bytes: Uint8Array;
  segments: Segment[];
  ops: Operation[];
}

export interface StringElement {
  kind: 'str';
  range: [number, number];
  bytes: Uint8Array;
}
export interface AdjustElement {
  kind: 'adj';
  range: [number, number];
  value: number;
}

export interface Glyph {
  code: number;
  len: number;
  unicode: string;
  /** Origin in default user space before this glyph's advance. */
  x: number;
  y: number;
  /** Advance in text-space units, including Tc/Tw/Th (and excluding TJ adjustments). */
  tx: number;
  /** The same advance as a vector in default user space. */
  ax: number;
  ay: number;
  /** Which string element of the operation, and the byte offset inside that string. */
  elem: number;
  offset: number;
}

export interface ShowOp {
  unit: ContentUnit;
  /** Index into `unit.ops`. */
  opIndex: number;
  /** `Tj` | `TJ` | `'` | `"` */
  op: string;
  start: number;
  end: number;
  font: PdfFont | null;
  fontSize: number;
  tc: number;
  tw: number;
  th: number;
  rise: number;
  renderMode: number;
  /** Text matrix at the start of the operation and CTM in force. */
  tm: Mat;
  ctm: Mat;
  /** User-space vectors of one em along the baseline and perpendicular to it (already multiplied by the font size). */
  right: [number, number];
  up: [number, number];
  elements: Array<StringElement | AdjustElement>;
  glyphs: Glyph[];
  resources: PdfDict | null;
}

interface TextParams {
  tc: number;
  tw: number;
  th: number;
  tl: number;
  font: PdfFont | null;
  fs: number;
  tr: number;
  rise: number;
}
interface GState {
  ctm: Mat;
  tp: TextParams;
  /** Text matrices and the q/Q stack live here (not per stream): one BT…ET block may span several streams. */
  tm: Mat;
  tlm: Mat;
  stack: Array<{ ctm: Mat; tp: TextParams }>;
}

const freshState = (ctm: Mat, tp?: TextParams): GState => ({
  ctm,
  tp: tp ?? { tc: 0, tw: 0, th: 1, tl: 0, font: null, fs: 0, tr: 0, rise: 0 },
  tm: IDENTITY,
  tlm: IDENTITY,
  stack: [],
});

const num = (v: PdfValue | undefined): number => (isNum(v) ? v : 0);

function arrayElements(buf: Uint8Array, start: number, end: number): Array<StringElement | AdjustElement> {
  const out: Array<StringElement | AdjustElement> = [];
  const lx = new Lexer(buf, start, end);
  const open = lx.next();
  if (open.k !== '[') return out;
  for (;;) {
    const t = lx.next();
    if (t.k === ']' || t.k === 'eof') break;
    if (t.k === 'str') out.push({ kind: 'str', range: [t.s, t.e], bytes: t.v });
    else if (t.k === 'num') out.push({ kind: 'adj', range: [t.s, t.e], value: t.v });
  }
  return out;
}

export class TextExtractor {
  private readonly fonts = new Map<PdfDict, PdfFont | null>();
  /** Every unit parsed during extraction (the page, then each form it draws), so patching reuses the same parse. */
  readonly units: ContentUnit[] = [];

  /**
   * `pdfiumWidths` reproduces PDFium's integer truncation of glyph widths. Only the test oracle comparison uses it;
   * real extraction keeps the exact (fractional) widths the PDF specifies.
   */
  constructor(
    private readonly file: PdfFile,
    private readonly opts: { pdfiumWidths?: boolean } = {},
  ) {}

  extractPage(page: PdfPage): ShowOp[] {
    const out: ShowOp[] = [];
    const parts: Array<{ num: number; stream: PdfStream; data: Uint8Array }> = [];
    for (const s of this.file.contentStreams(page)) {
      try {
        parts.push({ num: s.num, stream: s.stream, data: this.file.decode(s.stream) });
      } catch {
        /* unreadable stream: skip it */
      }
    }
    let total = 0;
    for (const p of parts) total += p.data.length + 1;
    const bytes = new Uint8Array(total);
    const segments: Segment[] = [];
    let o = 0;
    for (const p of parts) {
      bytes.set(p.data, o);
      segments.push({ num: p.num, stream: p.stream, start: o, end: o + p.data.length });
      o += p.data.length;
      bytes[o++] = 10; // streams are separated by whitespace when concatenated
    }
    const unit: ContentUnit = { kind: 'page', num: 0, bytes, segments, ops: parseContent(bytes) };
    this.units.push(unit);
    this.run(unit, page.resources, freshState(IDENTITY), out, 0, new Set());
    return out;
  }

  private font(resources: PdfDict | null, name: string): PdfFont | null {
    const fonts = this.file.get(resources, 'Font');
    if (!isDict(fonts)) return null;
    const v = fonts.get(name) ?? null;
    const d = this.file.resolve(v);
    if (!isDict(d)) return null;
    if (this.fonts.has(d)) return this.fonts.get(d)!;
    let f: PdfFont | null = null;
    try {
      f = loadFont(this.file, v, name);
    } catch {
      f = null;
    }
    if (f && this.opts.pdfiumWidths) {
      const exact = f.advance.bind(f);
      f = { ...f, advance: (c: number) => Math.trunc(exact(c) * 1000) / 1000 };
    }
    this.fonts.set(d, f);
    return f;
  }

  private run(unit: ContentUnit, resources: PdfDict | null, st: GState, out: ShowOp[], depth: number, activeForms: Set<number>): void {
    const { bytes, ops } = unit;
    const tp = () => st.tp;

    const show = (opIndex: number, op: Operation, elements: Array<StringElement | AdjustElement>, kind: string) => {
      const p = tp();
      const m0 = mul(st.tm, st.ctm);
      const rec: ShowOp = {
        unit,
        opIndex,
        op: kind,
        start: op.start,
        end: op.end,
        font: p.font,
        fontSize: p.fs,
        tc: p.tc,
        tw: p.tw,
        th: p.th,
        rise: p.rise,
        renderMode: p.tr,
        tm: st.tm,
        ctm: st.ctm,
        right: [m0[0] * p.fs * p.th, m0[1] * p.fs * p.th],
        up: [m0[2] * p.fs, m0[3] * p.fs],
        elements,
        glyphs: [],
        resources,
      };
      const font = p.font;
      elements.forEach((el, ei) => {
        if (el.kind === 'adj') {
          // TJ adjustment: thousandths of text space, positive moves left (horizontal writing)
          st.tm = mul(translate((-el.value / 1000) * p.fs * p.th, 0), st.tm);
          return;
        }
        const b = el.bytes;
        for (let pos = 0; pos < b.length;) {
          const { code, len } = font ? font.nextCode(b, pos) : { code: b[pos], len: 1 };
          const adv = font ? font.advance(code) : 0;
          const word = font ? font.isWordSpace(code, len) : false;
          const tx = (adv * p.fs + p.tc + (word ? p.tw : 0)) * p.th;
          const gm = mul(st.tm, st.ctm);
          const [x, y] = apply(gm, 0, p.rise);
          rec.glyphs.push({
            code,
            len,
            unicode: font ? font.unicode(code) : '',
            x,
            y,
            tx,
            ax: tx * gm[0],
            ay: tx * gm[1],
            elem: ei,
            offset: pos,
          });
          st.tm = mul(translate(tx, 0), st.tm);
          pos += Math.max(1, len);
        }
      });
      out.push(rec);
    };

    ops.forEach((op, i) => {
      const a = op.args;
      switch (op.op) {
        case 'q':
          st.stack.push({ ctm: st.ctm, tp: { ...st.tp } });
          break;
        case 'Q': {
          const s = st.stack.pop();
          if (s) {
            st.ctm = s.ctm;
            st.tp = s.tp;
          }
          break;
        }
        case 'cm':
          if (a.length >= 6) st.ctm = mul([num(a[0]), num(a[1]), num(a[2]), num(a[3]), num(a[4]), num(a[5])], st.ctm);
          break;
        case 'BT':
          st.tm = IDENTITY;
          st.tlm = IDENTITY;
          break;
        case 'Tc':
          tp().tc = num(a[0]);
          break;
        case 'Tw':
          tp().tw = num(a[0]);
          break;
        case 'Tz':
          tp().th = num(a[0]) / 100;
          break;
        case 'TL':
          tp().tl = num(a[0]);
          break;
        case 'Ts':
          tp().rise = num(a[0]);
          break;
        case 'Tr':
          tp().tr = num(a[0]);
          break;
        case 'Tf': {
          const n = a[0] instanceof PdfName ? a[0].name : '';
          tp().font = this.font(resources, n);
          tp().fs = num(a[1]);
          break;
        }
        case 'Td':
          st.tlm = mul(translate(num(a[0]), num(a[1])), st.tlm);
          st.tm = st.tlm;
          break;
        case 'TD':
          tp().tl = -num(a[1]);
          st.tlm = mul(translate(num(a[0]), num(a[1])), st.tlm);
          st.tm = st.tlm;
          break;
        case 'Tm':
          if (a.length >= 6) {
            st.tlm = [num(a[0]), num(a[1]), num(a[2]), num(a[3]), num(a[4]), num(a[5])];
            st.tm = st.tlm;
          }
          break;
        case 'T*':
          st.tlm = mul(translate(0, -tp().tl), st.tlm);
          st.tm = st.tlm;
          break;
        case 'Tj':
          if (a[0] instanceof PdfString) show(i, op, [{ kind: 'str', range: op.argRanges[0], bytes: a[0].bytes }], 'Tj');
          break;
        case "'":
          st.tlm = mul(translate(0, -tp().tl), st.tlm);
          st.tm = st.tlm;
          if (a[0] instanceof PdfString) show(i, op, [{ kind: 'str', range: op.argRanges[0], bytes: a[0].bytes }], "'");
          break;
        case '"':
          tp().tw = num(a[0]);
          tp().tc = num(a[1]);
          st.tlm = mul(translate(0, -tp().tl), st.tlm);
          st.tm = st.tlm;
          if (a[2] instanceof PdfString) show(i, op, [{ kind: 'str', range: op.argRanges[2], bytes: a[2].bytes }], '"');
          break;
        case 'TJ':
          if (isArray(a[0])) show(i, op, arrayElements(bytes, op.argRanges[0][0], op.argRanges[0][1]), 'TJ');
          break;
        case 'gs': {
          const gsName = a[0] instanceof PdfName ? a[0].name : '';
          const gsDict = this.file.get(this.file.get(resources, 'ExtGState') as PdfDict | null, gsName);
          if (isDict(gsDict)) {
            const f = this.file.resolve(gsDict.get('Font') ?? null);
            if (isArray(f) && f.length >= 2) {
              const d = this.file.resolve(f[0]);
              if (isDict(d)) {
                let font = this.fonts.get(d) ?? null;
                if (!this.fonts.has(d)) {
                  try {
                    font = loadFont(this.file, f[0], 'gs-font');
                  } catch {
                    font = null;
                  }
                  this.fonts.set(d, font);
                }
                tp().font = font;
                tp().fs = num(this.file.resolve(f[1]));
              }
            }
          }
          break;
        }
        case 'Do': {
          if (depth >= 12) break;
          const xName = a[0] instanceof PdfName ? a[0].name : '';
          const xobjs = this.file.get(resources, 'XObject');
          if (!isDict(xobjs)) break;
          const ref = xobjs.get(xName) ?? null;
          const xo = this.file.resolve(ref);
          if (!isStream(xo) || this.file.name(xo.dict.get('Subtype') ?? null) !== 'Form') break;
          const fnum = ref instanceof Object && 'num' in ref ? (ref as { num: number }).num : 0;
          if (fnum && activeForms.has(fnum)) break;
          let fbytes: Uint8Array;
          try {
            fbytes = this.file.decode(xo);
          } catch {
            break;
          }
          const mArr = this.file.resolve(xo.dict.get('Matrix') ?? null);
          const m: Mat = isArray(mArr) && mArr.length >= 6 ? (mArr.slice(0, 6).map((x) => num(this.file.resolve(x))) as Mat) : IDENTITY;
          const fres = this.file.resolve(xo.dict.get('Resources') ?? null);
          const sub = freshState(mul(m, st.ctm), { ...st.tp });
          const formUnit: ContentUnit = {
            kind: 'form',
            num: fnum,
            bytes: fbytes,
            segments: [{ num: fnum, stream: xo, start: 0, end: fbytes.length }],
            ops: parseContent(fbytes),
          };
          this.units.push(formUnit);
          if (fnum) activeForms.add(fnum);
          this.run(formUnit, isDict(fres) ? fres : resources, sub, out, depth + 1, activeForms);
          if (fnum) activeForms.delete(fnum);
          break;
        }
      }
    });
  }
}

/** The font size as actually painted: `Tf` size × the vertical scale of text matrix × CTM (many PDFs use size 1 and scale via the matrices). */
export function effectiveFontSize(op: Pick<ShowOp, 'fontSize' | 'tm' | 'ctm'>): number {
  const m = mul(op.tm, op.ctm);
  return Math.abs(op.fontSize) * Math.hypot(m[2], m[3]);
}
