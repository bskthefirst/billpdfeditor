import type { PdfFile, PdfPage } from './file';
import { isDict, type PdfDict, type PdfRef } from './objects';
import type { IncrementalUpdate } from './writer';

/**
 * Collects font resources to add to pages and writes them as one update per page dictionary. The page keeps working
 * exactly as before; it only gains extra /Font entries (and a private, inline copy of its resources if they were shared).
 */
export class ResourceEditor {
  private readonly added = new Map<PdfPage, Map<string, PdfRef>>();

  constructor(private readonly file: PdfFile) {}

  /** A /Font resource name that is free on `page` (also against names added through this editor). */
  uniqueName(page: PdfPage, base = 'Lab'): string {
    const fonts = this.file.get(page.resources, 'Font');
    const taken = new Set<string>([...(isDict(fonts) ? fonts.keys() : []), ...(this.added.get(page)?.keys() ?? [])]);
    for (let i = 1; ; i++) if (!taken.has(base + i)) return base + i;
  }

  addFont(page: PdfPage, name: string, ref: PdfRef): void {
    if (!page.num) throw new Error('page dictionary is direct; cannot add resources');
    let m = this.added.get(page);
    if (!m) this.added.set(page, (m = new Map()));
    m.set(name, ref);
  }

  apply(update: IncrementalUpdate): void {
    for (const [page, fonts] of this.added) {
      const resources: PdfDict = new Map(page.resources ?? []);
      const old = this.file.resolve(resources.get('Font') ?? null);
      const merged: PdfDict = new Map(isDict(old) ? old : []);
      for (const [n, r] of fonts) merged.set(n, r);
      resources.set('Font', merged);
      const dict: PdfDict = new Map(page.dict);
      dict.set('Resources', resources);
      update.set(page.num, dict);
    }
  }
}
