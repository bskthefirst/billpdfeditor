import { Lexer } from './lexer';
import { ObjectParser } from './parser';
import { decodeStream } from './filters';
import { PdfName, PdfRef, PdfStream, isArray, isDict, isName, isNum, isRef, isStream, type PdfDict, type PdfValue } from './objects';

export type XrefEntry = { t: 'free' } | { t: 'obj'; offset: number; gen: number } | { t: 'stm'; stm: number; idx: number };

export class EncryptedPdfError extends Error {
  constructor() {
    super('PDF is encrypted');
  }
}

export interface PdfPage {
  index: number;
  /** Object number of the page dictionary (0 if the page dictionary is direct, which is invalid but seen in the wild). */
  num: number;
  dict: PdfDict;
  resources: PdfDict | null;
  mediaBox: [number, number, number, number];
  cropBox: [number, number, number, number] | null;
  rotate: number;
}

export interface ContentStreamRef {
  /** Object number of the stream (needed to replace it in an incremental update). */
  num: number;
  stream: PdfStream;
}

const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const ENDSTREAM = ascii('endstream');

function indexOf(buf: Uint8Array, needle: Uint8Array, from: number, to = buf.length): number {
  const n0 = needle[0];
  outer: for (let i = from; i <= to - needle.length; i++) {
    if (buf[i] !== n0) continue;
    for (let j = 1; j < needle.length; j++) if (buf[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}
function lastIndexOf(buf: Uint8Array, needle: Uint8Array): number {
  outer: for (let i = buf.length - needle.length; i >= 0; i--) {
    for (let j = 0; j < needle.length; j++) if (buf[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

export class PdfFile {
  readonly xref = new Map<number, XrefEntry>();
  trailer: PdfDict = new Map();
  /** Offset (relative to the header) of the newest xref section; becomes /Prev of an incremental update. */
  startxref = 0;
  xrefKind: 'table' | 'stream' = 'table';
  repaired = false;
  private base = 0;
  /** Byte offset of the `%PDF-` header; all file offsets in the xref are relative to it. */
  get bytesBase(): number {
    return this.base;
  }
  private readonly cache = new Map<number, PdfValue>();
  private readonly stmCache = new Map<number, Map<number, PdfValue>>();
  private readonly busy = new Set<number>();

  private constructor(readonly bytes: Uint8Array) {}

  static load(bytes: Uint8Array): PdfFile {
    const f = new PdfFile(bytes);
    const head = indexOf(bytes, ascii('%PDF-'), 0, Math.min(bytes.length, 1024));
    f.base = head > 0 ? head : 0;
    let ok = false;
    try {
      f.readXrefChain();
      ok = f.rootIsValid();
    } catch {
      ok = false;
    }
    if (!ok) f.reconstruct();
    if (!f.rootIsValid()) throw new Error('Could not locate the document catalog');
    return f;
  }

  get encrypted(): boolean {
    return this.trailer.has('Encrypt');
  }

  /** Next free object number (trailer /Size is authoritative but often wrong, so also look at the xref). */
  nextObjectNumber(): number {
    let max = 0;
    for (const n of this.xref.keys()) if (n > max) max = n;
    const size = this.trailer.get('Size');
    return Math.max(max + 1, isNum(size) ? size : 0);
  }

  generationOf(num: number): number {
    const e = this.xref.get(num);
    return e && e.t === 'obj' ? e.gen : 0;
  }

  // ───────────── xref ─────────────
  private rootIsValid(): boolean {
    const root = this.resolve(this.trailer.get('Root') ?? null);
    return isDict(root) && isDict(this.resolve(root.get('Pages') ?? null));
  }

  private readXrefChain(): void {
    const tail = this.bytes.subarray(Math.max(0, this.bytes.length - 4096));
    const at = lastIndexOf(tail, ascii('startxref'));
    if (at < 0) throw new Error('startxref not found');
    const lx = new Lexer(tail, at + 9);
    const t = lx.next();
    if (t.k !== 'num') throw new Error('bad startxref');
    let off: number | undefined = t.v;
    this.startxref = off;
    const seen = new Set<number>();
    let first = true;
    while (off !== undefined && !seen.has(off)) {
      seen.add(off);
      const l = new Lexer(this.bytes, off + this.base);
      const tok = l.next();
      let trailer: PdfDict;
      if (tok.k === 'kw' && tok.v === 'xref') {
        if (first) this.xrefKind = 'table';
        trailer = this.readXrefTable(l);
        const xs = trailer.get('XRefStm');
        if (isNum(xs)) {
          try {
            this.readXrefStream(xs);
          } catch {
            /* hybrid stream is optional */
          }
        }
      } else if (tok.k === 'num') {
        if (first) this.xrefKind = 'stream';
        trailer = this.readXrefStream(off);
      } else throw new Error('bad xref section');
      for (const [k, v] of trailer) if (!this.trailer.has(k)) this.trailer.set(k, v);
      first = false;
      const prev = trailer.get('Prev');
      off = isNum(prev) ? prev : undefined;
    }
  }

  private setXref(num: number, e: XrefEntry): void {
    if (!this.xref.has(num)) this.xref.set(num, e);
  }

  private readXrefTable(lx: Lexer): PdfDict {
    for (;;) {
      const t = lx.next();
      if (t.k === 'kw' && t.v === 'trailer') {
        const d = new ObjectParser(lx).parse();
        if (!isDict(d)) throw new Error('bad trailer');
        return d;
      }
      if (t.k !== 'num') throw new Error('bad xref subsection');
      let start = t.v;
      const c = lx.next();
      if (c.k !== 'num') throw new Error('bad xref subsection');
      for (let i = 0; i < c.v; i++) {
        const o = lx.next();
        const g = lx.next();
        const k = lx.next();
        if (o.k !== 'num' || g.k !== 'num' || k.k !== 'kw') throw new Error('bad xref entry');
        if (i === 0 && start === 1 && k.v === 'f' && o.v === 0 && g.v === 65535) start = 0; // off-by-one generators
        this.setXref(start + i, k.v === 'n' ? { t: 'obj', offset: o.v, gen: g.v } : { t: 'free' });
      }
    }
  }

  private readXrefStream(offset: number): PdfDict {
    const { value } = this.readIndirectAt(offset + this.base, -1);
    if (!isStream(value) || !isName(value.dict.get('Type'), 'XRef')) throw new Error('bad xref stream');
    const d = value.dict;
    const data = decodeStream(value, (v) => this.resolve(v));
    const w = (this.resolve(d.get('W') ?? null) as PdfValue[]).map((x) => (isNum(x) ? x : 0));
    const size = this.resolve(d.get('Size') ?? 0) as number;
    const idx = (this.resolve(d.get('Index') ?? null) as PdfValue[] | null) ?? [0, size];
    const rec = w[0] + w[1] + w[2];
    const rd = (p: number, n: number) => {
      let v = 0;
      for (let i = 0; i < n; i++) v = v * 256 + data[p + i];
      return v;
    };
    let p = 0;
    for (let s = 0; s + 1 < idx.length; s += 2) {
      const first = idx[s] as number;
      const count = idx[s + 1] as number;
      for (let i = 0; i < count && p + rec <= data.length; i++, p += rec) {
        const type = w[0] ? rd(p, w[0]) : 1;
        const f2 = rd(p + w[0], w[1]);
        const f3 = rd(p + w[0] + w[1], w[2]);
        this.setXref(
          first + i,
          type === 0 ? { t: 'free' } : type === 1 ? { t: 'obj', offset: f2, gen: f3 } : { t: 'stm', stm: f2, idx: f3 },
        );
      }
    }
    return d;
  }

  /** Rebuild the xref by scanning the whole file (damaged or truncated PDFs). */
  private reconstruct(): void {
    this.repaired = true;
    this.xref.clear();
    this.cache.clear();
    this.stmCache.clear();
    this.trailer = new Map();
    const text = new TextDecoder('latin1').decode(this.bytes);
    const objRe = /(?:^|[\s>\]\)])(\d{1,10})[ \t\r\n]+(\d{1,5})[ \t\r\n]+obj\b/g;
    let m: RegExpExecArray | null;
    const found: Array<{ num: number; gen: number; offset: number }> = [];
    while ((m = objRe.exec(text))) {
      const lead = /^[\s>\]\)]/.test(m[0]) ? 1 : 0;
      found.push({ num: Number(m[1]), gen: Number(m[2]), offset: m.index + lead - this.base });
    }
    for (const f of found) this.xref.set(f.num, { t: 'obj', offset: f.offset, gen: f.gen }); // later wins
    // trailers
    const trRe = /trailer\s*<</g;
    const trailers: PdfDict[] = [];
    while ((m = trRe.exec(text))) {
      try {
        const d = new ObjectParser(new Lexer(this.bytes, m.index + m[0].length - 2)).parse();
        if (isDict(d)) trailers.push(d);
      } catch {
        /* ignore */
      }
    }
    // object streams and xref streams
    for (const f of found) {
      const probe = text.substr(f.offset + this.base, 400);
      const isObjStm = /\/Type\s*\/ObjStm/.test(probe);
      const isXref = /\/Type\s*\/XRef/.test(probe);
      if (!isObjStm && !isXref) continue;
      try {
        const { value } = this.readIndirectAt(f.offset + this.base, f.num);
        if (!isStream(value)) continue;
        if (isXref) trailers.push(value.dict);
        if (isObjStm) {
          const n = this.resolve(value.dict.get('N') ?? 0) as number;
          const data = decodeStream(value, (v) => this.resolve(v));
          const lx = new Lexer(data);
          for (let i = 0; i < n; i++) {
            const a = lx.next();
            lx.next();
            if (a.k === 'num' && !this.xref.has(a.v)) this.xref.set(a.v, { t: 'stm', stm: f.num, idx: i });
          }
        }
      } catch {
        /* ignore unreadable streams */
      }
    }
    for (const t of trailers.reverse())
      for (const [k, v] of t)
        if (!this.trailer.has(k) && (k === 'Root' || k === 'Info' || k === 'ID' || k === 'Encrypt' || k === 'Size')) this.trailer.set(k, v);
    if (!this.trailer.has('Root')) {
      for (const f of found) {
        const probe = text.substr(f.offset + this.base, 300);
        if (/\/Type\s*\/Catalog/.test(probe)) this.trailer.set('Root', new PdfRef(f.num, f.gen));
      }
    }
    this.startxref = this.bytes.length;
  }

  // ───────────── objects ─────────────
  /** Parses `num gen obj … endobj` at an absolute byte offset. */
  private readIndirectAt(abs: number, expectNum: number): { num: number; gen: number; value: PdfValue } {
    const lx = new Lexer(this.bytes, abs);
    const n = lx.next();
    const g = lx.next();
    const o = lx.next();
    if (n.k !== 'num' || g.k !== 'num' || o.k !== 'kw' || o.v !== 'obj') throw new Error(`bad object header at ${abs}`);
    if (expectNum >= 0 && n.v !== expectNum) throw new Error(`object number mismatch at ${abs}: wanted ${expectNum}, found ${n.v}`);
    const value = new ObjectParser(lx).parse();
    if (isDict(value)) {
      const save = lx.pos;
      const nx = lx.next();
      if (nx.k === 'kw' && nx.v === 'stream') {
        let p = nx.e;
        const b = this.bytes;
        if (b[p] === 13 && b[p + 1] === 10) p += 2;
        else if (b[p] === 10 || b[p] === 13) p += 1;
        const len = this.resolve(value.get('Length') ?? null);
        let end = -1;
        if (isNum(len) && len >= 0 && p + len <= b.length) {
          let q = p + len;
          while (q < b.length && (b[q] === 10 || b[q] === 13 || b[q] === 32)) q++;
          if (indexOf(b, ENDSTREAM, q, Math.min(b.length, q + 9)) === q) end = p + len;
        }
        if (end < 0) {
          const e = indexOf(b, ENDSTREAM, p);
          end = e < 0 ? b.length : e;
          if (end > p && b[end - 1] === 10) end--;
          if (end > p && b[end - 1] === 13) end--;
        }
        return { num: n.v, gen: g.v, value: new PdfStream(value, b, p, end) };
      }
      lx.pos = save;
    }
    return { num: n.v, gen: g.v, value };
  }

  getObject(num: number): PdfValue {
    if (this.cache.has(num)) return this.cache.get(num)!;
    const e = this.xref.get(num);
    if (!e || e.t === 'free') return null;
    if (this.busy.has(num)) return null; // circular /Length etc.
    this.busy.add(num);
    try {
      let v: PdfValue;
      try {
        v = e.t === 'obj' ? this.readIndirectAt(e.offset + this.base, num).value : this.readFromObjStm(e.stm, num);
      } catch (err) {
        if (this.repaired) throw err;
        this.reconstruct();
        this.busy.delete(num);
        return this.getObject(num);
      }
      this.cache.set(num, v);
      return v;
    } finally {
      this.busy.delete(num);
    }
  }

  private readFromObjStm(stmNum: number, num: number): PdfValue {
    let objs = this.stmCache.get(stmNum);
    if (!objs) {
      objs = new Map();
      const s = this.getObject(stmNum);
      if (!isStream(s)) throw new Error(`object stream ${stmNum} missing`);
      const n = this.resolve(s.dict.get('N') ?? 0) as number;
      const first = this.resolve(s.dict.get('First') ?? 0) as number;
      const data = decodeStream(s, (v) => this.resolve(v));
      const lx = new Lexer(data);
      const table: Array<[number, number]> = [];
      for (let i = 0; i < n; i++) {
        const a = lx.next();
        const b = lx.next();
        if (a.k !== 'num' || b.k !== 'num') break;
        table.push([a.v, b.v]);
      }
      for (const [on, off] of table) objs.set(on, new ObjectParser(new Lexer(data, first + off)).parse());
      this.stmCache.set(stmNum, objs);
    }
    return objs.get(num) ?? null;
  }

  /** Follow indirect references (bounded). */
  resolve(v: PdfValue): PdfValue {
    for (let i = 0; i < 32 && isRef(v); i++) v = this.getObject(v.num);
    return isRef(v) ? null : v;
  }
  /** Convenience: resolve `dict[key]`. */
  get(d: PdfDict | null | undefined, key: string): PdfValue {
    return d ? this.resolve(d.get(key) ?? null) : null;
  }
  decode(stream: PdfStream): Uint8Array {
    return decodeStream(stream, (v) => this.resolve(v));
  }

  // ───────────── document structure ─────────────
  get catalog(): PdfDict {
    const r = this.resolve(this.trailer.get('Root') ?? null);
    if (!isDict(r)) throw new Error('no catalog');
    return r;
  }

  pages(): PdfPage[] {
    const out: PdfPage[] = [];
    const ancestors = new Set<PdfDict>(); // only ancestors count as cycles: a page may legally be listed twice
    type Inh = { resources?: PdfValue; mediaBox?: PdfValue; cropBox?: PdfValue; rotate?: PdfValue };
    const box = (v: PdfValue | undefined): [number, number, number, number] | null => {
      const a = this.resolve(v ?? null);
      if (!isArray(a) || a.length < 4) return null;
      const n = a.slice(0, 4).map((x) => this.resolve(x));
      if (!n.every(isNum)) return null;
      const [x0, y0, x1, y1] = n as number[];
      return [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
    };
    const walk = (nodeVal: PdfValue, num: number, inh: Inh, depth: number) => {
      const node = this.resolve(nodeVal);
      if (!isDict(node) || ancestors.has(node) || depth > 64) return;
      const next: Inh = {
        resources: node.has('Resources') ? node.get('Resources') : inh.resources,
        mediaBox: node.has('MediaBox') ? node.get('MediaBox') : inh.mediaBox,
        cropBox: node.has('CropBox') ? node.get('CropBox') : inh.cropBox,
        rotate: node.has('Rotate') ? node.get('Rotate') : inh.rotate,
      };
      const kids = this.resolve(node.get('Kids') ?? null);
      if (isArray(kids) && !isName(this.resolve(node.get('Type') ?? null), 'Page')) {
        ancestors.add(node);
        for (const k of kids) walk(k, isRef(k) ? k.num : 0, next, depth + 1);
        ancestors.delete(node);
        return;
      }
      const res = this.resolve(next.resources ?? null);
      const rot = this.resolve(next.rotate ?? 0);
      out.push({
        index: out.length,
        num,
        dict: node,
        resources: isDict(res) ? res : null,
        mediaBox: box(next.mediaBox) ?? [0, 0, 612, 792],
        cropBox: box(next.cropBox),
        rotate: isNum(rot) ? ((rot % 360) + 360) % 360 : 0,
      });
    };
    const rootPages = this.catalog.get('Pages') ?? null;
    walk(rootPages, isRef(rootPages) ? rootPages.num : 0, {}, 0);
    return out;
  }

  /** The page's content streams in drawing order, with the object numbers needed to patch them. */
  contentStreams(page: PdfPage): ContentStreamRef[] {
    const out: ContentStreamRef[] = [];
    const c = page.dict.get('Contents') ?? null;
    const add = (v: PdfValue) => {
      const num = isRef(v) ? v.num : 0;
      const r = this.resolve(v);
      if (isStream(r)) out.push({ num, stream: r });
      else if (isArray(r) && !isRef(v)) for (const x of r) add(x);
    };
    const r = this.resolve(c);
    if (isArray(r)) for (const x of r) add(x);
    else add(c);
    return out;
  }

  /** Decoded, concatenated page content (streams are separated by a newline as the spec requires). */
  pageContent(page: PdfPage): Uint8Array {
    const parts = this.contentStreams(page).map((s) => this.decode(s.stream));
    let n = 0;
    for (const p of parts) n += p.length + 1;
    const out = new Uint8Array(n);
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
      out[o++] = 10;
    }
    return out;
  }

  name(v: PdfValue): string | null {
    const r = this.resolve(v);
    return r instanceof PdfName ? r.name : null;
  }
}
