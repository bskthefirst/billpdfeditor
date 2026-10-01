/** PDF object model. Dictionaries are `Map`s keyed by name without the leading slash. */

export class PdfName {
  constructor(readonly name: string) {}
  toString(): string {
    return `/${this.name}`;
  }
}

export class PdfRef {
  constructor(
    readonly num: number,
    readonly gen: number,
  ) {}
  toString(): string {
    return `${this.num} ${this.gen} R`;
  }
}

export class PdfString {
  constructor(readonly bytes: Uint8Array) {}
  /** Text string per ISO 32000 §7.9.2.2 (UTF-16BE with BOM, UTF-8 with BOM, else Latin-1 as an approximation of PDFDocEncoding). */
  toText(): string {
    const b = this.bytes;
    if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));
    if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return new TextDecoder('utf-8').decode(b.subarray(3));
    let s = '';
    for (const c of b) s += String.fromCharCode(c);
    return s;
  }
}

export type PdfDict = Map<string, PdfValue>;
export type PdfArray = PdfValue[];

export class PdfStream {
  constructor(
    readonly dict: PdfDict,
    private readonly buf: Uint8Array,
    /** Offsets of the raw (still filtered) bytes inside the file buffer. */
    readonly start: number,
    readonly end: number,
  ) {}
  get raw(): Uint8Array {
    return this.buf.subarray(this.start, this.end);
  }
}

/** A stream that does not live in a file buffer (used when building new objects). */
export class PdfNewStream {
  constructor(
    readonly dict: PdfDict,
    readonly data: Uint8Array,
  ) {}
}

export type PdfValue = null | boolean | number | PdfName | PdfString | PdfRef | PdfValue[] | PdfDict | PdfStream | PdfNewStream;

export const isDict = (v: unknown): v is PdfDict => v instanceof Map;
export const isArray = (v: unknown): v is PdfArray => Array.isArray(v);
export const isName = (v: unknown, name?: string): v is PdfName => v instanceof PdfName && (name === undefined || v.name === name);
export const isRef = (v: unknown): v is PdfRef => v instanceof PdfRef;
export const isStream = (v: unknown): v is PdfStream => v instanceof PdfStream;
export const isNum = (v: unknown): v is number => typeof v === 'number';

export function dict(entries: Record<string, PdfValue> = {}): PdfDict {
  return new Map(Object.entries(entries));
}
export const name = (n: string): PdfName => new PdfName(n);
export const ref = (num: number, gen = 0): PdfRef => new PdfRef(num, gen);
