// macOS only: reads fonts from /System/Library/Fonts (nothing from them is committed). Not part of CI.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseSfnt } from '../../src/fonts/sfnt';
import { Subsetter } from '../../src/fonts/subset';

const wasm = readFileSync(fileURLToPath(import.meta.resolve('harfbuzzjs/dist/harfbuzz-subset.wasm')));
const sub = await Subsetter.create(wasm);
for (const path of [
  '/System/Library/Fonts/Supplemental/Georgia Bold.ttf',
  '/System/Library/Fonts/Supplemental/Arial.ttf',
  '/System/Library/Fonts/Supplemental/AppleGothic.ttf',
]) {
  const data = new Uint8Array(readFileSync(path));
  const f = parseSfnt(data);
  const text = path.includes('Gothic') ? '안녕하세요' : 'ABCabc';
  const cps = [...text].map((c) => c.codePointAt(0)!);
  const out = sub.subset(data, cps);
  const o = parseSfnt(out);
  console.log(
    path.split('/').pop(),
    `| ${f.names.postscript} upm=${f.unitsPerEm} glyphs=${f.numGlyphs} fsType=${f.fsType} cff=${f.isCFF} asc=${f.ascender} desc=${f.descender} cap=${f.capHeight}`,
  );
  console.log(`   subset ${data.length} → ${out.length} bytes; numGlyphs(retained)=${o.numGlyphs}`);
  console.log(
    '   ',
    [...text]
      .map(
        (c) =>
          `${c}:gid${f.glyphFor(c.codePointAt(0)!)}/adv${f.advance(f.glyphFor(c.codePointAt(0)!))}→subsetAdv${o.advance(f.glyphFor(c.codePointAt(0)!))}`,
      )
      .join(' '),
  );
}
