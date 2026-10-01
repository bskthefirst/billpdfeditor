import { candidateFamilies, fileFor, styleOf, type CatalogFamily, type FamilyFile, type FontIdentity } from './catalog';
import { parseSfnt, type SfntFont } from './sfnt';

/** Loads a font file by name (browser: fetch from /fonts, Node tests: read from public/fonts). */
export type FontFileLoader = (file: string) => Promise<Uint8Array>;

export interface LoadedFont {
  /** Stable id: family + file + variation pins. */
  id: string;
  label: string;
  family: CatalogFamily;
  entry: FamilyFile;
  bytes: Uint8Array;
  sfnt: SfntFont;
  /** True when this is the same font as the original (never the case for catalog fonts; local fonts can be). */
  exact: boolean;
}

export interface Segment {
  font: LoadedFont;
  text: string;
}

export type SubstitutionPlan = { ok: true; segments: Segment[] } | { ok: false; missing: string[] };

export class FontResolver {
  private readonly files = new Map<string, Promise<Uint8Array>>();
  private readonly fonts = new Map<string, Promise<LoadedFont>>();

  constructor(private readonly loadFile: FontFileLoader) {}

  private bytes(file: string): Promise<Uint8Array> {
    let p = this.files.get(file);
    if (!p) this.files.set(file, (p = this.loadFile(file)));
    return p;
  }

  private font(family: CatalogFamily, entry: FamilyFile): Promise<LoadedFont> {
    const id = `${family.id}:${entry.file}:${JSON.stringify(entry.variations ?? {})}`;
    let p = this.fonts.get(id);
    if (!p) {
      p = this.bytes(entry.file).then((bytes) => {
        const sfnt = parseSfnt(bytes);
        const style = entry.variations?.wght && entry.variations.wght >= 600 ? ' Bold' : '';
        return { id, label: `${family.label}${style}`, family, entry, bytes, sfnt, exact: false };
      });
      this.fonts.set(id, p);
    }
    return p;
  }

  /**
   * Decide which fonts draw `text` when the original font cannot. Each character goes to the first candidate family
   * whose font has a glyph; neighbouring characters with the same font are merged into one segment.
   */
  async plan(identity: FontIdentity, text: string): Promise<SubstitutionPlan> {
    const style = styleOf(identity);
    const families = candidateFamilies(identity);
    const fonts: LoadedFont[] = [];
    for (const fam of families) {
      try {
        fonts.push(await this.font(fam, fileFor(fam, style)));
      } catch {
        /* font file not available (not downloaded): skip this candidate */
      }
    }
    const segments: Segment[] = [];
    const missing: string[] = [];
    let prevFont: LoadedFont | null = null;
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      // whitespace follows the neighbouring font (every font has a space; this avoids pointless font switches)
      let chosen: LoadedFont | null = ch === ' ' && prevFont ? prevFont : (fonts.find((f) => f.sfnt.glyphFor(cp) !== 0) ?? null);
      if (!chosen && ch === ' ') chosen = fonts[0] ?? null;
      if (!chosen) {
        if (!missing.includes(ch)) missing.push(ch);
        continue;
      }
      const last = segments[segments.length - 1];
      if (last && last.font === chosen) last.text += ch;
      else segments.push({ font: chosen, text: ch });
      prevFont = chosen;
    }
    return missing.length ? { ok: false, missing } : { ok: true, segments };
  }
}
