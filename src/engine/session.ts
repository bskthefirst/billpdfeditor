/**
 * EngineSession ties everything together: the base PDF (never modified), pending line edits, the patched bytes, and
 * PDFium for rendering the patched result. Edits are always planned against the *base* document, so re-editing, undo and
 * "reset to original" are trivial and the file never accumulates revisions while typing. It runs inside the engine
 * worker but has no worker dependencies, so tests drive it directly in Node.
 */
import { PdfiumCore, PdfiumOpenError, type Doc } from './core';
import type { DocInfo, HistoryState, LineInfo, Mat6, PageInfo, RenderedPage, SetTextResult, Substitution, TextSelection } from './api';
import { PdfFile, type PdfPage } from '../pdf/file';
import { TextExtractor, effectiveFontSize, type ContentUnit, type ShowOp } from '../pdf/text';
import { commitUnitEdits, type ByteEdit, type SubstituteFont, type SubstituteSegment } from '../pdf/patch';
import { planShifts } from '../pdf/reflow';
import { IncrementalUpdate } from '../pdf/writer';
import { ResourceEditor } from '../pdf/resources';
import { buildLines, planLineEdit, type GlyphBox, type Line, type Vec } from './lines';
import { embedCidTrueType, type EmbeddedFont } from '../fonts/embed';
import type { FontResolver, LoadedFont, Segment } from '../fonts/resolver';
import type { Subsetter } from '../fonts/subset';

export interface SessionDeps {
  subsetter: Subsetter;
  fonts: FontResolver;
}

interface PageModel {
  ops: ShowOp[];
  lines: Line[];
}

interface EditRec {
  /** Full new text of the line. */
  text: string;
  /** Fonts for the inserted text when the anchor glyph's own font cannot draw it. */
  segments?: Segment[];
}

function buildPage(file: PdfFile, page: PdfPage, pageIndex: number): PageModel {
  const ops = new TextExtractor(file).extractPage(page);
  const counts = new Map<ContentUnit, number>();
  const keys = new Map<ShowOp, string>();
  for (const op of ops) {
    const n = counts.get(op.unit) ?? 0;
    counts.set(op.unit, n + 1);
    keys.set(op, `${op.unit.kind === 'page' ? 'p' : `f${op.unit.num}`}.${n}`);
  }
  return { ops, lines: buildLines(ops, (o) => keys.get(o)!, pageIndex) };
}

export class EngineSession {
  private base!: PdfFile;
  private baseBytes!: Uint8Array;
  private curBytes!: Uint8Array;
  private rev = 0;
  private edits = new Map<string, EditRec>();
  private lineGeo = new Map<string, GlyphBox[]>();
  private models = new Map<number, PageModel>();
  private pdfium: { doc: Doc; rev: number } | null = null;
  private pages: PdfPage[] = [];
  private subsetCache = new Map<string, Uint8Array>();
  private queue: Promise<unknown> = Promise.resolve();
  /** Undo history: snapshots of the edit set. Typing bursts in one line coalesce into a single step. */
  private states: Array<{ edits: Map<string, EditRec>; lineId: string | null; t: number }> = [{ edits: new Map(), lineId: null, t: 0 }];
  private cursor = 0;
  private textPages = new Map<number, { page: ReturnType<PdfiumCore['loadPage']>; tp: number; text: string }>();

  constructor(
    private readonly core: PdfiumCore,
    private readonly deps: SessionDeps,
  ) {}

  get revisionNumber(): number {
    return this.rev;
  }

  open(bytes: Uint8Array, password = ''): DocInfo {
    this.closeDoc();
    let work = bytes;
    let file: PdfFile | null = null;
    try {
      file = PdfFile.load(bytes);
    } catch {
      file = null; // damaged, or encrypted with compressed object streams: PDFium gets a chance below
    }
    let decrypted = false;
    let restricted = false;
    let repairedByPdfium = false;
    if (!file || file.encrypted) {
      // PDFium reads RC4/AES-protected files (including those with an empty user password) and can write an unprotected
      // copy; our own parser then works on that copy. It also rewrites damaged files into a clean structure.
      let doc: Doc;
      try {
        doc = this.core.open(bytes, password);
      } catch (e) {
        if (e instanceof PdfiumOpenError && e.needsPassword)
          return { pages: [], repaired: false, decrypted: false, restricted: false, needsPassword: true };
        throw e;
      }
      try {
        const perms = this.core.permissions(doc);
        if (doc.pageCount === 0 && this.core.isEncrypted(doc))
          throw new Error('This PDF uses an encryption method that could not be unlocked without its password.');
        if (this.core.isEncrypted(doc)) {
          decrypted = true;
          restricted = perms !== 0xffffffff && (perms & 0x8) === 0; // bit 4: modify contents
          this.core.removeEncryption(doc);
        } else repairedByPdfium = true;
        work = this.core.save(doc);
      } finally {
        this.core.close(doc);
      }
      file = PdfFile.load(work);
    }
    this.base = file;
    this.baseBytes = work;
    this.curBytes = work;
    this.rev = 0;
    this.edits.clear();
    this.lineGeo.clear();
    this.models.clear();
    this.subsetCache.clear();
    this.states = [{ edits: new Map(), lineId: null, t: 0 }];
    this.cursor = 0;
    this.pages = this.base.pages();
    const infos: PageInfo[] = [];
    const doc = this.pdfiumDoc();
    for (let i = 0; i < Math.min(doc.pageCount, this.pages.length); i++) infos.push(this.pageInfo(doc, i));
    return { pages: infos, repaired: this.base.repaired || repairedByPdfium, decrypted, restricted };
  }

  private closeDoc(): void {
    this.closeTextPages();
    if (this.pdfium) this.core.close(this.pdfium.doc);
    this.pdfium = null;
  }

  private closeTextPages(): void {
    for (const t of this.textPages.values()) {
      this.core.closeTextPage(t.tp);
      this.core.closePage(t.page);
    }
    this.textPages.clear();
  }

  /** PDFium's view of the *current* (patched) bytes; reopened whenever the revision changes. */
  private pdfiumDoc(): Doc {
    if (!this.pdfium || this.pdfium.rev !== this.rev) {
      this.closeDoc(); // also closes cached text pages
      this.pdfium = { doc: this.core.open(this.curBytes), rev: this.rev };
    }
    return this.pdfium.doc;
  }

  private pageInfo(doc: Doc, i: number): PageInfo {
    const page = this.core.loadPage(doc, i);
    const K = 1000;
    const dev = (x: number, y: number) => this.core.pageToDevice(page, Math.round(page.width * K), Math.round(page.height * K), x, y);
    const o = dev(0, 0);
    const ex = dev(K, 0);
    const ey = dev(0, K);
    const toDevice: Mat6 = [
      (ex[0] - o[0]) / K / K,
      (ex[1] - o[1]) / K / K,
      (ey[0] - o[0]) / K / K,
      (ey[1] - o[1]) / K / K,
      o[0] / K,
      o[1] / K,
    ];
    const info: PageInfo = { index: i, width: page.width, height: page.height, rotate: this.pages[i]?.rotate ?? 0, toDevice };
    this.core.closePage(page);
    return info;
  }

  render(pageIndex: number, scale: number): RenderedPage {
    const doc = this.pdfiumDoc();
    const page = this.core.loadPage(doc, pageIndex);
    const bmp = this.core.render(page, scale);
    this.core.closePage(page);
    return { width: bmp.width, height: bmp.height, data: bmp.data.buffer as ArrayBuffer, revision: this.rev };
  }

  save(): Uint8Array {
    return this.curBytes;
  }

  get hasEdits(): boolean {
    return this.edits.size > 0;
  }

  // ───────────── selection (PDFium's reading-order logic, as in Chrome's viewer) ─────────────
  private textPage(pageIndex: number) {
    const doc = this.pdfiumDoc();
    let t = this.textPages.get(pageIndex);
    if (!t) {
      const page = this.core.loadPage(doc, pageIndex);
      const tp = this.core.loadTextPage(page);
      t = { page, tp, text: this.core.textRange(tp, 0, this.core.countChars(tp)) };
      this.textPages.set(pageIndex, t);
    }
    return t;
  }

  /**
   * Character under (or nearest to) a point. Like Chrome's viewer, a drag that ends past the end of a line, in the
   * margin, or between lines still resolves to the closest character on that line instead of "nothing".
   */
  hitChar(page: number, x: number, y: number): number {
    const { tp } = this.textPage(page);
    for (const [tx, ty] of [
      [4, 4],
      [60, 8],
      [500, 16],
      [3000, 50],
    ]) {
      const i = this.core.charAt(tp, x, y, tx, ty);
      if (i >= 0) return i;
    }
    return -1;
  }

  select(page: number, a: number, b: number): TextSelection {
    const { tp } = this.textPage(page);
    const start = Math.max(0, Math.min(a, b));
    const count = Math.max(0, Math.max(a, b) - start + 1);
    return {
      page,
      start,
      count,
      rects: this.core.selectionRects(tp, start, count).map((r) => [r.left, r.bottom, r.right, r.top]),
      text: this.core.textRange(tp, start, count),
    };
  }

  expandSelection(page: number, index: number, unit: 'word' | 'line'): TextSelection {
    const { text } = this.textPage(page);
    if (index < 0 || index >= text.length) return this.select(page, 0, -1);
    const isWordChar = (c: string) => /[\p{L}\p{N}\p{M}_'’-]/u.test(c);
    const stop = (c: string) => (unit === 'line' ? c === '\n' || c === '\r' : !isWordChar(c));
    let a = index;
    let b = index;
    if (stop(text[index])) return this.select(page, index, index);
    while (a > 0 && !stop(text[a - 1])) a--;
    while (b < text.length - 1 && !stop(text[b + 1])) b++;
    return this.select(page, a, b);
  }

  // ───────────── lines ─────────────
  private model(page: number): PageModel {
    let m = this.models.get(page);
    if (!m) this.models.set(page, (m = buildPage(this.base, this.pages[page], page)));
    return m;
  }

  private findLine(lineId: string): Line | null {
    const page = Number(lineId.split(':')[0]);
    if (!this.pages[page]) return null;
    return this.model(page).lines.find((l) => l.id === lineId) ?? null;
  }

  getLines(page: number): LineInfo[] {
    if (page < 0 || page >= this.pages.length) return [];
    return this.model(page).lines.map((line) => {
      const rec = this.edits.get(line.id);
      const geo = this.lineGeo.get(line.id);
      const dominant = line.ops.reduce((a, b) =>
        Math.abs(b.fontSize) * Math.hypot(b.up[0], b.up[1]) > Math.abs(a.fontSize) * Math.hypot(a.up[0], a.up[1]) ? b : a,
      );
      const f = dominant.font;
      return {
        id: line.id,
        page,
        text: rec ? rec.text : line.text,
        originalText: line.text,
        modified: !!rec,
        glyphs: rec && geo ? geo : line.items.map((it) => [it.x, it.y, it.ax, it.ay] as GlyphBox),
        right: dominant.right,
        up: dominant.up,
        ascent: line.ascent,
        descent: line.descent,
        size: effectiveFontSize(dominant),
        font: { name: f?.baseFont ?? '', subtype: f?.subtype ?? '', embedded: !!f?.embedded, subset: !!f?.subsetTag },
        editable: line.editable,
        reason: line.reason,
      };
    });
  }

  // ───────────── editing ─────────────
  /** Serialize edits: font loading is async, so two quick keystrokes must not interleave. */
  setLineText(lineId: string, text: string): Promise<SetTextResult> {
    const run = this.queue.then(() => this.doSetLineText(lineId, text));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async doSetLineText(lineId: string, text: string): Promise<SetTextResult> {
    const line = this.findLine(lineId);
    if (!line) return { ok: false, error: 'unknown line', revision: this.rev };
    if (!line.editable) return { ok: false, error: line.reason ?? 'this line cannot be edited', revision: this.rev };
    if (text === line.text) {
      if (this.edits.delete(lineId)) {
        this.rebuild();
        this.record(lineId);
      }
      return { ok: true, revision: this.rev, ...this.history() };
    }
    let plan = planLineEdit(line, text);
    let segments: Segment[] | undefined;
    if (!plan.ok && plan.reason === 'missing-glyphs') {
      // The anchor glyph's font cannot draw the new characters: find stand-ins, embed them, and switch fonts for the new text.
      const sp = await this.deps.fonts.plan({ baseFont: plan.anchor.font!.baseFont, flags: plan.anchor.font!.flags }, plan.mid);
      if (!sp.ok) return { ok: false, missing: sp.missing, revision: this.rev };
      segments = sp.segments;
      plan = planLineEdit(line, text, () => this.probeSegments(segments!));
    }
    if (!plan.ok)
      return { ok: false, error: plan.reason === 'unsupported' ? plan.detail : `cannot draw ${plan.missing.join('')}`, revision: this.rev };

    const previous = this.edits.get(lineId);
    this.edits.set(lineId, { text, segments });
    try {
      this.rebuild();
    } catch (e) {
      if (previous) this.edits.set(lineId, previous);
      else this.edits.delete(lineId);
      this.rebuild();
      return { ok: false, error: e instanceof Error ? e.message : String(e), revision: this.rev };
    }
    this.record(lineId);
    const substitutions: Substitution[] | undefined = segments?.map((s) => ({
      text: s.text,
      font: s.font.label,
      note: s.font.family.note,
    }));
    return { ok: true, ...(substitutions ? { substitutions } : {}), revision: this.rev, ...this.history() };
  }

  async resetLine(lineId: string): Promise<SetTextResult> {
    const run = this.queue.then(() => {
      if (this.edits.delete(lineId)) {
        this.rebuild();
        this.record(lineId);
      }
      return { ok: true, revision: this.rev, ...this.history() } as SetTextResult;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Feasibility check before any font is embedded: segments backed by the fonts' own glyph tables and advances. */
  private probeSegments(segments: Segment[]): SubstituteSegment[] {
    return segments.map((seg) => ({ font: probeFont(seg.font), text: seg.text }));
  }

  /** Runtime substitutes for planned segments: each font is embedded once (see `rebuild`) and registered as a page resource. */
  private runtimeSegments(
    segments: Segment[],
    embedded: Map<string, EmbeddedFont>,
    resources: ResourceEditor,
    resNames: Map<string, string>,
    page: PdfPage,
  ): SubstituteSegment[] {
    return segments.map((seg) => {
      const key = `${page.index}|${seg.font.id}`;
      const emb = embedded.get(seg.font.id)!;
      let name = resNames.get(key);
      if (!name) {
        name = resources.uniqueName(page);
        resources.addFont(page, name, emb.ref);
        resNames.set(key, name);
      }
      return { font: substituteOf(name, emb), text: seg.text };
    });
  }

  /** Re-plan every pending edit against the base and rebuild the patched bytes. */
  private rebuild(): void {
    this.rev++;
    this.lineGeo.clear();
    if (!this.edits.size) {
      this.curBytes = this.baseBytes;
      return;
    }
    const update = new IncrementalUpdate(this.base);
    const resources = new ResourceEditor(this.base);

    // one embedded font object per fallback font, shared by every edit and page that needs it
    const need = new Map<string, { font: LoadedFont; cps: Set<number> }>();
    for (const rec of this.edits.values())
      for (const seg of rec.segments ?? []) {
        let n = need.get(seg.font.id);
        if (!n) need.set(seg.font.id, (n = { font: seg.font, cps: new Set() }));
        for (const ch of seg.text) n.cps.add(ch.codePointAt(0)!);
      }
    const embedded = new Map<string, EmbeddedFont>();
    for (const [id, { font, cps }] of need) {
      const list = [...cps].sort((a, b) => a - b);
      const key = `${id}|${list.join(',')}`;
      let subset = this.subsetCache.get(key);
      if (!subset) {
        subset = this.deps.subsetter.subset(font.bytes, list, { variations: font.entry.variations });
        this.subsetCache.set(key, subset);
      }
      embedded.set(id, embedCidTrueType(update, font.sfnt, subset, list, font.label.replace(/\s+/g, '')));
    }

    const byUnit = new Map<ContentUnit, ByteEdit[]>();
    const shifts = new Map<ShowOp, Vec>();
    const replaced = new Set<ShowOp>();
    const resNames = new Map<string, string>();
    const pagesTouched = new Set<number>();
    for (const [lineId, rec] of this.edits) {
      const line = this.findLine(lineId);
      if (!line) continue;
      pagesTouched.add(line.page);
      const plan = planLineEdit(
        line,
        rec.text,
        rec.segments ? () => this.runtimeSegments(rec.segments!, embedded, resources, resNames, this.pages[line.page]) : undefined,
      );
      if (!plan.ok) throw new Error(plan.reason === 'unsupported' ? plan.detail : `cannot draw ${plan.missing.join('')}`);
      for (const [unit, edits] of plan.unitEdits) {
        let l = byUnit.get(unit);
        if (!l) byUnit.set(unit, (l = []));
        l.push(...edits);
      }
      for (const [op, v] of plan.shifts) shifts.set(op, v);
      for (const op of plan.replacedOps) replaced.add(op);
      this.lineGeo.set(lineId, plan.glyphs);
    }

    // explicit repositioning of the words that follow an edit (and pinning of the first word that must not move)
    const shiftsByUnit = new Map<ContentUnit, Map<ShowOp, Vec>>();
    for (const [op, v] of shifts) {
      let m = shiftsByUnit.get(op.unit);
      if (!m) shiftsByUnit.set(op.unit, (m = new Map()));
      m.set(op, v);
    }
    for (const [unit, m] of shiftsByUnit) {
      const pageOps = [...pagesTouched].flatMap((p) => this.model(p).ops);
      const { edits } = planShifts(unit, m, pageOps, replaced);
      let l = byUnit.get(unit);
      if (!l) byUnit.set(unit, (l = []));
      l.push(...edits);
    }
    for (const [unit, edits] of byUnit) commitUnitEdits(update, unit, edits);
    resources.apply(update);
    this.curBytes = update.build();
  }

  // ───────────── undo / redo ─────────────
  history(): HistoryState {
    return { canUndo: this.cursor > 0, canRedo: this.cursor < this.states.length - 1 };
  }

  private record(lineId: string | null): void {
    const snap = new Map(this.edits);
    const now = Date.now();
    const cur = this.states[this.cursor];
    if (this.cursor > 0 && this.cursor === this.states.length - 1 && lineId !== null && cur.lineId === lineId && now - cur.t < 900) {
      this.states[this.cursor] = { edits: snap, lineId, t: now };
      return;
    }
    this.states.length = this.cursor + 1;
    this.states.push({ edits: snap, lineId, t: now });
    this.cursor++;
  }

  private travel(delta: -1 | 1): Promise<SetTextResult & { lineId?: string | null }> {
    const run = this.queue.then(() => {
      const target = this.cursor + delta;
      if (target < 0 || target >= this.states.length) return { ok: false, revision: this.rev, ...this.history(), lineId: null };
      // the line affected is the one whose state we are leaving (undo) or entering (redo)
      const lineId = this.states[delta < 0 ? this.cursor : target].lineId;
      this.cursor = target;
      this.edits = new Map(this.states[target].edits);
      this.rebuild();
      return { ok: true, revision: this.rev, ...this.history(), lineId };
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
  undo() {
    return this.travel(-1);
  }
  redo() {
    return this.travel(1);
  }
}

function substituteOf(resName: string, emb: EmbeddedFont): SubstituteFont {
  return {
    resName,
    encode: (ch) => {
      const gid = emb.gids.get(ch.codePointAt(0)!);
      return gid === undefined ? null : Uint8Array.of(gid >> 8, gid & 255);
    },
    advance: (ch) => emb.widths.get(ch.codePointAt(0)!) ?? 0,
  };
}

/** Used only to check feasibility before fonts are embedded: can draw what the font has, with the font's own advances. */
function probeFont(font: LoadedFont): SubstituteFont {
  const inst = font.sfnt;
  const k = 1000 / inst.unitsPerEm;
  return {
    resName: 'LabProbe',
    encode: (ch) => {
      const gid = inst.glyphFor(ch.codePointAt(0)!);
      return gid ? Uint8Array.of(gid >> 8, gid & 255) : null;
    },
    advance: (ch) => inst.advance(inst.glyphFor(ch.codePointAt(0)!)) * k,
  };
}
