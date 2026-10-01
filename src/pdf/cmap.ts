/** Minimal CMap reader: enough for /ToUnicode streams and embedded Type0 encoding CMaps. */
import { Lexer } from './lexer';

export interface CMapData {
  /** Code lengths in bytes that the CMap defines (from codespace ranges). */
  codespaces: Array<{ len: number; lo: number; hi: number }>;
  /** code → unicode string (bfchar/bfrange). */
  unicode: Map<number, string>;
  /** code → CID (cidchar/cidrange), for embedded encoding CMaps. */
  cid: Map<number, number>;
  cidRanges: Array<{ lo: number; hi: number; cid: number; len: number }>;
  wmode: number;
  /** `usecmap` parent, by name (resolved by the caller). */
  useCMap?: string;
}

const be = (b: Uint8Array): number => {
  let v = 0;
  for (const x of b) v = v * 256 + x;
  return v;
};
function utf16be(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode((b[i] << 8) | b[i + 1]);
  if (b.length === 1) s = String.fromCharCode(b[0]);
  return s;
}

export function parseCMap(data: Uint8Array): CMapData {
  const lx = new Lexer(data);
  const out: CMapData = { codespaces: [], unicode: new Map(), cid: new Map(), cidRanges: [], wmode: 0 };
  let prevName = '';
  for (;;) {
    const t = lx.next();
    if (t.k === 'eof') break;
    if (t.k === 'name') {
      prevName = t.v;
      // "/WMode 1 def"
      if (t.v === 'WMode') {
        const n = lx.next();
        if (n.k === 'num') out.wmode = n.v;
      }
      continue;
    }
    if (t.k !== 'kw') continue;
    switch (t.v) {
      case 'usecmap':
        out.useCMap = prevName;
        break;
      case 'begincodespacerange':
        for (;;) {
          const a = lx.next();
          if (a.k !== 'str') break;
          const b = lx.next();
          if (b.k !== 'str') break;
          out.codespaces.push({ len: a.v.length, lo: be(a.v), hi: be(b.v) });
        }
        break;
      case 'beginbfchar':
        for (;;) {
          const a = lx.next();
          if (a.k !== 'str') break;
          const b = lx.next();
          if (b.k === 'str') out.unicode.set(be(a.v), utf16be(b.v));
          else if (b.k === 'name') out.unicode.set(be(a.v), b.v); // glyph name destination; rare
        }
        break;
      case 'beginbfrange':
        for (;;) {
          const a = lx.next();
          if (a.k !== 'str') break;
          const b = lx.next();
          if (b.k !== 'str') break;
          const lo = be(a.v);
          const hi = be(b.v);
          const c = lx.next();
          if (c.k === 'str') {
            const base = utf16be(c.v);
            if (!base.length) continue;
            const last = base.charCodeAt(base.length - 1);
            for (let code = lo; code <= hi && code - lo < 65536; code++)
              out.unicode.set(code, base.slice(0, -1) + String.fromCharCode(last + (code - lo)));
          } else if (c.k === '[') {
            let code = lo;
            for (;;) {
              const d = lx.next();
              if (d.k !== 'str') break;
              out.unicode.set(code++, utf16be(d.v));
            }
          }
        }
        break;
      case 'begincidchar':
        for (;;) {
          const a = lx.next();
          if (a.k !== 'str') break;
          const b = lx.next();
          if (b.k === 'num') out.cid.set(be(a.v), b.v);
        }
        break;
      case 'begincidrange':
        for (;;) {
          const a = lx.next();
          if (a.k !== 'str') break;
          const b = lx.next();
          const c = lx.next();
          if (b.k !== 'str' || c.k !== 'num') break;
          out.cidRanges.push({ lo: be(a.v), hi: be(b.v), cid: c.v, len: a.v.length });
        }
        break;
    }
  }
  return out;
}
