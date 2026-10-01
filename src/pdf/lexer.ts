/**
 * Tokenizer shared by the object parser and the content-stream parser.
 * Tolerant in the same places real-world PDFs force readers to be (e.g. `0cm`, stray bytes, missing endobj).
 */

export type Token =
  | { k: 'num'; v: number; int: boolean; s: number; e: number }
  | { k: 'str'; v: Uint8Array; hex: boolean; s: number; e: number }
  | { k: 'name'; v: string; s: number; e: number }
  | { k: 'kw'; v: string; s: number; e: number }
  | { k: '[' | ']' | '<<' | '>>' | '{' | '}' | 'eof'; s: number; e: number };

// 1 = whitespace, 2 = delimiter, 0 = regular
const CLASS = new Uint8Array(256);
for (const c of [0, 9, 10, 12, 13, 32]) CLASS[c] = 1;
for (const c of '()<>[]{}/%') CLASS[c.charCodeAt(0)] = 2;

export const isWhite = (c: number): boolean => CLASS[c] === 1;
export const isDelim = (c: number): boolean => CLASS[c] === 2;
export const isRegular = (c: number): boolean => CLASS[c] === 0;

const hexVal = (c: number): number => (c >= 48 && c <= 57 ? c - 48 : c >= 65 && c <= 70 ? c - 55 : c >= 97 && c <= 102 ? c - 87 : -1);

export class Lexer {
  constructor(
    readonly buf: Uint8Array,
    public pos = 0,
    readonly end = buf.length,
  ) {}

  skipWhite(): void {
    const { buf, end } = this;
    while (this.pos < end) {
      const c = buf[this.pos];
      if (CLASS[c] === 1) this.pos++;
      else if (c === 0x25 /* % */) {
        while (this.pos < end && buf[this.pos] !== 10 && buf[this.pos] !== 13) this.pos++;
      } else break;
    }
  }

  next(): Token {
    this.skipWhite();
    const { buf, end } = this;
    const s = this.pos;
    if (s >= end) return { k: 'eof', s, e: s };
    const c = buf[s];

    // numbers (tolerant: stops at the first byte that cannot continue a number, like pdf.js)
    if ((c >= 48 && c <= 57) || c === 43 || c === 45 || c === 46) {
      const num = this.readNumber();
      if (num) return num;
    }
    switch (c) {
      case 0x2f /* / */:
        return this.readName();
      case 0x28 /* ( */:
        return this.readLiteralString();
      case 0x3c /* < */:
        if (buf[s + 1] === 0x3c) {
          this.pos += 2;
          return { k: '<<', s, e: this.pos };
        }
        return this.readHexString();
      case 0x3e /* > */:
        if (buf[s + 1] === 0x3e) {
          this.pos += 2;
          return { k: '>>', s, e: this.pos };
        }
        this.pos++;
        return this.next(); // stray '>' — skip
      case 0x5b:
        this.pos++;
        return { k: '[', s, e: this.pos };
      case 0x5d:
        this.pos++;
        return { k: ']', s, e: this.pos };
      case 0x7b:
        this.pos++;
        return { k: '{', s, e: this.pos };
      case 0x7d:
        this.pos++;
        return { k: '}', s, e: this.pos };
      case 0x29 /* ) */:
        this.pos++;
        return this.next(); // stray ')' — skip
    }
    // keyword / operator
    let p = s;
    while (p < end && CLASS[buf[p]] === 0) p++;
    if (p === s) {
      this.pos++;
      return this.next();
    }
    this.pos = p;
    let v = '';
    for (let i = s; i < p; i++) v += String.fromCharCode(buf[i]);
    return { k: 'kw', v, s, e: p };
  }

  /** Look at the next token without consuming it. */
  peek(): Token {
    const save = this.pos;
    const t = this.next();
    this.pos = save;
    return t;
  }

  private readNumber(): Token | null {
    const { buf, end } = this;
    const s = this.pos;
    let p = s;
    let sign = 1;
    while (p < end && (buf[p] === 43 || buf[p] === 45)) {
      if (buf[p] === 45) sign = -1;
      p++;
    }
    let intPart = 0;
    let digits = 0;
    while (p < end && buf[p] >= 48 && buf[p] <= 57) {
      intPart = intPart * 10 + (buf[p] - 48);
      p++;
      digits++;
    }
    let isInt = true;
    let value = intPart;
    if (p < end && buf[p] === 46) {
      isInt = false;
      p++;
      let frac = 0;
      let places = 0;
      while (p < end && buf[p] >= 48 && buf[p] <= 57) {
        if (places < 15) {
          frac = frac * 10 + (buf[p] - 48);
          places++;
        }
        p++;
        digits++;
      }
      value = places ? (intPart * 10 ** places + frac) / 10 ** places : intPart; // exact: one division, no accumulated error
      // swallow pathological "1.2.3" tails
      while (p < end && (buf[p] === 46 || (buf[p] >= 48 && buf[p] <= 57))) p++;
    }
    if (digits === 0) {
      // a lone '-', '+', or '.' → treat as 0 when delimited, otherwise not a number
      if (p === s) return null;
      if (p < end && CLASS[buf[p]] === 0) return null;
      this.pos = p;
      return { k: 'num', v: 0, int: true, s, e: p };
    }
    this.pos = p;
    return { k: 'num', v: sign * value, int: isInt, s, e: p };
  }

  private readName(): Token {
    const { buf, end } = this;
    const s = this.pos;
    let p = s + 1;
    let v = '';
    while (p < end && CLASS[buf[p]] === 0) {
      const c = buf[p];
      if (c === 0x23 /* # */ && p + 2 < end + 0 && hexVal(buf[p + 1]) >= 0 && hexVal(buf[p + 2]) >= 0) {
        v += String.fromCharCode(hexVal(buf[p + 1]) * 16 + hexVal(buf[p + 2]));
        p += 3;
      } else {
        v += String.fromCharCode(c);
        p++;
      }
    }
    this.pos = p;
    return { k: 'name', v, s, e: p };
  }

  private readLiteralString(): Token {
    const { buf, end } = this;
    const s = this.pos;
    let p = s + 1;
    let depth = 1;
    const out: number[] = [];
    while (p < end) {
      const c = buf[p++];
      if (c === 0x5c /* \ */) {
        const n = buf[p++];
        switch (n) {
          case 0x6e:
            out.push(10);
            break; // n
          case 0x72:
            out.push(13);
            break; // r
          case 0x74:
            out.push(9);
            break; // t
          case 0x62:
            out.push(8);
            break; // b
          case 0x66:
            out.push(12);
            break; // f
          case 13:
            if (buf[p] === 10) p++;
            break; // line continuation
          case 10:
            break;
          default:
            if (n >= 48 && n <= 55) {
              let v = n - 48;
              for (let i = 0; i < 2 && p < end && buf[p] >= 48 && buf[p] <= 55; i++) v = v * 8 + (buf[p++] - 48);
              out.push(v & 255);
            } else if (n !== undefined) out.push(n);
        }
      } else if (c === 0x28) {
        depth++;
        out.push(c);
      } else if (c === 0x29) {
        if (--depth === 0) break;
        out.push(c);
      } else if (c === 13) {
        if (buf[p] === 10) p++;
        out.push(10);
      } else out.push(c);
    }
    this.pos = p;
    return { k: 'str', v: Uint8Array.from(out), hex: false, s, e: p };
  }

  private readHexString(): Token {
    const { buf, end } = this;
    const s = this.pos;
    let p = s + 1;
    const out: number[] = [];
    let hi = -1;
    while (p < end) {
      const c = buf[p++];
      if (c === 0x3e) break;
      const h = hexVal(c);
      if (h < 0) continue;
      if (hi < 0) hi = h;
      else {
        out.push(hi * 16 + h);
        hi = -1;
      }
    }
    if (hi >= 0) out.push(hi * 16);
    this.pos = p;
    return { k: 'str', v: Uint8Array.from(out), hex: true, s, e: p };
  }
}
