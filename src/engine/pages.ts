/**
 * Page tools: build a new PDF from pages of one or more source PDFs (split, extract, merge, reorder, rotate, duplicate,
 * insert blank pages). PDFium copies page objects as they are — content streams, fonts and images are never
 * regenerated — so a copied page renders pixel-identically, and only what the chosen pages reference ends up in the file.
 * Like the session, it runs in the worker but has no worker dependencies, so tests drive it directly in Node.
 */
import { PdfiumCore, PdfiumOpenError, type DestView, type Doc, type Page, type Ptr } from './core';
import { carryOptionalContent, type CarrySource } from './carry';
import { PdfFile } from '../pdf/file';
import { isDict } from '../pdf/objects';
import type { BuildOptions, OutlineEntry, PageSpec, RenderedPage, SourceInfo } from './api';

interface Source {
  doc: Doc;
  info: SourceInfo;
  /** The parsed original, kept only when it has layers (optional content) that copies must carry over. */
  layers: PdfFile | null;
}

/** PDF date string (UTC), e.g. D:20261001120000Z */
function pdfDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

const MAX_PREVIEW_PIXELS = 16_000_000;
const COPIED_INFO = ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'CreationDate'] as const;

export class PageTools {
  private sources = new Map<number, Source>();
  private nextId = 1;

  constructor(private readonly core: PdfiumCore) {}

  open(bytes: Uint8Array, name: string, password = ''): SourceInfo {
    let doc: Doc;
    try {
      doc = this.core.open(bytes, password);
    } catch (e) {
      if (e instanceof PdfiumOpenError && e.needsPassword) {
        return { id: 0, name, pages: [], decrypted: false, restricted: false, needsPassword: true };
      }
      throw e;
    }
    try {
      const encrypted = this.core.isEncrypted(doc);
      if (doc.pageCount === 0 && encrypted)
        throw new Error('This PDF uses an encryption method that could not be unlocked without its password.');
      if (doc.pageCount === 0) throw new Error('This PDF has no pages.');
      const perms = this.core.permissions(doc);
      const pages = Array.from({ length: doc.pageCount }, (_, i) => ({
        ...this.core.pageSize(doc, i),
        rotate: this.core.rotationByIndex(doc, i) * 90,
      }));
      const info: SourceInfo = {
        id: this.nextId++,
        name,
        pages,
        decrypted: encrypted,
        restricted: encrypted && perms !== 0xffffffff && (perms & 0x8) === 0,
      };
      this.sources.set(info.id, { doc, info, layers: encrypted ? null : this.parseLayers(bytes) });
      return info;
    } catch (e) {
      this.core.close(doc);
      throw e;
    }
  }

  /** Our own parse of the file, returned only when it defines optional-content layers (rare, so most files cost nothing). */
  private parseLayers(bytes: Uint8Array): PdfFile | null {
    try {
      const f = PdfFile.load(bytes);
      return isDict(f.get(f.catalog, 'OCProperties')) ? f : null;
    } catch {
      return null;
    }
  }

  close(id: number): void {
    const s = this.sources.get(id);
    if (!s) return;
    this.core.close(s.doc);
    this.sources.delete(id);
  }

  private get(id: number): Source {
    const s = this.sources.get(id);
    if (!s) throw new Error(`Unknown page source ${id}`);
    return s;
  }

  render(id: number, pageIndex: number, scale: number): RenderedPage {
    const { doc } = this.get(id);
    const page = this.core.loadPage(doc, pageIndex);
    try {
      // a damaged or hostile page can claim to be kilometres wide; never allocate more than ~64 MB for a preview
      const pixels = page.width * scale * (page.height * scale);
      const bmp = this.core.render(page, pixels > MAX_PREVIEW_PIXELS ? scale * Math.sqrt(MAX_PREVIEW_PIXELS / pixels) : scale);
      return { width: bmp.width, height: bmp.height, data: bmp.data.buffer as ArrayBuffer, revision: 0 };
    } finally {
      this.core.closePage(page);
    }
  }

  outline(id: number): OutlineEntry[] {
    return this.core.outline(this.get(id).doc).map(({ title, page, level }) => ({ title, page, level }));
  }

  /** The new file's bytes. Throws when a page does not exist or PDFium cannot copy it. */
  build(specs: PageSpec[], options: BuildOptions = {}): Uint8Array {
    if (!specs.length) throw new Error('No pages to build.');
    for (const s of specs) {
      if (s.kind !== 'page') continue;
      const src = this.get(s.src);
      if (!Number.isInteger(s.page) || s.page < 0 || s.page >= src.info.pages.length) {
        throw new Error(`“${src.info.name}” has no page ${s.page + 1}.`);
      }
    }
    const out = this.core.createDocument();
    try {
      // consecutive pages of one source are copied in a single call, so objects they share are copied once
      let at = 0;
      for (let i = 0; i < specs.length;) {
        const first = specs[i];
        if (first.kind === 'blank') {
          this.core.newBlankPage(out, at++, first.width, first.height);
          i++;
          continue;
        }
        const pages: number[] = [];
        for (let j = i; j < specs.length; j++) {
          const s = specs[j];
          if (s.kind !== 'page' || s.src !== first.src) break;
          pages.push(s.page);
        }
        const src = this.get(first.src);
        if (!this.core.importPages(out, src.doc, pages, at)) throw new Error(`Could not copy pages from “${src.info.name}”.`);
        at += pages.length;
        i += pages.length;
      }

      specs.forEach((s, i) => {
        const turns = s.kind === 'page' ? Math.round((s.rotate ?? 0) / 90) : 0;
        if (!turns) return;
        const page = this.core.loadPage(out, i);
        this.core.setRotation(page, this.core.rotationOf(page) + turns);
        this.core.closePage(page);
      });

      const lead = specs.find((s) => s.kind === 'page');
      if (lead && lead.kind === 'page') {
        const src = this.get(lead.src).doc;
        for (const key of COPIED_INFO) {
          const v = this.core.metaText(src, key);
          if (v) this.core.setMetaText(out, key, v);
        }
        this.core.copyViewerPreferences(out, src);
      }
      if (options.title !== undefined) this.core.setMetaText(out, 'Title', options.title);
      this.core.setMetaText(out, 'Producer', 'Sticker PDF Lab');
      this.core.setMetaText(out, 'ModDate', pdfDate());

      // where each (source, page) first appears in the new file, and handles to the new pages (closed before saving)
      const where = new Map<string, number>();
      const sources: number[] = [];
      specs.forEach((s, i) => {
        if (s.kind !== 'page') return;
        if (!where.has(`${s.src}:${s.page}`)) where.set(`${s.src}:${s.page}`, i);
        if (!sources.includes(s.src)) sources.push(s.src);
      });
      const handles = new Map<number, Page | null>();
      const pageAt = (i: number): Page | null => {
        let p = handles.get(i);
        if (p === undefined) {
          try {
            p = this.core.loadPage(out, i);
          } catch {
            p = null; // a damaged page is still copied; it just gets no bookmarks or links
          }
          handles.set(i, p);
        }
        return p;
      };
      try {
        if (options.bookmarks !== false) this.copyBookmarks(out, specs, sources, where, pageAt);
        this.restoreLinks(out, specs, where, pageAt);
      } finally {
        for (const p of handles.values()) if (p) this.core.closePage(p);
      }

      return this.carryLayers(this.core.save(out), specs);
    } finally {
      this.core.close(out);
    }
  }

  /**
   * PDFium does not copy outlines. Bookmarks whose page is in the new file are recreated (same title, nesting and view);
   * the others are dropped and their children move up to the nearest kept ancestor. When pages come from several files,
   * each file's bookmarks go under a bookmark named after the file.
   */
  private copyBookmarks(
    out: Doc,
    specs: PageSpec[],
    sources: number[],
    where: Map<string, number>,
    pageAt: (i: number) => Page | null,
  ): void {
    for (const id of sources) {
      const src = this.get(id);
      const entries = this.core.outline(src.doc);
      let wrapper: Ptr = 0;
      if (sources.length > 1) {
        const target = pageAt(specs.findIndex((s) => s.kind === 'page' && s.src === id));
        if (target) wrapper = this.core.addBookmark(out, 0, src.info.name.replace(/\.pdf$/i, ''), target, null);
      }
      const stack: Array<{ level: number; bm: Ptr }> = [];
      for (const e of entries) {
        while (stack.length && stack[stack.length - 1].level >= e.level) stack.pop();
        const at = e.page >= 0 ? where.get(`${id}:${e.page}`) : undefined;
        const target = at === undefined ? null : pageAt(at);
        if (!target) {
          stack.push({ level: e.level, bm: 0 });
          continue;
        }
        let parent = wrapper;
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].bm) {
            parent = stack[i].bm;
            break;
          }
        }
        stack.push({ level: e.level, bm: this.core.addBookmark(out, parent, e.title, target, e.view) });
      }
    }
  }

  /**
   * PDFium keeps a link's destination only when the target page was copied earlier in the same call; links to later
   * pages, to pages copied in another call, or to duplicated pages lose it. Every link whose target is in the new file
   * is pointed at it again (links to pages that are not in the new file stay inert).
   */
  private restoreLinks(out: Doc, specs: PageSpec[], where: Map<string, number>, pageAt: (i: number) => Page | null): void {
    specs.forEach((s, i) => {
      if (s.kind !== 'page') return;
      const src = this.get(s.src).doc;
      let from: Page | null = null;
      try {
        from = this.core.loadPage(src, s.page);
        const before = this.core.links(src, from);
        if (!before.length) return;
        const page = pageAt(i);
        if (!page) return;
        const after = this.core.links(out, page);
        if (after.length !== before.length) return;
        const fixes = new Map<number, { target: Page; view: DestView | null }>();
        before.forEach((l, k) => {
          if (l.destPage < 0 || after[k].destPage >= 0) return;
          const at = where.get(`${s.src}:${l.destPage}`);
          const target = at === undefined ? null : pageAt(at);
          if (target) fixes.set(k, { target, view: l.view });
        });
        if (fixes.size) this.core.retargetLinks(out, page, fixes);
      } catch {
        // links are a convenience; never fail a copy over them
      } finally {
        if (from) this.core.closePage(from);
      }
    });
  }

  /** Adds the layer configuration PDFium's page import leaves out (see carry.ts), when any source has layers. */
  private carryLayers(bytes: Uint8Array, specs: PageSpec[]): Uint8Array {
    const carry: CarrySource[] = [];
    for (const id of new Set(specs.flatMap((s) => (s.kind === 'page' ? [s.src] : [])))) {
      const file = this.get(id).layers;
      if (!file) continue;
      const pages = specs.flatMap((s, outPage) => (s.kind === 'page' && s.src === id ? [{ srcPage: s.page, outPage }] : []));
      carry.push({ file, pages });
    }
    if (!carry.length) return bytes;
    try {
      const patched = carryOptionalContent(PdfFile.load(bytes), carry);
      if (!patched) return bytes;
      // run it through PDFium once more so the result is a single clean revision again
      const doc = this.core.open(patched);
      try {
        return this.core.save(doc);
      } finally {
        this.core.close(doc);
      }
    } catch {
      return bytes; // layers may show up that were hidden, but the pages themselves are exact
    }
  }
}
