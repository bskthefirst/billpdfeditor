/**
 * Content-stream tokenizer. Every operation keeps the exact byte range it occupies in the (decoded) stream so that
 * the editor can rewrite one `Tj`/`TJ` and leave every other byte alone.
 */
import { Lexer, isWhite } from './lexer';
import { ObjectParser } from './parser';
import { PdfName, PdfString, type PdfDict, type PdfValue } from './objects';

export interface Operation {
  op: string;
  /** Operand values (arrays/dicts already parsed; strings keep their raw bytes). */
  args: PdfValue[];
  /** Byte range of each top-level operand in the stream. */
  argRanges: Array<[number, number]>;
  /** Range of the whole operation: first operand … operator. */
  start: number;
  end: number;
  /** Range of the operator keyword itself. */
  opStart: number;
  opEnd: number;
  inlineImage?: { dict: PdfDict; dataStart: number; dataEnd: number };
}

const IMAGE_KEYS: Record<string, string> = {
  BPC: 'BitsPerComponent',
  CS: 'ColorSpace',
  D: 'Decode',
  DP: 'DecodeParms',
  F: 'Filter',
  H: 'Height',
  IM: 'ImageMask',
  I: 'Interpolate',
  W: 'Width',
  L: 'Length',
};
const CS_COMPONENTS: Record<string, number> = { G: 1, DeviceGray: 1, RGB: 3, DeviceRGB: 3, CMYK: 4, DeviceCMYK: 4 };

const isTextual = (b: number) => b === 9 || b === 10 || b === 13 || (b >= 32 && b <= 126);

function inlineImageLength(buf: Uint8Array, dataStart: number, dict: PdfDict): number {
  const num = (k: string) => {
    const v = dict.get(k);
    return typeof v === 'number' ? v : undefined;
  };
  const len = num('Length');
  if (len !== undefined && len >= 0 && dataStart + len <= buf.length) return len;
  const filter = dict.get('Filter');
  if (filter === undefined || filter === null) {
    const w = num('Width');
    const h = num('Height');
    const mask = dict.get('ImageMask') === true;
    const bpc = mask ? 1 : num('BitsPerComponent');
    const cs = dict.get('ColorSpace');
    const comps = mask ? 1 : cs instanceof PdfName ? CS_COMPONENTS[cs.name] : Array.isArray(cs) ? 1 : undefined;
    if (w && h && bpc && comps) return Math.ceil((w * bpc * comps) / 8) * h;
  }
  // scan for "EI" delimited by whitespace and followed by plausible content-stream text
  for (let i = dataStart; i + 1 < buf.length; i++) {
    if (buf[i] !== 0x45 || buf[i + 1] !== 0x49) continue;
    if (i > dataStart && !isWhite(buf[i - 1])) continue;
    if (i + 2 < buf.length && !isWhite(buf[i + 2])) continue;
    let ok = true;
    for (let j = i + 2; j < Math.min(buf.length, i + 2 + 12); j++) {
      if (!isTextual(buf[j])) {
        ok = false;
        break;
      }
    }
    if (ok) return i - dataStart - (i > dataStart ? 1 : 0);
  }
  return buf.length - dataStart;
}

export function parseContent(buf: Uint8Array): Operation[] {
  const lx = new Lexer(buf);
  const parser = new ObjectParser(lx);
  const ops: Operation[] = [];
  let args: PdfValue[] = [];
  let ranges: Array<[number, number]> = [];
  for (;;) {
    lx.skipWhite();
    const s = lx.pos;
    const t = lx.next();
    if (t.k === 'eof') break;
    if (t.k === 'kw') {
      const keyword = t.v;
      if (keyword === 'true' || keyword === 'false' || keyword === 'null') {
        args.push(keyword === 'true' ? true : keyword === 'false' ? false : null);
        ranges.push([s, t.e]);
        continue;
      }
      const start = ranges.length ? ranges[0][0] : s;
      const op: Operation = { op: keyword, args, argRanges: ranges, start, end: t.e, opStart: t.s, opEnd: t.e };
      if (keyword === 'BI') {
        const dict: PdfDict = new Map();
        for (;;) {
          const k = lx.next();
          if (k.k === 'eof') break;
          if (k.k === 'kw' && k.v === 'ID') {
            const dataStart = Math.min(buf.length, lx.pos + (isWhite(buf[lx.pos]) ? 1 : 0));
            const len = inlineImageLength(buf, dataStart, dict);
            let dataEnd = dataStart + len;
            lx.pos = dataEnd;
            // consume optional whitespace and the EI keyword
            lx.skipWhite();
            const ei = lx.next();
            if (!(ei.k === 'kw' && ei.v === 'EI')) {
              lx.pos = dataEnd;
              dataEnd = Math.min(dataEnd, buf.length);
            }
            op.inlineImage = { dict, dataStart, dataEnd };
            op.end = lx.pos;
            break;
          }
          if (k.k !== 'name') continue;
          const v = parser.parse();
          dict.set(IMAGE_KEYS[k.v] ?? k.v, v);
        }
      }
      ops.push(op);
      args = [];
      ranges = [];
      continue;
    }
    // operand
    const v = parser.parse(t);
    args.push(v);
    ranges.push([s, lx.pos]);
    if (args.length > 512) {
      args = [];
      ranges = [];
    }
  }
  return ops;
}

export const isString = (v: unknown): v is PdfString => v instanceof PdfString;
