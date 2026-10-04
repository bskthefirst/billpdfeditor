/** Types shared by the engine worker and the UI. Everything here must be structured-clonable. */

export type Mat6 = [number, number, number, number, number, number];

export interface PageInfo {
  index: number;
  /** Displayed size in PDF points (already rotated). */
  width: number;
  height: number;
  rotate: number;
  /** device ← user space matrix at scale 1 (handles /Rotate and non-zero page-box origins). */
  toDevice: Mat6;
}

export interface DocInfo {
  pages: PageInfo[];
  /** The file structure was damaged and had to be rebuilt. */
  repaired: boolean;
  /** The file was encrypted; edits apply to an unprotected copy. */
  decrypted: boolean;
  /** The author restricted editing (permission flags); only meaningful when `decrypted`. */
  restricted: boolean;
  /** A password is required to open the file (retry `open` with one). */
  needsPassword?: boolean;
}

export interface RunFont {
  name: string;
  subtype: string;
  embedded: boolean;
  subset: boolean;
}

/**
 * One line of text as the user sees it: glyphs from any number of text operators on a baseline, with virtual spaces where
 * the PDF leaves word gaps. This is the unit that is hit-tested, shown and edited.
 */
export interface LineInfo {
  /** Stable across edits (derived from the original document). */
  id: string;
  page: number;
  /** Current text (reflects pending edits). */
  text: string;
  originalText: string;
  modified: boolean;
  /** One entry per character of `text` (virtual spaces included): [x, y, advanceX, advanceY] in user space. */
  glyphs: Array<[number, number, number, number]>;
  /** Em-box axes in user space (already scaled by the font size): `right` along the baseline, `up` perpendicular. */
  right: [number, number];
  up: [number, number];
  /** Fractions of an em above/below the baseline. */
  ascent: number;
  descent: number;
  /** Effective painted size in points. */
  size: number;
  font: RunFont;
  editable: boolean;
  reason?: string;
  /** Characters of the current text the original font cannot draw (editing is refused until a fallback exists). */
  missing?: string[];
}

export interface Substitution {
  /** The characters drawn with a different font. */
  text: string;
  /** Human-readable font name, e.g. "Gelasio Bold". */
  font: string;
  /** Why it was chosen, e.g. "metric-compatible with Georgia". */
  note: string;
}

export interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
}

export interface SetTextResult extends Partial<HistoryState> {
  ok: boolean;
  /** Set when no available font can draw some characters. */
  missing?: string[];
  error?: string;
  /** Present when the original font lacked some characters and other fonts were embedded for them. */
  substitutions?: Substitution[];
  /** Bumped on every successful change; the UI re-renders pages when it differs from what it last drew. */
  revision: number;
}

export interface RenderedPage {
  width: number;
  height: number;
  /** RGBA pixels. */
  data: ArrayBuffer;
  revision: number;
}

/** A selected span of a page's text, in PDFium's reading-order character indices. */
export interface TextSelection {
  page: number;
  start: number;
  count: number;
  /** Highlight rectangles in user space: [x0, y0, x1, y1] with y0 < y1. */
  rects: Array<[number, number, number, number]>;
  text: string;
}

/** A bookmark flattened in document order (`page` is 0-based, −1 when it points nowhere; `level` 1 = top). */
export interface OutlineEntry {
  title: string;
  page: number;
  level: number;
}

/** A PDF the page tools can copy pages from: the open document (edits applied) or any other file. */
export interface SourceInfo {
  /** Handle for `renderSource`, `outline` and `buildPdf`; 0 when the file could not be opened. */
  id: number;
  name: string;
  /** Displayed size of every page in points (already rotated) and the page's own /Rotate in degrees. */
  pages: Array<{ width: number; height: number; rotate: number }>;
  /** The file was encrypted; pages are copied into an unprotected file. */
  decrypted: boolean;
  /** The author restricted editing (permission flags); only meaningful when `decrypted`. */
  restricted: boolean;
  /** A password is required (retry `openSource` with one). */
  needsPassword?: boolean;
}

/** One page of a PDF to build: a page of a source (optionally turned further) or a new blank page. */
export type PageSpec =
  | { kind: 'page'; src: number; page: number; /** extra clockwise turn in degrees (multiple of 90) */ rotate?: number }
  | { kind: 'blank'; width: number; height: number };

export interface BuildOptions {
  /** Keep bookmarks that point at pages in the new file (default true). */
  bookmarks?: boolean;
  /** Title for the new file; defaults to the first source's title. */
  title?: string;
}

export interface SearchOptions {
  matchCase?: boolean;
  wholeWord?: boolean;
}

export interface SearchHit {
  page: number;
  /** Character range in PDFium's reading-order indices (the same indices `select` takes). */
  start: number;
  count: number;
  /** Highlight rectangles in user space: [x0, y0, x1, y1] with y0 < y1. */
  rects: Array<[number, number, number, number]>;
  /** The matched text with a little context on each side (single line). */
  before: string;
  text: string;
  after: string;
}

export interface SearchPage {
  hits: SearchHit[];
  /** First page that has not been searched yet, or null when the whole document is done. */
  next: number | null;
}

export interface EngineConfig {
  /** Absolute URL of the folder that holds the fallback fonts (public/fonts). */
  fontsBase: string;
}

/** Methods the worker exposes (see engine/worker.ts). */
export interface EngineApi {
  configure(config: EngineConfig): void;
  open(bytes: ArrayBuffer, password?: string): DocInfo;
  getLines(page: number): LineInfo[];
  setLineText(lineId: string, text: string): Promise<SetTextResult>;
  resetLine(lineId: string): Promise<SetTextResult>;
  undo(): Promise<SetTextResult & { lineId?: string | null }>;
  redo(): Promise<SetTextResult & { lineId?: string | null }>;
  history(): HistoryState;
  render(page: number, scale: number): RenderedPage;
  /** Character index at a user-space point, or -1. */
  hitChar(page: number, x: number, y: number): number;
  /** Selection between two character indices (inclusive, any order). */
  select(page: number, a: number, b: number): TextSelection;
  /**
   * Finds `query` in the current document (edits included), `pageBudget` pages at a time starting at `fromPage`, so the
   * UI can show results while a long document is still being searched.
   */
  search(query: string, options?: SearchOptions, fromPage?: number, pageBudget?: number): SearchPage;
  /** Word or line around a character index (for double / triple click). */
  expandSelection(page: number, index: number, unit: 'word' | 'line'): TextSelection;
  save(): ArrayBuffer;
  revision(): number;

  // Page tools: copy, reorder, rotate and split pages without re-rendering anything (see engine/pages.ts).
  /** Registers a PDF as a page source; the buffer is transferred. */
  openSource(bytes: ArrayBuffer, name: string, password?: string): SourceInfo;
  /** Registers the open document, with every pending text edit applied, as a page source. */
  snapshotSource(name: string): SourceInfo;
  closeSource(id: number): void;
  /** Renders any page of a source (thumbnails). */
  renderSource(src: number, page: number, scale: number): RenderedPage;
  outline(src: number): OutlineEntry[];
  /** Builds a new PDF from the listed pages, in order. Pages are copied exactly; nothing is regenerated. */
  buildPdf(pages: PageSpec[], options?: BuildOptions): ArrayBuffer;
}
