import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { EngineSession } from '../../src/engine/session';
import { FontResolver } from '../../src/fonts/resolver';
import { Subsetter } from '../../src/fonts/subset';
import { loadCore } from './node-core';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');

let subsetter: Promise<Subsetter> | null = null;
/** A session wired to real PDFium, HarfBuzz and the fallback fonts in public/fonts (run `node scripts/fetch-fonts.mjs` once). */
export async function makeSession(): Promise<EngineSession> {
  const core = await loadCore();
  subsetter ??= Subsetter.create(readFileSync(fileURLToPath(import.meta.resolve('harfbuzzjs/dist/harfbuzz-subset.wasm'))));
  const fonts = new FontResolver(async (file) => new Uint8Array(readFileSync(join(root, 'public', 'fonts', file))));
  return new EngineSession(core, { subsetter: await subsetter, fonts });
}
