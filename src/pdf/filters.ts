import { Unzlib, inflateSync, unzlibSync } from 'fflate';
import { isArray, isDict, isName, isNum, PdfName, type PdfDict, type PdfStream, type PdfValue } from './objects';

export class UnsupportedFilterError extends Error {
  constructor(readonly filter: string) {
    super(`Unsupported stream filter: ${filter}`);
  }
}

type Resolve = (v: PdfValue) => PdfValue;

function concat(chunks: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const c of chunks) n += c.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

export function inflate(data: Uint8Array): Uint8Array {
  try {
    return unzlibSync(data);
  } catch {
    /* fall through: damaged header / checksum / truncated stream */
  }
  try {
    return inflateSync(data.subarray(2));
  } catch {
    /* fall through */
  }
  const chunks: Uint8Array[] = [];
  try {
    const z = new Unzlib((c) => chunks.push(c));
    z.push(data, true);
  } catch {
    /* keep whatever was produced before the error */
  }
  if (chunks.length) return concat(chunks);
  throw new Error('Flate stream could not be decoded');
}

function lzwDecode(data: Uint8Array, earlyChange: number): Uint8Array {
  const out: number[] = [];
  let bits = 0;
  let acc = 0;
  let p = 0;
  let codeLen = 9;
  let dict: number[][] = [];
  const reset = () => {
    dict = [];
    for (let i = 0; i < 256; i++) dict.push([i]);
    dict.push([], []); // 256 clear, 257 EOD
    codeLen = 9;
  };
  reset();
  let prev: number[] | null = null;
  for (;;) {
    while (bits < codeLen && p < data.length) {
      acc = (acc << 8) | data[p++];
      bits += 8;
    }
    if (bits < codeLen) break;
    const code = (acc >> (bits - codeLen)) & ((1 << codeLen) - 1);
    bits -= codeLen;
    acc &= (1 << bits) - 1;
    if (code === 256) {
      reset();
      prev = null;
      continue;
    }
    if (code === 257) break;
    let entry: number[];
    if (code < dict.length) entry = dict[code];
    else if (prev) entry = prev.concat(prev[0]);
    else break;
    for (const b of entry) out.push(b);
    if (prev) dict.push(prev.concat(entry[0]));
    prev = entry;
    const size = dict.length + earlyChange;
    codeLen = size >= 4096 ? 12 : size >= 2048 ? 12 : size >= 1024 ? 11 : size >= 512 ? 10 : 9;
  }
  return Uint8Array.from(out);
}

function ascii85Decode(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  let group: number[] = [];
  let i = 0;
  if (data[0] === 0x3c && data[1] === 0x7e) i = 2;
  for (; i < data.length; i++) {
    const c = data[i];
    if (c === 0x7e) break; // ~>
    if (c <= 32) continue;
    if (c === 0x7a && group.length === 0) {
      out.push(0, 0, 0, 0);
      continue;
    }
    if (c < 33 || c > 117) continue;
    group.push(c - 33);
    if (group.length === 5) {
      let v = 0;
      for (const g of group) v = v * 85 + g;
      out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
      group = [];
    }
  }
  if (group.length > 1) {
    const n = group.length;
    while (group.length < 5) group.push(84);
    let v = 0;
    for (const g of group) v = v * 85 + g;
    const bytes = [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
    for (let k = 0; k < n - 1; k++) out.push(bytes[k]);
  }
  return Uint8Array.from(out);
}

function asciiHexDecode(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  let hi = -1;
  for (const c of data) {
    if (c === 0x3e) break;
    const h = c >= 48 && c <= 57 ? c - 48 : c >= 65 && c <= 70 ? c - 55 : c >= 97 && c <= 102 ? c - 87 : -1;
    if (h < 0) continue;
    if (hi < 0) hi = h;
    else {
      out.push(hi * 16 + h);
      hi = -1;
    }
  }
  if (hi >= 0) out.push(hi * 16);
  return Uint8Array.from(out);
}

function runLengthDecode(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < data.length) {
    const n = data[i++];
    if (n === 128) break;
    if (n < 128) for (let k = 0; k <= n && i < data.length; k++) out.push(data[i++]);
    else {
      const b = data[i++];
      for (let k = 0; k < 257 - n; k++) out.push(b);
    }
  }
  return Uint8Array.from(out);
}

function applyPredictor(data: Uint8Array, parms: PdfDict | null, resolve: Resolve): Uint8Array {
  if (!parms) return data;
  const num = (k: string, d: number) => {
    const v = resolve(parms.get(k) ?? null);
    return isNum(v) ? v : d;
  };
  const predictor = num('Predictor', 1);
  if (predictor <= 1) return data;
  const colors = num('Colors', 1);
  const bpc = num('BitsPerComponent', 8);
  const columns = num('Columns', 1);
  const bpp = Math.max(1, (colors * bpc + 7) >> 3);
  const rowBytes = (colors * bpc * columns + 7) >> 3;
  if (predictor === 2) {
    if (bpc !== 8) return data; // 1/2/4/16-bit TIFF predictors are not needed for the streams we decode
    const out = data.slice();
    for (let r = 0; r + rowBytes <= out.length; r += rowBytes)
      for (let i = bpp; i < rowBytes; i++) out[r + i] = (out[r + i] + out[r + i - bpp]) & 255;
    return out;
  }
  const rows = Math.floor(data.length / (rowBytes + 1));
  const out = new Uint8Array(rows * rowBytes);
  for (let r = 0; r < rows; r++) {
    const ft = data[r * (rowBytes + 1)];
    const src = r * (rowBytes + 1) + 1;
    const dst = r * rowBytes;
    const up = dst - rowBytes;
    for (let i = 0; i < rowBytes; i++) {
      const x = data[src + i];
      const a = i >= bpp ? out[dst + i - bpp] : 0;
      const b = r > 0 ? out[up + i] : 0;
      const c = r > 0 && i >= bpp ? out[up + i - bpp] : 0;
      let v: number;
      switch (ft) {
        case 1:
          v = x + a;
          break;
        case 2:
          v = x + b;
          break;
        case 3:
          v = x + ((a + b) >> 1);
          break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default:
          v = x;
      }
      out[dst + i] = v & 255;
    }
  }
  return out;
}

/** Decode all filters of a stream. Image codecs (DCT/JPX/CCITT/JBIG2) are intentionally unsupported. */
export function decodeStream(stream: PdfStream, resolve: Resolve): Uint8Array {
  const dict = stream.dict;
  let filters = resolve(dict.get('Filter') ?? dict.get('F') ?? null);
  let parms = resolve(dict.get('DecodeParms') ?? dict.get('DP') ?? null);
  const fl: PdfValue[] = filters === null ? [] : isArray(filters) ? filters.map(resolve) : [filters];
  const pl: PdfValue[] = parms === null ? [] : isArray(parms) ? parms.map(resolve) : [parms];
  filters = null;
  parms = null;
  let data = stream.raw;
  fl.forEach((f, i) => {
    if (!(f instanceof PdfName)) return;
    const p = pl[i];
    const pd = isDict(p) ? p : null;
    switch (f.name) {
      case 'FlateDecode':
      case 'Fl':
        data = applyPredictor(inflate(data), pd, resolve);
        break;
      case 'LZWDecode':
      case 'LZW': {
        const early = pd ? resolve(pd.get('EarlyChange') ?? 1) : 1;
        data = applyPredictor(lzwDecode(data, isNum(early) ? early : 1), pd, resolve);
        break;
      }
      case 'ASCII85Decode':
      case 'A85':
        data = ascii85Decode(data);
        break;
      case 'ASCIIHexDecode':
      case 'AHx':
        data = asciiHexDecode(data);
        break;
      case 'RunLengthDecode':
      case 'RL':
        data = runLengthDecode(data);
        break;
      case 'Crypt':
        break;
      default:
        throw new UnsupportedFilterError(f.name);
    }
  });
  return data;
}

export const hasFilter = (dict: PdfDict, resolve: Resolve, name: string): boolean => {
  const f = resolve(dict.get('Filter') ?? null);
  return isArray(f) ? f.some((x) => isName(resolve(x), name)) : isName(f, name);
};
