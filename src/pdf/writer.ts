import { PdfFile } from './file';
import { PdfName, PdfNewStream, PdfRef, PdfStream, PdfString, isArray, isDict, type PdfDict, type PdfValue } from './objects';

const enc = new TextEncoder();

export class ByteWriter {
  private chunks: Uint8Array[] = [];
  length = 0;
  push(x: Uint8Array | string): void {
    const b = typeof x === 'string' ? enc.encode(x) : x;
    this.chunks.push(b);
    this.length += b.length;
  }
  toBytes(): Uint8Array {
    const out = new Uint8Array(this.length);
    let o = 0;
    for (const c of this.chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  }
}

export function fmtNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  if (!Number.isFinite(n)) return '0';
  let s = n.toFixed(6);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s === '-0' ? '0' : s;
}

function escName(n: string): string {
  let out = '/';
  for (let i = 0; i < n.length; i++) {
    const c = n.charCodeAt(i);
    out += c < 33 || c > 126 || '()<>[]{}/%#'.includes(n[i]) ? `#${c.toString(16).padStart(2, '0')}` : n[i];
  }
  return out;
}

function hexString(b: Uint8Array): string {
  let s = '<';
  for (const c of b) s += c.toString(16).padStart(2, '0');
  return s + '>';
}

/** Serialize a direct value (streams are only legal as top-level indirect objects, see `writeObjectBody`). */
export function writeValue(w: ByteWriter, v: PdfValue): void {
  if (v === null) w.push('null');
  else if (typeof v === 'boolean') w.push(v ? 'true' : 'false');
  else if (typeof v === 'number') w.push(fmtNumber(v));
  else if (v instanceof PdfName) w.push(escName(v.name));
  else if (v instanceof PdfString) w.push(hexString(v.bytes));
  else if (v instanceof PdfRef) w.push(`${v.num} ${v.gen} R`);
  else if (isArray(v)) {
    w.push('[');
    v.forEach((x, i) => {
      if (i) w.push(' ');
      writeValue(w, x);
    });
    w.push(']');
  } else if (isDict(v)) {
    w.push('<<');
    for (const [k, x] of v) {
      w.push(escName(k) + ' ');
      writeValue(w, x);
      w.push(' ');
    }
    w.push('>>');
  } else throw new Error('streams cannot be nested inside other objects');
}

export function writeObjectBody(w: ByteWriter, v: PdfValue): void {
  if (v instanceof PdfStream || v instanceof PdfNewStream) {
    const data = v instanceof PdfStream ? v.raw : v.data;
    const d: PdfDict = new Map(v.dict);
    d.set('Length', data.length);
    writeValue(w, d);
    w.push('\nstream\n');
    w.push(data);
    w.push('\nendstream');
  } else writeValue(w, v);
}

/**
 * Builds an incremental update: the original bytes stay byte-for-byte intact and a new revision is appended.
 * Besides minimal diffs, this keeps existing digital signatures valid.
 */
export class IncrementalUpdate {
  private readonly objs = new Map<number, { gen: number; value: PdfValue }>();
  private next: number;

  constructor(readonly file: PdfFile) {
    this.next = file.nextObjectNumber();
  }

  alloc(): number {
    return this.next++;
  }
  /** Replace an existing object or define a newly allocated one. */
  set(num: number, value: PdfValue, gen = this.file.generationOf(num)): void {
    this.objs.set(num, { gen, value });
  }
  get isEmpty(): boolean {
    return this.objs.size === 0;
  }

  build(): Uint8Array {
    const orig = this.file.bytes;
    const w = new ByteWriter();
    w.push(orig);
    if (orig.length && orig[orig.length - 1] !== 10 && orig[orig.length - 1] !== 13) w.push('\n');
    const base = this.file.bytesBase;
    const offsets = new Map<number, { off: number; gen: number }>();
    const nums = [...this.objs.keys()].sort((a, b) => a - b);
    for (const n of nums) {
      const o = this.objs.get(n)!;
      offsets.set(n, { off: w.length - base, gen: o.gen });
      w.push(`${n} ${o.gen} obj\n`);
      writeObjectBody(w, o.value);
      w.push('\nendobj\n');
    }

    const trailer: PdfDict = new Map();
    for (const k of ['Root', 'Info', 'ID', 'Encrypt']) {
      const v = this.file.trailer.get(k);
      if (v !== undefined) trailer.set(k, v);
    }
    trailer.set('Prev', this.file.startxref);

    const ranges: Array<[number, number]> = [];
    for (const n of nums) {
      const last = ranges[ranges.length - 1];
      if (last && last[0] + last[1] === n) last[1]++;
      else ranges.push([n, 1]);
    }

    if (this.file.xrefKind === 'stream') {
      const selfNum = this.next++;
      const all = [...nums, selfNum].sort((a, b) => a - b);
      const rs: Array<[number, number]> = [];
      for (const n of all) {
        const last = rs[rs.length - 1];
        if (last && last[0] + last[1] === n) last[1]++;
        else rs.push([n, 1]);
      }
      const xrefOffset = w.length - base;
      const rec = new Uint8Array(all.length * 7);
      all.forEach((n, i) => {
        const e = n === selfNum ? { off: xrefOffset, gen: 0 } : offsets.get(n)!;
        rec[i * 7] = 1;
        rec[i * 7 + 1] = (e.off >>> 24) & 255;
        rec[i * 7 + 2] = (e.off >>> 16) & 255;
        rec[i * 7 + 3] = (e.off >>> 8) & 255;
        rec[i * 7 + 4] = e.off & 255;
        rec[i * 7 + 5] = (e.gen >>> 8) & 255;
        rec[i * 7 + 6] = e.gen & 255;
      });
      trailer.set('Type', new PdfName('XRef'));
      trailer.set('Size', this.next);
      trailer.set('W', [1, 4, 2]);
      trailer.set('Index', rs.flat());
      w.push(`${selfNum} 0 obj\n`);
      writeObjectBody(w, new PdfNewStream(trailer, rec));
      w.push(`\nendobj\nstartxref\n${xrefOffset}\n%%EOF\n`);
    } else {
      const xrefOffset = w.length - base;
      w.push('xref\n');
      for (const [start, count] of ranges) {
        w.push(`${start} ${count}\n`);
        for (let i = 0; i < count; i++) {
          const e = offsets.get(start + i)!;
          w.push(`${String(e.off).padStart(10, '0')} ${String(e.gen).padStart(5, '0')} n \n`);
        }
      }
      trailer.set('Size', this.next);
      w.push('trailer\n');
      writeValue(w, trailer);
      w.push(`\nstartxref\n${xrefOffset}\n%%EOF\n`);
    }
    return w.toBytes();
  }
}
