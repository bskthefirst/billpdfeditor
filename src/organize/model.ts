/**
 * The page list behind "Pages" mode: an ordered list of items, each one either a page of some PDF (a "source") with an
 * extra turn, or a blank page. Every operation here is a pure function that returns a new list (or the very same array
 * when nothing changed, so callers can tell a no-op from a real edit by reference). Selections are sets of item uids.
 */
import type { OutlineEntry, PageSpec } from '../engine/api';

/** One page of a source PDF, optionally turned further. */
export interface PageRef {
  uid: string;
  kind: 'page';
  /** Engine source id (see `EngineApi.openSource`). */
  src: number;
  /** 0-based page of that source. */
  page: number;
  /** Extra clockwise turn in degrees, a multiple of 90. It accumulates (450 = one turn more than 360), which lets the
   * preview animate in the direction of each click; use `normalizeRotation` where only the orientation matters. */
  rotate: number;
}

/** A new empty page; `width` and `height` are the displayed size in points. */
export interface BlankPage {
  uid: string;
  kind: 'blank';
  width: number;
  height: number;
}

export type PageItem = PageRef | BlankPage;

export interface PageSize {
  width: number;
  height: number;
}

export type Uids = ReadonlySet<string>;
export type UidGen = () => string;

/** Size (points, already rotated by the page's own /Rotate) of page `page` of source `src`, if known. */
export type SizeLookup = (src: number, page: number) => PageSize | undefined;

/** US Letter, used when there is no neighbouring page to copy a size from. */
export const DEFAULT_PAGE_SIZE: PageSize = { width: 612, height: 792 };

export function createUidGen(prefix = 'i'): UidGen {
  let n = 0;
  return () => `${prefix}${++n}`;
}

/** 0, 90, 180 or 270. */
export function normalizeRotation(degrees: number): number {
  const quarter = Math.round(degrees / 90);
  return (((quarter % 4) + 4) % 4) * 90;
}

const isSideways = (degrees: number) => Math.abs(Math.round(degrees / 90)) % 2 === 1;

/** Every page of a freshly opened source, in order. */
export function itemsFromSource(src: number, pageCount: number, gen: UidGen): PageItem[] {
  return Array.from({ length: pageCount }, (_, page) => ({ uid: gen(), kind: 'page' as const, src, page, rotate: 0 }));
}

/** True while the list is still exactly the base document: same pages, same order, nothing turned or added. */
export function isUnchanged(items: readonly PageItem[], base: { src: number; pageCount: number }): boolean {
  return (
    items.length === base.pageCount &&
    items.every((it, i) => it.kind === 'page' && it.src === base.src && it.page === i && normalizeRotation(it.rotate) === 0)
  );
}

/** Displayed size of an item in points, after its extra turn. */
export function sizeOf(item: PageItem, lookup: SizeLookup): PageSize {
  if (item.kind === 'blank') return { width: item.width, height: item.height };
  const base = lookup(item.src, item.page) ?? DEFAULT_PAGE_SIZE;
  return isSideways(item.rotate) ? { width: base.height, height: base.width } : { width: base.width, height: base.height };
}

export function indexOfUid(items: readonly PageItem[], uid: string | null | undefined): number {
  return uid == null ? -1 : items.findIndex((it) => it.uid === uid);
}

/** 0-based positions of the selected items, ascending. */
export function positionsOf(items: readonly PageItem[], selected: Uids): number[] {
  const out: number[] = [];
  items.forEach((it, i) => {
    if (selected.has(it.uid)) out.push(i);
  });
  return out;
}

/** The uids from `a` to `b` inclusive, in list order (either may come first). Falls back to just `b` if `a` is gone. */
export function selectRange(items: readonly PageItem[], a: string | null, b: string): string[] {
  const j = indexOfUid(items, b);
  if (j < 0) return [];
  const i = indexOfUid(items, a);
  if (i < 0) return [b];
  return items.slice(Math.min(i, j), Math.max(i, j) + 1).map((it) => it.uid);
}

/** Turns the selected items by `delta` degrees (a multiple of 90; positive = clockwise). Blank pages swap width and height. */
export function rotateItems(items: readonly PageItem[], selected: Uids, delta: number): PageItem[] {
  const quarters = Math.round(delta / 90);
  if (!quarters || !items.some((it) => selected.has(it.uid))) return items as PageItem[];
  return items.map((it): PageItem => {
    if (!selected.has(it.uid)) return it;
    if (it.kind === 'page') return { ...it, rotate: it.rotate + quarters * 90 };
    return Math.abs(quarters) % 2 === 1 ? { ...it, width: it.height, height: it.width } : it;
  });
}

export function deleteItems(items: readonly PageItem[], selected: Uids): PageItem[] {
  if (!items.some((it) => selected.has(it.uid))) return items as PageItem[];
  return items.filter((it) => !selected.has(it.uid));
}

/** The uid to focus after `removed` items vanish: the item that took the place of the first removed one, else the last. */
export function neighbourAfterRemoval(before: readonly PageItem[], removed: Uids): string | null {
  const first = before.findIndex((it) => removed.has(it.uid));
  if (first < 0) return null;
  const after = before.filter((it) => !removed.has(it.uid));
  return after[Math.min(first, after.length - 1)]?.uid ?? null;
}

/** Inserts copies of the selected items, in list order, right after the last selected one. `added` lists the copies' uids. */
export function duplicateItems(items: readonly PageItem[], selected: Uids, gen: UidGen): { items: PageItem[]; added: string[] } {
  let last = -1;
  items.forEach((it, i) => {
    if (selected.has(it.uid)) last = i;
  });
  if (last < 0) return { items: items as PageItem[], added: [] };
  const copies = items.filter((it) => selected.has(it.uid)).map((it): PageItem => ({ ...it, uid: gen() }));
  return { items: [...items.slice(0, last + 1), ...copies, ...items.slice(last + 1)], added: copies.map((c) => c.uid) };
}

/** Index to insert at so that new pages land right after the last selected item (or at the very end when nothing is selected). */
export function gapAfterSelection(items: readonly PageItem[], selected: Uids): number {
  let last = -1;
  items.forEach((it, i) => {
    if (selected.has(it.uid)) last = i;
  });
  return last < 0 ? items.length : last + 1;
}

export function insertAt(items: readonly PageItem[], index: number, added: readonly PageItem[]): PageItem[] {
  if (!added.length) return items as PageItem[];
  const at = Math.max(0, Math.min(items.length, index));
  return [...items.slice(0, at), ...added, ...items.slice(at)];
}

/**
 * A blank page right after the last selected item (or at the end), the size of the page it follows, or of the last page
 * when nothing is selected, or `fallback` when the list is empty.
 */
export function insertBlank(
  items: readonly PageItem[],
  selected: Uids,
  gen: UidGen,
  lookup: SizeLookup,
  fallback: PageSize = DEFAULT_PAGE_SIZE,
): { items: PageItem[]; added: string[] } {
  const at = gapAfterSelection(items, selected);
  const neighbour = items[at - 1];
  const size = neighbour ? sizeOf(neighbour, lookup) : fallback;
  const blank: BlankPage = { uid: gen(), kind: 'blank', width: size.width, height: size.height };
  return { items: insertAt(items, at, [blank]), added: [blank.uid] };
}

const sameOrder = (a: readonly PageItem[], b: readonly PageItem[]) => a.length === b.length && a.every((it, i) => it === b[i]);

/**
 * Moves the selected items, keeping their relative order, so that they sit together at gap `index` (0 = before the first
 * item, `items.length` = after the last), where the gap is counted in the list as it is now.
 */
export function moveToIndex(items: readonly PageItem[], selected: Uids, index: number): PageItem[] {
  const moving = items.filter((it) => selected.has(it.uid));
  if (!moving.length) return items as PageItem[];
  const gap = Math.max(0, Math.min(items.length, index));
  const rest = items.filter((it) => !selected.has(it.uid));
  const before = items.slice(0, gap).filter((it) => selected.has(it.uid)).length;
  const next = [...rest.slice(0, gap - before), ...moving, ...rest.slice(gap - before)];
  return sameOrder(items, next) ? (items as PageItem[]) : next;
}

/** Moves every selected item one place earlier (`delta` < 0) or later (`delta` > 0), `|delta|` times; items at the edge stay. */
export function moveBy(items: readonly PageItem[], selected: Uids, delta: number): PageItem[] {
  const steps = Math.abs(Math.trunc(delta));
  if (!steps || !items.some((it) => selected.has(it.uid))) return items as PageItem[];
  const out = [...items];
  for (let s = 0; s < steps; s++) {
    if (delta < 0) {
      for (let i = 1; i < out.length; i++) {
        if (selected.has(out[i].uid) && !selected.has(out[i - 1].uid)) [out[i - 1], out[i]] = [out[i], out[i - 1]];
      }
    } else {
      for (let i = out.length - 2; i >= 0; i--) {
        if (selected.has(out[i].uid) && !selected.has(out[i + 1].uid)) [out[i], out[i + 1]] = [out[i + 1], out[i]];
      }
    }
  }
  return sameOrder(items, out) ? (items as PageItem[]) : out;
}

/** What to hand to `EngineApi.buildPdf`. */
export function toSpecs(items: readonly PageItem[]): PageSpec[] {
  return items.map((it): PageSpec => {
    if (it.kind === 'blank') return { kind: 'blank', width: it.width, height: it.height };
    const rotate = normalizeRotation(it.rotate);
    return rotate ? { kind: 'page', src: it.src, page: it.page, rotate } : { kind: 'page', src: it.src, page: it.page };
  });
}

/**
 * Bookmarks of source `src` re-expressed as positions in the list: each entry points at the first item that shows its
 * page, and entries whose page is no longer in the list (or that point nowhere) are dropped.
 */
export function outlineByPosition(items: readonly PageItem[], outline: readonly OutlineEntry[], src: number): OutlineEntry[] {
  const firstAt = new Map<number, number>();
  items.forEach((it, i) => {
    if (it.kind === 'page' && it.src === src && !firstAt.has(it.page)) firstAt.set(it.page, i);
  });
  const out: OutlineEntry[] = [];
  for (const e of outline) {
    const pos = e.page >= 0 ? firstAt.get(e.page) : undefined;
    if (pos !== undefined) out.push({ title: e.title, page: pos, level: e.level });
  }
  return out;
}
