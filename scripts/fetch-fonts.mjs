#!/usr/bin/env node
// Downloads the open-licensed fallback fonts (SIL OFL / Apache) from github.com/google/fonts into public/fonts/.
// They are served from our own origin at runtime; nothing is requested from third parties while using the app.
// Usage: node scripts/fetch-fonts.mjs
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'public', 'fonts');
mkdirSync(OUT, { recursive: true });
const RAW = 'https://raw.githubusercontent.com/google/fonts/main/ofl';

// [directory in google/fonts, remote file name, local file name]
const FILES = [
  ['arimo', 'Arimo[wght].ttf', 'Arimo-VF.ttf'],
  ['arimo', 'Arimo-Italic[wght].ttf', 'Arimo-Italic-VF.ttf'],
  ...['Regular', 'Bold', 'Italic', 'BoldItalic'].map((s) => ['tinos', `Tinos-${s}.ttf`, `Tinos-${s}.ttf`]),
  ...['Regular', 'Bold', 'Italic', 'BoldItalic'].map((s) => ['cousine', `Cousine-${s}.ttf`, `Cousine-${s}.ttf`]),
  ...['Regular', 'Bold', 'Italic', 'BoldItalic'].map((s) => ['carlito', `Carlito-${s}.ttf`, `Carlito-${s}.ttf`]),
  ...['Regular', 'Bold', 'Italic', 'BoldItalic'].map((s) => ['caladea', `Caladea-${s}.ttf`, `Caladea-${s}.ttf`]),
  ['gelasio', 'Gelasio[wght].ttf', 'Gelasio-VF.ttf'],
  ['gelasio', 'Gelasio-Italic[wght].ttf', 'Gelasio-Italic-VF.ttf'],
  ['notosans', 'NotoSans[wdth,wght].ttf', 'NotoSans-VF.ttf'],
  ['notosans', 'NotoSans-Italic[wdth,wght].ttf', 'NotoSans-Italic-VF.ttf'],
  ['notoserif', 'NotoSerif[wdth,wght].ttf', 'NotoSerif-VF.ttf'],
  ['notoserif', 'NotoSerif-Italic[wdth,wght].ttf', 'NotoSerif-Italic-VF.ttf'],
  ['nanumgothic', 'NanumGothic-Regular.ttf', 'NanumGothic-Regular.ttf'],
  ['nanumgothic', 'NanumGothic-Bold.ttf', 'NanumGothic-Bold.ttf'],
  ['nanummyeongjo', 'NanumMyeongjo-Regular.ttf', 'NanumMyeongjo-Regular.ttf'],
  ['nanummyeongjo', 'NanumMyeongjo-Bold.ttf', 'NanumMyeongjo-Bold.ttf'],
];
const LICENSES = ['arimo', 'tinos', 'cousine', 'carlito', 'caladea', 'gelasio', 'notosans', 'notoserif', 'nanumgothic', 'nanummyeongjo'];

async function get(url, dest) {
  if (existsSync(dest)) return false;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return true;
}

let n = 0;
await Promise.all(
  FILES.map(async ([dir, remote, local]) => {
    if (await get(`${RAW}/${dir}/${encodeURIComponent(remote)}`, join(OUT, local))) n++;
  }),
);
for (const dir of LICENSES) {
  for (const name of ['OFL.txt', 'LICENSE.txt']) {
    try {
      if (await get(`${RAW}/${dir}/${name}`, join(OUT, `LICENSE-${dir}.txt`))) break;
    } catch {
      /* try the next license file name */
    }
  }
}
console.log(`fonts: ${FILES.length} files in public/fonts (${n} downloaded)`);
