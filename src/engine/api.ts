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
  repaired: boolean;
  encrypted: boolean;
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

export interface EngineConfig {
  /** Absolute URL of the folder that holds the fallback fonts (public/fonts). */
  fontsBase: string;
}

/** Methods the worker exposes (see engine/worker.ts). */
export interface EngineApi {
  configure(config: EngineConfig): void;
  open(bytes: ArrayBuffer): DocInfo;
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
  /** Word or line around a character index (for double / triple click). */
  expandSelection(page: number, index: number, unit: 'word' | 'line'): TextSelection;
  save(): ArrayBuffer;
  revision(): number;
}
