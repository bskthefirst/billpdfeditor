/**
 * Low-level, synchronous PDFium wrapper (runs inside the engine worker, or directly in Node for tests).
 * Everything here maps 1:1 onto the PDFium C API; higher layers (text model, editing) live elsewhere.
 */
import { init, type WrappedPdfiumModule } from '@embedpdf/pdfium';

export type Ptr = number;

interface Heaps {
  HEAPU8: Uint8Array;
  HEAPU32: Uint32Array;
  HEAPF32: Float32Array;
  HEAPF64: Float64Array;
}

export const ObjType = { Text: 1, Path: 2, Image: 3, Shading: 4, Form: 5 } as const;
export const RenderFlag = { Annot: 0x01, LcdText: 0x02, ReverseByteOrder: 0x10, Grayscale: 0x08 } as const;

export interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}
/** PDF user space, y axis pointing up. */
export interface Rect {
  left: number;
  bottom: number;
  right: number;
  top: number;
}
export interface FontInfo {
  baseName: string;
  familyName: string;
  flags: number;
  weight: number;
  italicAngle: number;
  embedded: boolean;
}
/** Where a bookmark or link lands on its page: PDF view mode (1 = XYZ, 2 = Fit, 3 = FitH … 8) with its parameters. */
export interface DestView {
  mode: number;
  params: number[];
  /** XYZ only: a missing value means "keep the current one". */
  xyz?: { x: number | null; y: number | null; zoom: number | null };
}
export interface Doc {
  ptr: Ptr;
  /** Source buffer; PDFium reads lazily from it so it must outlive the document. */
  bufPtr: Ptr;
  pageCount: number;
}
export interface Page {
  ptr: Ptr;
  index: number;
  width: number;
  height: number;
}
export interface Bitmap {
  width: number;
  height: number;
  /** RGBA, row-major, straight from PDFium (alpha is 255 when rendered on an opaque background). */
  data: Uint8Array;
}

/** FPDF_LoadMemDocument failed; `needsPassword` when PDFium reports a password error (code 4). */
export class PdfiumOpenError extends Error {
  constructor(readonly code: number) {
    super(
      code === 3
        ? 'This file is not a valid PDF, or it is too damaged to open.'
        : code === 4
          ? 'This PDF needs a password.'
          : code === 5
            ? 'This PDF uses a security setting that cannot be opened here.'
            : `The PDF could not be opened (PDFium error ${code}).`,
    );
  }
  get needsPassword(): boolean {
    return this.code === 4;
  }
}

export class PdfiumCore {
  readonly w: WrappedPdfiumModule;

  private constructor(w: WrappedPdfiumModule) {
    this.w = w;
  }

  /** Emscripten heap views (not declared in the package typings). Always re-read: they are replaced when wasm memory grows. */
  private get heaps(): Heaps {
    return this.w.pdfium as unknown as Heaps;
  }

  static async create(wasmBinary: ArrayBuffer | Uint8Array): Promise<PdfiumCore> {
    const w = await init({ wasmBinary: wasmBinary as unknown as ArrayBuffer });
    w.PDFiumExt_Init();
    return new PdfiumCore(w);
  }

  // ───────────── memory ─────────────
  malloc(n: number): Ptr {
    const p = this.w.pdfium.wasmExports.malloc(Math.max(n, 1));
    if (!p) throw new Error(`PDFium malloc(${n}) failed`);
    return p;
  }
  free(p: Ptr): void {
    if (p) this.w.pdfium.wasmExports.free(p);
  }
  /** Allocate, run, free. Heap views must be re-read after any call that can grow memory, so never cache them. */
  withAlloc<T>(n: number, fn: (ptr: Ptr) => T): T {
    const p = this.malloc(n);
    try {
      return fn(p);
    } finally {
      this.free(p);
    }
  }
  get u8(): Uint8Array {
    return this.heaps.HEAPU8;
  }
  f32At(p: Ptr): number {
    return this.heaps.HEAPF32[p >> 2];
  }
  f64At(p: Ptr): number {
    return this.heaps.HEAPF64[p >> 3];
  }
  u32At(p: Ptr): number {
    return this.heaps.HEAPU32[p >> 2];
  }
  /** Copy bytes out of the wasm heap. */
  readBytes(p: Ptr, n: number): Uint8Array {
    return this.u8.slice(p, p + n);
  }
  writeBytes(bytes: Uint8Array): Ptr {
    const p = this.malloc(bytes.length);
    this.u8.set(bytes, p);
    return p;
  }
  /** NUL-terminated UTF-16LE copy of `s` (caller frees). */
  writeUtf16(s: string): Ptr {
    const bytes = (s.length + 1) * 2;
    const p = this.malloc(bytes);
    this.w.pdfium.stringToUTF16(s, p, bytes);
    return p;
  }
  /** Calls a "(buffer, length) → byteCount" getter twice (size query, then fill) and returns the filled bytes. */
  private readSized(call: (buf: Ptr, len: number) => number): Uint8Array {
    const need = call(0, 0) >>> 0;
    if (need === 0) return new Uint8Array(0);
    return this.withAlloc(need, (buf) => {
      const got = call(buf, need) >>> 0;
      return this.readBytes(buf, Math.min(got, need));
    });
  }
  private asciiZ(bytes: Uint8Array): string {
    let end = bytes.length;
    while (end > 0 && bytes[end - 1] === 0) end--;
    return new TextDecoder().decode(bytes.subarray(0, end));
  }
  private utf16z(bytes: Uint8Array): string {
    let end = bytes.length & ~1;
    while (end >= 2 && bytes[end - 2] === 0 && bytes[end - 1] === 0) end -= 2;
    return new TextDecoder('utf-16le').decode(bytes.subarray(0, end));
  }

  // ───────────── document / page ─────────────
  open(bytes: Uint8Array, password = ''): Doc {
    const bufPtr = this.writeBytes(bytes);
    const ptr = this.w.FPDF_LoadMemDocument(bufPtr, bytes.length, password);
    if (!ptr) {
      const err = this.w.FPDF_GetLastError();
      this.free(bufPtr);
      throw new PdfiumOpenError(err);
    }
    return { ptr, bufPtr, pageCount: this.w.FPDF_GetPageCount(ptr) };
  }
  isEncrypted(doc: Doc): boolean {
    return this.w.EPDF_IsEncrypted(doc.ptr);
  }
  /** Removes the encryption dictionary so `save` writes an unprotected copy. */
  removeEncryption(doc: Doc): boolean {
    return this.w.EPDF_RemoveEncryption(doc.ptr);
  }
  /** PDF permission flags (bit 3 = print, 4 = modify, 5 = copy, 6 = annotate); 0xffffffff when unprotected or owner-unlocked. */
  permissions(doc: Doc): number {
    return this.w.FPDF_GetDocPermissions(doc.ptr) >>> 0;
  }

  close(doc: Doc): void {
    this.w.FPDF_CloseDocument(doc.ptr);
    this.free(doc.bufPtr);
  }
  loadPage(doc: Doc, index: number): Page {
    const ptr = this.w.FPDF_LoadPage(doc.ptr, index);
    if (!ptr) throw new Error(`FPDF_LoadPage(${index}) failed`);
    return { ptr, index, width: this.w.FPDF_GetPageWidthF(ptr), height: this.w.FPDF_GetPageHeightF(ptr) };
  }
  closePage(page: Page): void {
    this.w.FPDF_ClosePage(page.ptr);
  }

  /** Serialize the document (all pending edits must already be flushed with generateContent). */
  save(doc: Doc): Uint8Array {
    const writer = this.w.PDFiumExt_OpenFileWriter();
    try {
      this.w.PDFiumExt_SaveAsCopy(doc.ptr, writer);
      const size = this.w.PDFiumExt_GetFileWriterSize(writer);
      return this.withAlloc(size, (buf) => {
        this.w.PDFiumExt_GetFileWriterData(writer, buf, size);
        return this.readBytes(buf, size);
      });
    } finally {
      this.w.PDFiumExt_CloseFileWriter(writer);
    }
  }

  /** Maps a point from default user space to device pixels for a render of `width`×`height` (honours /Rotate and the page box). */
  pageToDevice(page: Page, width: number, height: number, x: number, y: number): [number, number] {
    return this.withAlloc(8, (p) => {
      this.w.FPDF_PageToDevice(page.ptr, 0, 0, width, height, 0, x, y, p, p + 4);
      return [this.w.pdfium.getValue(p, 'i32'), this.w.pdfium.getValue(p + 4, 'i32')];
    });
  }

  // ───────────── page organization (copying pages between documents) ─────────────
  /** A new empty document (no source buffer, so `bufPtr` is 0). */
  createDocument(): Doc {
    const ptr = this.w.FPDF_CreateNewDocument();
    if (!ptr) throw new Error('FPDF_CreateNewDocument failed');
    return { ptr, bufPtr: 0, pageCount: 0 };
  }
  pageCountOf(doc: Doc): number {
    return this.w.FPDF_GetPageCount(doc.ptr);
  }
  /**
   * Copies pages (0-based, repeats allowed) from `src` into `dest` starting at position `at`. PDFium copies the page
   * objects as they are (content streams, fonts and images are not regenerated) and only what each page references.
   */
  importPages(dest: Doc, src: Doc, pages: number[], at: number): boolean {
    if (!pages.length) return true;
    return this.withAlloc(pages.length * 4, (p) => {
      this.heaps.HEAPU32.set(pages, p >> 2);
      return this.w.FPDF_ImportPagesByIndex(dest.ptr, src.ptr, p, pages.length, at);
    });
  }
  newBlankPage(doc: Doc, index: number, width: number, height: number): void {
    const page = this.w.FPDFPage_New(doc.ptr, index, width, height);
    if (!page) throw new Error('FPDFPage_New failed');
    this.w.FPDF_ClosePage(page);
  }
  deletePage(doc: Doc, index: number): void {
    this.w.FPDFPage_Delete(doc.ptr, index);
  }
  /** The page's /Rotate in quarter turns (0–3). */
  rotationOf(page: Page): number {
    return this.w.FPDFPage_GetRotation(page.ptr);
  }
  setRotation(page: Page, quarterTurns: number): void {
    this.w.FPDFPage_SetRotation(page.ptr, ((quarterTurns % 4) + 4) % 4);
  }
  /** The page's /Rotate in quarter turns (0–3) without loading the page. */
  rotationByIndex(doc: Doc, index: number): number {
    return this.w.EPDF_GetPageRotationByIndex(doc.ptr, index);
  }
  /** Displayed size (already rotated) without loading the page. */
  pageSize(doc: Doc, index: number): { width: number; height: number } {
    return this.withAlloc(8, (p) => {
      if (!this.w.FPDF_GetPageSizeByIndexF(doc.ptr, index, p)) return { width: 612, height: 792 };
      return { width: this.f32At(p), height: this.f32At(p + 4) };
    });
  }
  metaText(doc: Doc, key: string): string {
    return this.utf16z(this.readSized((b, n) => this.w.FPDF_GetMetaText(doc.ptr, key, b, n)));
  }
  setMetaText(doc: Doc, key: string, value: string): boolean {
    const p = this.writeUtf16(value);
    try {
      return this.w.EPDF_SetMetaText(doc.ptr, key, p);
    } finally {
      this.free(p);
    }
  }
  copyViewerPreferences(dest: Doc, src: Doc): boolean {
    return this.w.FPDF_CopyViewerPreferences(dest.ptr, src.ptr);
  }

  /**
   * Bookmarks in document order: title, 0-based target page (−1 when it points nowhere), nesting level (1 = top) and
   * the destination view, so a copy can aim at the same spot on the page.
   */
  outline(doc: Doc): Array<{ title: string; page: number; level: number; view: DestView | null }> {
    const out: Array<{ title: string; page: number; level: number; view: DestView | null }> = [];
    const seen = new Set<Ptr>();
    const walk = (parent: Ptr, level: number): void => {
      for (let bm = this.w.FPDFBookmark_GetFirstChild(doc.ptr, parent); bm; bm = this.w.FPDFBookmark_GetNextSibling(doc.ptr, bm)) {
        if (seen.has(bm) || out.length >= 20000) return; // damaged outlines can loop
        seen.add(bm);
        const title = this.utf16z(this.readSized((b, n) => this.w.FPDFBookmark_GetTitle(bm, b, n)));
        const dest = this.w.FPDFBookmark_GetDest(doc.ptr, bm);
        out.push({
          title,
          page: dest ? this.w.FPDFDest_GetDestPageIndex(doc.ptr, dest) : -1,
          level,
          view: dest ? this.destView(dest) : null,
        });
        if (level < 8) walk(bm, level + 1);
      }
    };
    walk(0, 1);
    return out;
  }

  private destView(dest: Ptr): DestView {
    return this.withAlloc(64, (p) => {
      const mode = this.w.FPDFDest_GetView(dest, p, p + 4);
      const params = Array.from({ length: Math.min(this.u32At(p), 4) }, (_, i) => this.f32At(p + 4 + 4 * i));
      let xyz: DestView['xyz'];
      if (mode === 1 && this.w.FPDFDest_GetLocationInPage(dest, p + 24, p + 28, p + 32, p + 36, p + 40, p + 44)) {
        xyz = {
          x: this.u32At(p + 24) ? this.f32At(p + 36) : null,
          y: this.u32At(p + 28) ? this.f32At(p + 40) : null,
          zoom: this.u32At(p + 32) ? this.f32At(p + 44) : null,
        };
      }
      return { mode, params, xyz };
    });
  }

  /** Link annotations of a page in order, with the page and view they jump to inside the document (−1 / null elsewhere). */
  links(doc: Doc, page: Page): Array<{ rect: [number, number, number, number]; destPage: number; view: DestView | null }> {
    const out: Array<{ rect: [number, number, number, number]; destPage: number; view: DestView | null }> = [];
    this.forEachLink(page, (link) => {
      let rect: [number, number, number, number] = [0, 0, 0, 0];
      this.withAlloc(16, (r) => {
        if (this.w.FPDFLink_GetAnnotRect(link, r)) rect = [this.f32At(r), this.f32At(r + 4), this.f32At(r + 8), this.f32At(r + 12)];
      });
      let dest = this.w.FPDFLink_GetDest(doc.ptr, link);
      if (!dest) {
        const action = this.w.FPDFLink_GetAction(link);
        if (action && this.w.FPDFAction_GetType(action) === 1 /* GoTo */) dest = this.w.FPDFAction_GetDest(doc.ptr, action);
      }
      out.push({ rect, destPage: dest ? this.w.FPDFDest_GetDestPageIndex(doc.ptr, dest) : -1, view: dest ? this.destView(dest) : null });
    });
    return out;
  }

  /** Points links (numbered as in `links`) at pages of the same document. */
  retargetLinks(doc: Doc, page: Page, fixes: Map<number, { target: Page; view: DestView | null }>): number {
    let done = 0;
    let index = 0;
    this.forEachLink(page, (link) => {
      const fix = fixes.get(index++);
      if (!fix) return;
      const annot = this.w.FPDFLink_GetAnnot(page.ptr, link);
      if (!annot) return;
      try {
        const action = this.w.EPDFAction_CreateGoTo(doc.ptr, this.createDest(fix.target, fix.view));
        if (action && this.w.EPDFAnnot_SetAction(annot, action)) done++;
      } finally {
        this.w.FPDFPage_CloseAnnot(annot);
      }
    });
    return done;
  }

  private forEachLink(page: Page, fn: (link: Ptr) => void): void {
    this.withAlloc(8, (p) => {
      this.u8.fill(0, p, p + 8);
      for (let guard = 0; guard < 100000 && this.w.FPDFLink_Enumerate(page.ptr, p, p + 4); guard++) fn(this.u32At(p + 4));
    });
  }

  private createDest(page: Page, view: DestView | null): Ptr {
    if (view && view.mode >= 2 && view.mode <= 8) {
      return this.withAlloc(16, (p) => {
        this.heaps.HEAPF32.set(view.params.slice(0, 4), p >> 2);
        return this.w.EPDFDest_CreateView(page.ptr, view.mode, p, Math.min(view.params.length, 4));
      });
    }
    const v = view?.xyz;
    return this.w.EPDFDest_CreateXYZ(page.ptr, v?.x != null, v?.x ?? 0, v?.y != null, v?.y ?? 0, v?.zoom != null, v?.zoom ?? 0);
  }

  /**
   * Appends a bookmark (under `parent`, or at the top level when 0) that jumps to `page` of `doc`, with the same view
   * as `view` when given. Returns the new bookmark handle.
   */
  addBookmark(doc: Doc, parent: Ptr, title: string, page: Page, view: DestView | null): Ptr {
    const t = this.writeUtf16(title);
    try {
      const bm = parent ? this.w.EPDFBookmark_AppendChild(doc.ptr, parent, t) : this.w.EPDFBookmark_Create(doc.ptr, t);
      if (!bm) throw new Error('could not create bookmark');
      const dest = this.createDest(page, view);
      if (dest) this.w.EPDFBookmark_SetDest(doc.ptr, bm, dest);
      return bm;
    } finally {
      this.free(t);
    }
  }

  // ───────────── rendering ─────────────
  render(page: Page, scale: number, opts: { annots?: boolean } = {}): Bitmap {
    const width = Math.max(1, Math.round(page.width * scale));
    const height = Math.max(1, Math.round(page.height * scale));
    const stride = width * 4;
    const heap = this.malloc(stride * height);
    try {
      const bmp = this.w.FPDFBitmap_CreateEx(width, height, 4 /* BGRA */, heap, stride);
      this.w.FPDFBitmap_FillRect(bmp, 0, 0, width, height, 0xffffffff);
      const flags = RenderFlag.ReverseByteOrder | (opts.annots ? RenderFlag.Annot : 0);
      this.w.FPDF_RenderPageBitmap(bmp, page.ptr, 0, 0, width, height, 0, flags);
      this.w.FPDFBitmap_Destroy(bmp);
      return { width, height, data: this.readBytes(heap, stride * height) };
    } finally {
      this.free(heap);
    }
  }

  // ───────────── page objects ─────────────
  countObjects(page: Page): number {
    return this.w.FPDFPage_CountObjects(page.ptr);
  }
  getObject(page: Page, i: number): Ptr {
    return this.w.FPDFPage_GetObject(page.ptr, i);
  }
  objType(obj: Ptr): number {
    return this.w.FPDFPageObj_GetType(obj);
  }
  bounds(obj: Ptr): Rect | null {
    return this.withAlloc(16, (p) => {
      if (!this.w.FPDFPageObj_GetBounds(obj, p, p + 4, p + 8, p + 12)) return null;
      return { left: this.f32At(p), bottom: this.f32At(p + 4), right: this.f32At(p + 8), top: this.f32At(p + 12) };
    });
  }
  matrix(obj: Ptr): Matrix | null {
    return this.withAlloc(24, (p) => {
      if (!this.w.FPDFPageObj_GetMatrix(obj, p)) return null;
      return {
        a: this.f32At(p),
        b: this.f32At(p + 4),
        c: this.f32At(p + 8),
        d: this.f32At(p + 12),
        e: this.f32At(p + 16),
        f: this.f32At(p + 20),
      };
    });
  }
  setMatrix(obj: Ptr, m: Matrix): boolean {
    return this.withAlloc(24, (p) => {
      const h = this.heaps.HEAPF32;
      h.set([m.a, m.b, m.c, m.d, m.e, m.f], p >> 2);
      return this.w.FPDFPageObj_SetMatrix(obj, p);
    });
  }
  fillColor(obj: Ptr): [number, number, number, number] | null {
    return this.withAlloc(16, (p) => {
      if (!this.w.FPDFPageObj_GetFillColor(obj, p, p + 4, p + 8, p + 12)) return null;
      return [this.u32At(p), this.u32At(p + 4), this.u32At(p + 8), this.u32At(p + 12)];
    });
  }
  /** Marks the object (and its content stream) dirty without changing its geometry. */
  touch(obj: Ptr): void {
    this.w.FPDFPageObj_Transform(obj, 1, 0, 0, 1, 0, 0);
  }
  generateContent(page: Page): boolean {
    return this.w.FPDFPage_GenerateContent(page.ptr);
  }

  // ───────────── text objects & fonts ─────────────
  loadTextPage(page: Page): Ptr {
    return this.w.FPDFText_LoadPage(page.ptr);
  }
  closeTextPage(tp: Ptr): void {
    this.w.FPDFText_ClosePage(tp);
  }
  textOf(obj: Ptr, tp: Ptr): string {
    return this.utf16z(this.readSized((b, n) => this.w.FPDFTextObj_GetText(obj, tp, b, n)));
  }
  fontOf(obj: Ptr): Ptr {
    return this.w.FPDFTextObj_GetFont(obj);
  }
  fontSizeOf(obj: Ptr): number {
    return this.withAlloc(4, (p) => (this.w.FPDFTextObj_GetFontSize(obj, p) ? this.f32At(p) : NaN));
  }
  renderMode(obj: Ptr): number {
    return this.w.FPDFTextObj_GetTextRenderMode(obj);
  }
  fontInfo(font: Ptr): FontInfo {
    const baseName = this.asciiZ(this.readSized((b, n) => this.w.FPDFFont_GetBaseFontName(font, b, n)));
    const familyName = this.asciiZ(this.readSized((b, n) => this.w.FPDFFont_GetFamilyName(font, b, n)));
    const italicAngle = this.withAlloc(4, (p) => (this.w.FPDFFont_GetItalicAngle(font, p) ? this.u32At(p) | 0 : 0));
    return {
      baseName,
      familyName,
      flags: this.w.FPDFFont_GetFlags(font),
      weight: this.w.FPDFFont_GetWeight(font),
      italicAngle,
      embedded: this.w.FPDFFont_GetIsEmbedded(font) === 1,
    };
  }
  /** The embedded font program (TrueType/CFF/Type1) or null when the font is not embedded. */
  fontData(font: Ptr): Uint8Array | null {
    return this.withAlloc(4, (outLen) => {
      if (!this.w.FPDFFont_GetFontData(font, 0, 0, outLen)) return null;
      const n = this.u32At(outLen);
      if (!n) return null;
      return this.withAlloc(n, (buf) => {
        if (!this.w.FPDFFont_GetFontData(font, buf, n, outLen)) return null;
        return this.readBytes(buf, n);
      });
    });
  }
  /** Advance width of a charcode in 1/1000 em-independent points for `size`. */
  glyphWidth(font: Ptr, charcode: number, size: number): number {
    return this.withAlloc(4, (p) => (this.w.FPDFFont_GetGlyphWidth(font, charcode, size, p) ? this.f32At(p) : NaN));
  }

  // ───────────── text page (read-only oracle: PDFium's own per-character geometry) ─────────────
  /** All characters PDFium extracted from the page, in reading order, in default user space. */
  textChars(tp: Ptr): Array<{ unicode: number; x: number; y: number; size: number; generated: boolean }> {
    const n = this.w.FPDFText_CountChars(tp);
    const out: Array<{ unicode: number; x: number; y: number; size: number; generated: boolean }> = [];
    this.withAlloc(16, (p) => {
      for (let i = 0; i < n; i++) {
        const ok = this.w.FPDFText_GetCharOrigin(tp, i, p, p + 8);
        out.push({
          unicode: this.w.FPDFText_GetUnicode(tp, i),
          x: ok ? this.f64At(p) : NaN,
          y: ok ? this.f64At(p + 8) : NaN,
          size: this.w.FPDFText_GetFontSize(tp, i),
          generated: this.w.FPDFText_IsGenerated(tp, i) === 1,
        });
      }
    });
    return out;
  }

  // ───────────── selection (PDFium's own reading-order logic, as used by Chrome's viewer) ─────────────
  /** Character index under a point in user space (−1 when none), with a tolerance in points. */
  charAt(tp: Ptr, x: number, y: number, tolX = 6, tolY = 6): number {
    return this.w.FPDFText_GetCharIndexAtPos(tp, x, y, tolX, tolY);
  }
  countChars(tp: Ptr): number {
    return this.w.FPDFText_CountChars(tp);
  }
  /** Rectangles (user space, y up) covering `count` characters starting at `start`. */
  selectionRects(tp: Ptr, start: number, count: number): Array<{ left: number; bottom: number; right: number; top: number }> {
    const n = this.w.FPDFText_CountRects(tp, start, count);
    const out: Array<{ left: number; bottom: number; right: number; top: number }> = [];
    this.withAlloc(32, (p) => {
      for (let i = 0; i < n; i++) {
        if (!this.w.FPDFText_GetRect(tp, i, p, p + 8, p + 16, p + 24)) continue;
        out.push({ left: this.f64At(p), top: this.f64At(p + 8), right: this.f64At(p + 16), bottom: this.f64At(p + 24) });
      }
    });
    return out;
  }
  /** Matches of `query` on a text page as (character index, length) in PDFium's reading-order indices. */
  findAll(
    tp: Ptr,
    query: string,
    opts: { matchCase?: boolean; wholeWord?: boolean } = {},
    limit = 5000,
  ): Array<{ start: number; count: number }> {
    if (!query) return [];
    const q = this.writeUtf16(query);
    try {
      const h = this.w.FPDFText_FindStart(tp, q, (opts.matchCase ? 1 : 0) | (opts.wholeWord ? 2 : 0), 0);
      if (!h) return [];
      try {
        const out: Array<{ start: number; count: number }> = [];
        while (out.length < limit && this.w.FPDFText_FindNext(h)) {
          out.push({ start: this.w.FPDFText_GetSchResultIndex(h), count: this.w.FPDFText_GetSchCount(h) });
        }
        return out;
      } finally {
        this.w.FPDFText_FindClose(h);
      }
    } finally {
      this.free(q);
    }
  }
  /** Extracted text for a character range (PDFium inserts \r\n between lines and spaces between words). */
  textRange(tp: Ptr, start: number, count: number): string {
    if (count <= 0) return '';
    return this.withAlloc((count + 1) * 2, (buf) => {
      const written = this.w.FPDFText_GetText(tp, start, count, buf);
      return this.utf16z(this.readBytes(buf, Math.max(0, written) * 2));
    });
  }
}
