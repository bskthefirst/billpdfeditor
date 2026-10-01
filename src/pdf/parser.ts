import { Lexer, type Token } from './lexer';
import { PdfName, PdfRef, PdfString, type PdfDict, type PdfValue } from './objects';

const TERMINATORS = new Set(['endobj', 'stream', 'endstream', 'obj', 'xref', 'trailer', 'startxref']);

/** Recursive-descent parser for PDF objects (everything except stream bodies, which the file reader handles). */
export class ObjectParser {
  constructor(readonly lx: Lexer) {}

  parse(tok: Token = this.lx.next()): PdfValue {
    switch (tok.k) {
      case 'num': {
        if (tok.int && tok.v >= 0) {
          const save = this.lx.pos;
          const t2 = this.lx.next();
          if (t2.k === 'num' && t2.int && t2.v >= 0) {
            const t3 = this.lx.next();
            if (t3.k === 'kw' && t3.v === 'R') return new PdfRef(tok.v, t2.v);
          }
          this.lx.pos = save;
        }
        return tok.v;
      }
      case 'str':
        return new PdfString(tok.v);
      case 'name':
        return new PdfName(tok.v);
      case '[': {
        const arr: PdfValue[] = [];
        for (;;) {
          const save = this.lx.pos;
          const t = this.lx.next();
          if (t.k === ']' || t.k === 'eof') break;
          if (t.k === 'kw' && TERMINATORS.has(t.v)) {
            this.lx.pos = save;
            break;
          }
          if (t.k === '>>') continue;
          arr.push(this.parse(t));
        }
        return arr;
      }
      case '<<': {
        const d: PdfDict = new Map();
        for (;;) {
          const save = this.lx.pos;
          const k = this.lx.next();
          if (k.k === '>>' || k.k === 'eof') break;
          if (k.k !== 'name') {
            if (k.k === 'kw' && TERMINATORS.has(k.v)) {
              this.lx.pos = save;
              break;
            }
            continue; // junk between entries
          }
          const afterKey = this.lx.pos;
          const vt = this.lx.next();
          if (vt.k === '>>') {
            d.set(k.v, null);
            break;
          }
          if (vt.k === 'kw' && TERMINATORS.has(vt.v)) {
            this.lx.pos = afterKey;
            d.set(k.v, null);
            break;
          }
          d.set(k.v, this.parse(vt));
        }
        return d;
      }
      case 'kw':
        if (tok.v === 'true') return true;
        if (tok.v === 'false') return false;
        return null;
      default:
        return null;
    }
  }
}

export function parseObjectAt(buf: Uint8Array, pos: number): PdfValue {
  return new ObjectParser(new Lexer(buf, pos)).parse();
}
