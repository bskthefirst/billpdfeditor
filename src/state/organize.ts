/**
 * State and actions of "Pages" mode. The mode works on a *snapshot* of the open document (a page source in the engine)
 * plus any PDFs added to it; nothing touches the editing session until Apply builds the arranged pages into a new file.
 * Everything that registers engine sources lives in actions (event handlers), never in effects, so React StrictMode's
 * double effects cannot leak or double-close a source; `session` guards every await against the mode having ended.
 */
import { create } from 'zustand';
import type { SourceInfo } from '../engine/api';
import { engine } from '../engine/instance';
import {
  createUidGen,
  deleteItems,
  duplicateItems,
  gapAfterSelection,
  indexOfUid,
  insertAt,
  insertBlank,
  isUnchanged,
  itemsFromSource,
  moveBy,
  moveToIndex,
  neighbourAfterRemoval,
  rotateItems,
  selectRange,
  toSpecs,
  type PageItem,
  type PageSize,
  type Uids,
} from '../organize/model';
import { thumbs } from '../ui/thumbs';
import { useApp } from './store';
import { openWithPassword } from './unlock';

const TEXT = {
  needSelection: 'Select one or more pages first: click a page, or press ⌘/Ctrl+A for all of them.',
  rotated: (n: number, dir: string) => `Turned ${pages(n)} ${dir}.`,
  deleted: (n: number, left: number) => `Deleted ${pages(n)} — ${left} left. Undo brings them back.`,
  duplicated: (n: number) => `Duplicated ${pages(n)}. The copies are selected.`,
  blank: 'Inserted a blank page.',
  moved: (n: number, where: string) => `Moved ${pages(n)} ${where}.`,
  onlyPdf: 'Only PDF files can be added here.',
  adding: (name: string) => `Adding “${name}”…`,
  addedNothing: 'No pages were added.',
  wrongPassword: (name: string) => `“${name}”: that password did not open the PDF.`,
  cancelledPassword: (name: string) => `“${name}” was skipped (it needs a password).`,
  enterFailed: (why: string) => `Could not open the page view: ${why}`,
  ready: (n: number) => `${pages(n)}. Click to select, drag to reorder, then Apply to put the new order into the document.`,
  applying: 'Applying the page changes…',
  applied: (now: number, was: number) =>
    `Applied: the document now has ${pages(now)} (was ${was}). Earlier text edits are now part of the file, so ⌘Z starts over from here; “Undo page changes” goes back.`,
  applyFailed: (why: string) => `Could not apply the page changes: ${why}`,
  discarded: 'Discarded the page changes.',
};

const pages = (n: number) => `${n} page${n === 1 ? '' : 's'}`;
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const THUMB_MIN = 100;
export const THUMB_MAX = 260;
const THUMB_KEY = 'sticker-pdf-lab.thumb';
const HISTORY_LIMIT = 100;
/** Colours handed to PDFs in turn (the badge palette in styles.css). */
export const SOURCE_COLORS = 5;

export interface SourceMeta {
  id: number;
  name: string;
  /** Index into the badge palette. */
  color: number;
  /** Displayed size of every page in points (already rotated by the page's own /Rotate). */
  pages: SourceInfo['pages'];
}

interface Snapshot {
  items: PageItem[];
  selected: Uids;
  anchor: string | null;
  focus: string | null;
}

/** A question "apply, discard or keep editing?" waiting for the user; `resume` is what they wanted to do next. */
export interface GuardRequest {
  resume: () => void | Promise<void>;
}

export type Phase = 'off' | 'loading' | 'ready';

interface OrganizeState {
  phase: Phase;
  /** The snapshot of the open document; its bookmarks and page count define "unchanged". */
  baseSrc: number;
  sources: Record<number, SourceMeta>;
  items: PageItem[];
  selected: Uids;
  /** Where Shift-click / Shift+arrow ranges start. */
  anchor: string | null;
  /** The card that holds keyboard focus (roving tabindex). */
  focus: string | null;
  past: Snapshot[];
  future: Snapshot[];
  /** Thumbnail width in CSS pixels. */
  thumb: number;
  busy: null | 'adding' | 'applying';
  guard: GuardRequest | null;
}

function loadThumbSize(): number {
  try {
    const n = Number(localStorage.getItem(THUMB_KEY));
    if (Number.isFinite(n) && n >= THUMB_MIN && n <= THUMB_MAX) return n;
  } catch {
    /* storage can be unavailable (private windows); the default is fine */
  }
  return 160;
}

const idle = (): Omit<OrganizeState, 'thumb'> => ({
  phase: 'off',
  baseSrc: 0,
  sources: {},
  items: [],
  selected: new Set(),
  anchor: null,
  focus: null,
  past: [],
  future: [],
  busy: null,
  guard: null,
});

export const useOrganize = create<OrganizeState>(() => ({ ...idle(), thumb: loadThumbSize() }));

const newUid = createUidGen('p');
const get = () => useOrganize.getState();
const set = useOrganize.setState;
const say = (text: string, kind: 'info' | 'ok' | 'warn' | 'error' = 'info') => useApp.getState().setStatus(text, kind);

/** Bumped whenever a Pages session starts or ends; every await in an action compares it to know the mode is still the same. */
let session = 0;

export const sizeLookup =
  (s: OrganizeState) =>
  (src: number, page: number): PageSize | undefined =>
    s.sources[src]?.pages[page];

/** True when the arranged list differs from the document it started as. */
export function hasChanges(s: OrganizeState): boolean {
  if (s.phase !== 'ready') return false;
  return !isUnchanged(s.items, { src: s.baseSrc, pageCount: s.sources[s.baseSrc]?.pages.length ?? 0 });
}

export function canApply(s: OrganizeState): boolean {
  return s.phase === 'ready' && !s.busy && s.items.length > 0 && hasChanges(s);
}

// ───────────────────────────── entering and leaving ─────────────────────────────

export async function enterPages(): Promise<void> {
  const app = useApp.getState();
  if (!app.doc || app.view === 'pages' || get().phase !== 'off') return;
  const token = ++session;
  set({ ...idle(), phase: 'loading' });
  app.setView('pages');
  try {
    const info = await engine.api.snapshotSource(app.fileName || 'document.pdf');
    if (info.needsPassword || !info.id) throw new Error('the document could not be read');
    if (token !== session) {
      void engine.api.closeSource(info.id).catch(() => {});
      return;
    }
    const items = itemsFromSource(info.id, info.pages.length, newUid);
    set({
      phase: 'ready',
      baseSrc: info.id,
      sources: { [info.id]: { id: info.id, name: info.name, color: 0, pages: info.pages } },
      items,
      focus: items[0]?.uid ?? null,
    });
    say(TEXT.ready(items.length));
  } catch (e) {
    if (token !== session) return;
    session++;
    set({ ...idle() });
    useApp.getState().setView('edit');
    say(TEXT.enterFailed(errorText(e)), 'error');
  }
}

/** Ends the mode without applying anything: frees the engine sources and every thumbnail. Safe to call twice. */
export function endSession(): void {
  session++;
  const ids = Object.keys(get().sources).map(Number);
  for (const id of ids) void engine.api.closeSource(id).catch(() => {});
  thumbs.clear();
  set({ ...idle() });
}

export function discardPages(): void {
  const had = hasChanges(get());
  endSession();
  useApp.getState().setView('edit');
  if (had) say(TEXT.discarded);
}

/** Runs `then` now, or after the user has decided what happens to unapplied page changes. */
export function guardUnapplied(then: () => void | Promise<void>): void {
  if (!hasChanges(get())) {
    void then();
    return;
  }
  set({ guard: { resume: then } });
}

export async function resolveGuard(choice: 'apply' | 'discard' | 'keep'): Promise<void> {
  const guard = get().guard;
  if (!guard) return;
  if (choice === 'keep') {
    set({ guard: null });
    return;
  }
  if (choice === 'discard') {
    set({ guard: null });
    discardPages();
    await guard.resume();
    return;
  }
  const ok = await applyPages();
  set({ guard: null });
  if (ok) await guard.resume();
}

/** Back to the editor, asking first when there are page changes that were not applied. */
export function leavePages(): void {
  if (get().busy) return;
  guardUnapplied(() => {
    endSession();
    useApp.getState().setView('edit');
  });
}

// ───────────────────────────── apply ─────────────────────────────

export async function applyPages(): Promise<boolean> {
  const s = get();
  if (!canApply(s)) return false;
  const token = session;
  set({ busy: 'applying' });
  say(TEXT.applying);
  try {
    const app = useApp.getState();
    const was = s.sources[s.baseSrc]?.pages.length ?? 0;
    // the document exactly as it is now (text edits included), kept for "Undo page changes"
    const before = await engine.api.save();
    const bytes = await engine.api.buildPdf(toSpecs(s.items), { bookmarks: true });
    if (token !== session) return false;
    const info = await engine.api.open(bytes);
    if (info.needsPassword) throw new Error('the rebuilt file could not be opened');
    const wasDirty = app.dirty;
    app.setDoc(app.fileName, info, { dirty: true });
    app.setPreApply({ bytes: before, dirty: wasDirty });
    endSession();
    app.setView('edit');
    say(TEXT.applied(info.pages.length, was), 'ok');
    return true;
  } catch (e) {
    say(TEXT.applyFailed(errorText(e)), 'error');
    return false;
  } finally {
    if (token === session) set({ busy: null });
  }
}

// ───────────────────────────── history ─────────────────────────────

const snapshot = (s: OrganizeState): Snapshot => ({ items: s.items, selected: s.selected, anchor: s.anchor, focus: s.focus });

/** Applies a change to the list and remembers the state before it for undo. */
function commit(
  next: { items: PageItem[]; selected?: Uids; anchor?: string | null; focus?: string | null },
  extra: Partial<OrganizeState> = {},
): void {
  set((s) => ({
    ...extra,
    past: [...s.past.slice(-(HISTORY_LIMIT - 1)), snapshot(s)],
    future: [],
    items: next.items,
    selected: next.selected ?? s.selected,
    anchor: next.anchor === undefined ? s.anchor : next.anchor,
    focus: next.focus === undefined ? s.focus : next.focus,
  }));
}

function restore(from: Snapshot): Partial<OrganizeState> {
  const alive = new Set(from.items.map((i) => i.uid));
  const keep = (uid: string | null) => (uid && alive.has(uid) ? uid : null);
  return {
    items: from.items,
    selected: new Set([...from.selected].filter((u) => alive.has(u))),
    anchor: keep(from.anchor),
    focus: keep(from.focus) ?? from.items[0]?.uid ?? null,
  };
}

export function undoPages(): void {
  const s = get();
  if (s.phase !== 'ready' || s.busy || !s.past.length) return;
  const prev = s.past[s.past.length - 1];
  set({ past: s.past.slice(0, -1), future: [snapshot(s), ...s.future], ...restore(prev) });
  say('Undid the last page change.', 'ok');
}

export function redoPages(): void {
  const s = get();
  if (s.phase !== 'ready' || s.busy || !s.future.length) return;
  const [next, ...rest] = s.future;
  set({ past: [...s.past, snapshot(s)], future: rest, ...restore(next) });
  say('Redid the page change.', 'ok');
}

// ───────────────────────────── selection ─────────────────────────────

export function selectOnly(uid: string): void {
  set({ selected: new Set([uid]), anchor: uid, focus: uid });
}

export function toggleSelect(uid: string): void {
  const s = get();
  const next = new Set(s.selected);
  if (!next.delete(uid)) next.add(uid);
  set({ selected: next, anchor: uid, focus: uid });
}

/** Selects from the anchor to `uid`; with `additive` the range is added to what is already selected. */
export function selectThrough(uid: string, additive = false): void {
  const s = get();
  const anchor = s.anchor && indexOfUid(s.items, s.anchor) >= 0 ? s.anchor : (s.focus ?? uid);
  const range = selectRange(s.items, anchor, uid);
  set({ selected: new Set(additive ? [...s.selected, ...range] : range), anchor, focus: uid });
}

export function selectAll(): void {
  const s = get();
  set({ selected: new Set(s.items.map((i) => i.uid)), anchor: s.items[0]?.uid ?? null });
}

export function clearSelection(): void {
  if (get().selected.size) set({ selected: new Set(), anchor: null });
}

export function setFocus(uid: string): void {
  if (get().focus !== uid) set({ focus: uid });
}

// ───────────────────────────── page operations ─────────────────────────────

const ready = (s: OrganizeState) => s.phase === 'ready' && !s.busy;

export function rotateSelected(delta: number): void {
  const s = get();
  if (!ready(s)) return;
  const next = rotateItems(s.items, s.selected, delta);
  if (next === s.items) return say(TEXT.needSelection, 'warn');
  commit({ items: next });
  say(TEXT.rotated(s.selected.size, delta > 0 ? 'right' : 'left'));
}

export function deleteSelected(): void {
  const s = get();
  if (!ready(s)) return;
  const next = deleteItems(s.items, s.selected);
  if (next === s.items) return say(TEXT.needSelection, 'warn');
  commit({ items: next, selected: new Set(), anchor: null, focus: neighbourAfterRemoval(s.items, s.selected) });
  say(TEXT.deleted(s.items.length - next.length, next.length), next.length ? 'info' : 'warn');
}

export function duplicateSelected(): void {
  const s = get();
  if (!ready(s)) return;
  const r = duplicateItems(s.items, s.selected, newUid);
  if (r.items === s.items) return say(TEXT.needSelection, 'warn');
  commit({ items: r.items, selected: new Set(r.added), anchor: r.added[0], focus: r.added[0] });
  say(TEXT.duplicated(r.added.length));
}

export function insertBlankPage(): void {
  const s = get();
  if (!ready(s)) return;
  const r = insertBlank(s.items, s.selected, newUid, sizeLookup(s), s.sources[s.baseSrc]?.pages[0]);
  commit({ items: r.items, selected: new Set(r.added), anchor: r.added[0], focus: r.added[0] });
  say(TEXT.blank);
}

export function moveSelectedBy(delta: number): void {
  const s = get();
  if (!ready(s)) return;
  const next = moveBy(s.items, s.selected, delta);
  if (next === s.items) return say(s.selected.size ? 'Already at the edge.' : TEXT.needSelection, 'warn');
  commit({ items: next });
  say(TEXT.moved(s.selected.size, delta < 0 ? 'earlier' : 'later'));
}

/** Drop of the selected pages into gap `index` of the list (0 = in front of the first page). */
export function moveSelectedToGap(index: number): void {
  const s = get();
  if (!ready(s)) return;
  const next = moveToIndex(s.items, s.selected, index);
  if (next === s.items) return;
  commit({ items: next });
  say(TEXT.moved(s.selected.size, 'to the new position'));
}

// ───────────────────────────── adding PDFs ─────────────────────────────

export const isPdfFile = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

/**
 * Adds every page of the given PDFs. They land in front of `beforeUid` when given (a drop position), otherwise right after
 * the selection, otherwise at the end. The whole batch is one undo step and the new pages end up selected.
 */
export async function addPdfFiles(files: File[], beforeUid?: string | null): Promise<void> {
  if (!ready(get())) return;
  const pdfs = files.filter(isPdfFile);
  if (!pdfs.length) return say(TEXT.onlyPdf, 'warn');
  const token = session;
  set({ busy: 'adding' });
  const added: PageItem[] = [];
  const found: SourceMeta[] = [];
  const notes: string[] = [];
  if (pdfs.length < files.length) notes.push(TEXT.onlyPdf);
  try {
    for (const file of pdfs) {
      say(TEXT.adding(file.name));
      try {
        const res = await openWithPassword(await file.arrayBuffer(), file.name, (b, pw) => engine.api.openSource(b, file.name, pw));
        if (token !== session) {
          // the mode ended while this file was being read: hand the source straight back
          if (res.status === 'ok') void engine.api.closeSource(res.info.id).catch(() => {});
          for (const m of found) void engine.api.closeSource(m.id).catch(() => {});
          return;
        }
        if (res.status === 'cancelled') notes.push(TEXT.cancelledPassword(file.name));
        else if (res.status === 'wrong-password') notes.push(TEXT.wrongPassword(file.name));
        else {
          const info = res.info;
          found.push({
            id: info.id,
            name: file.name,
            color: (Object.keys(get().sources).length + found.length) % SOURCE_COLORS,
            pages: info.pages,
          });
          added.push(...itemsFromSource(info.id, info.pages.length, newUid));
        }
      } catch (e) {
        notes.push(`“${file.name}”: ${errorText(e)}`);
      }
    }
    if (token !== session) return;
    if (!added.length) return say([TEXT.addedNothing, ...notes].join(' '), 'warn');
    const s = get();
    const dropAt = indexOfUid(s.items, beforeUid);
    const at = beforeUid === null ? s.items.length : dropAt >= 0 ? dropAt : gapAfterSelection(s.items, s.selected);
    const sources = { ...s.sources };
    for (const m of found) sources[m.id] = m;
    commit(
      { items: insertAt(s.items, at, added), selected: new Set(added.map((i) => i.uid)), anchor: added[0].uid, focus: added[0].uid },
      { sources },
    );
    say(
      [`Added ${pages(added.length)} from ${found.length} PDF${found.length === 1 ? '' : 's'}; they are selected.`, ...notes].join(' '),
      notes.length ? 'warn' : 'ok',
    );
  } finally {
    if (token === session) set({ busy: null });
  }
}

// ───────────────────────────── view settings ─────────────────────────────

export function setThumbSize(px: number): void {
  const thumb = Math.round(Math.min(THUMB_MAX, Math.max(THUMB_MIN, px)));
  set({ thumb });
  try {
    localStorage.setItem(THUMB_KEY, String(thumb));
  } catch {
    /* not persisted, still applied */
  }
}
