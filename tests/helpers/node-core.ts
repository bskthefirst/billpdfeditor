import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { PdfiumCore, type Bitmap } from '../../src/engine/core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CORPUS_DIR = join(root, 'tests', 'corpus', 'pdf');
export const OUT_DIR = join(root, 'tests', 'out');

let corePromise: Promise<PdfiumCore> | null = null;
/** One shared PDFium instance per process (instantiation costs ~100 ms). */
export function loadCore(): Promise<PdfiumCore> {
  corePromise ??= (async () => {
    const wasmPath = fileURLToPath(import.meta.resolve('@embedpdf/pdfium/pdfium.wasm'));
    return PdfiumCore.create(readFileSync(wasmPath));
  })();
  return corePromise;
}

export function corpusFiles(): string[] {
  return readdirSync(CORPUS_DIR)
    .filter((f) => f.endsWith('.pdf'))
    .sort();
}
export function readCorpus(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
}

export interface DiffResult {
  /** Pixels differing at all (threshold 0). */
  diffPixels: number;
  /** Largest single-channel absolute difference (0–255). */
  maxDelta: number;
  png?: Buffer;
}
export function diffBitmaps(a: Bitmap, b: Bitmap, opts: { makePng?: boolean } = {}): DiffResult {
  if (a.width !== b.width || a.height !== b.height) {
    return { diffPixels: Infinity, maxDelta: 255 };
  }
  let maxDelta = 0;
  for (let i = 0; i < a.data.length; i++) {
    const d = Math.abs(a.data[i] - b.data[i]);
    if (d > maxDelta) maxDelta = d;
  }
  const out = opts.makePng ? new PNG({ width: a.width, height: a.height }) : null;
  const diffPixels = pixelmatch(a.data, b.data, out ? out.data : undefined, a.width, a.height, {
    threshold: 0,
    includeAA: true,
  });
  return { diffPixels, maxDelta, png: out ? PNG.sync.write(out) : undefined };
}

export function bitmapToPng(b: Bitmap): Buffer {
  const png = new PNG({ width: b.width, height: b.height });
  png.data = Buffer.from(b.data);
  return PNG.sync.write(png);
}

export function writeOut(relPath: string, data: Uint8Array | Buffer | string): string {
  const p = join(OUT_DIR, relPath);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, data);
  return p;
}
