import { describe, expect, it } from 'vitest';
import {
  createUidGen,
  deleteItems,
  duplicateItems,
  gapAfterSelection,
  insertAt,
  insertBlank,
  isUnchanged,
  itemsFromSource,
  moveBy,
  moveToIndex,
  neighbourAfterRemoval,
  normalizeRotation,
  outlineByPosition,
  positionsOf,
  rotateItems,
  selectRange,
  sizeOf,
  toSpecs,
  type PageItem,
  type SizeLookup,
} from '../src/organize/model';

/** A 5-page source (id 1) whose pages are 600x800, except page 2 which is landscape 800x600. */
const SRC = 1;
const lookup: SizeLookup = (src, page) =>
  src === SRC ? (page === 2 ? { width: 800, height: 600 } : { width: 600, height: 800 }) : undefined;
const ids = createUidGen('t');
const fresh = (n = 5, src = SRC) => itemsFromSource(src, n, ids);
const sel = (...uids: string[]) => new Set(uids);
const pages = (items: readonly PageItem[]) => items.map((it) => (it.kind === 'page' ? it.page + 1 : 'blank'));
const uidsOf = (items: readonly PageItem[], ...positions: number[]) => positions.map((p) => items[p].uid);

describe('basics', () => {
  it('builds one item per page with unique uids', () => {
    const items = fresh(5);
    expect(items).toHaveLength(5);
    expect(new Set(items.map((i) => i.uid)).size).toBe(5);
    expect(items.every((i) => i.kind === 'page' && i.src === SRC && i.rotate === 0)).toBe(true);
    expect(pages(items)).toEqual([1, 2, 3, 4, 5]);
  });

  it('normalises rotation', () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(-360)).toBe(0);
    expect(normalizeRotation(180)).toBe(180);
  });

  it('knows when nothing changed', () => {
    const base = { src: SRC, pageCount: 5 };
    const items = fresh(5);
    expect(isUnchanged(items, base)).toBe(true);
    expect(isUnchanged(items.slice(1), base)).toBe(false);
    expect(isUnchanged([items[1], items[0], ...items.slice(2)], base)).toBe(false);
    // a full turn is no change; a quarter turn is
    const rotated = rotateItems(items, sel(items[0].uid), 360);
    expect(isUnchanged(rotated, base)).toBe(true);
    expect(isUnchanged(rotateItems(items, sel(items[0].uid), 90), base)).toBe(false);
    // pages of another source or blanks count as changes even when the length matches
    expect(isUnchanged(fresh(5, 2), base)).toBe(false);
    expect(isUnchanged(insertBlank(items.slice(1), sel(), createUidGen('b'), lookup).items, base)).toBe(false);
    expect(isUnchanged([], { src: SRC, pageCount: 0 })).toBe(true);
  });

  it('measures items after their turn', () => {
    const items = fresh(5);
    expect(sizeOf(items[0], lookup)).toEqual({ width: 600, height: 800 });
    expect(sizeOf(items[2], lookup)).toEqual({ width: 800, height: 600 });
    const turned = rotateItems(items, sel(items[0].uid, items[2].uid), 90);
    expect(sizeOf(turned[0], lookup)).toEqual({ width: 800, height: 600 });
    expect(sizeOf(turned[2], lookup)).toEqual({ width: 600, height: 800 });
    const half = rotateItems(items, sel(items[0].uid), 180);
    expect(sizeOf(half[0], lookup)).toEqual({ width: 600, height: 800 });
    const back = rotateItems(items, sel(items[0].uid), -90);
    expect(sizeOf(back[0], lookup)).toEqual({ width: 800, height: 600 });
    // unknown sources fall back to US Letter instead of throwing
    expect(sizeOf({ uid: 'x', kind: 'page', src: 99, page: 0, rotate: 0 }, lookup)).toEqual({ width: 612, height: 792 });
    expect(sizeOf({ uid: 'b', kind: 'blank', width: 10, height: 20 }, lookup)).toEqual({ width: 10, height: 20 });
  });

  it('finds positions and ranges', () => {
    const items = fresh(6);
    expect(positionsOf(items, sel(items[4].uid, items[1].uid))).toEqual([1, 4]);
    expect(selectRange(items, items[1].uid, items[3].uid)).toEqual(uidsOf(items, 1, 2, 3));
    expect(selectRange(items, items[3].uid, items[1].uid)).toEqual(uidsOf(items, 1, 2, 3));
    expect(selectRange(items, items[2].uid, items[2].uid)).toEqual([items[2].uid]);
    expect(selectRange(items, null, items[2].uid)).toEqual([items[2].uid]);
    expect(selectRange(items, 'gone', items[2].uid)).toEqual([items[2].uid]);
    expect(selectRange(items, items[0].uid, 'gone')).toEqual([]);
  });
});

describe('rotate', () => {
  it('turns only the selected pages and leaves the input alone', () => {
    const items = fresh(3);
    const out = rotateItems(items, sel(items[1].uid), 90);
    expect(out.map((i) => (i.kind === 'page' ? i.rotate : -1))).toEqual([0, 90, 0]);
    expect(items.every((i) => i.kind === 'page' && i.rotate === 0)).toBe(true);
    expect(out[0]).toBe(items[0]);
    expect(out[2]).toBe(items[2]);
  });

  it('accumulates turns in either direction', () => {
    let items = fresh(1);
    const all = sel(items[0].uid);
    for (let i = 0; i < 5; i++) items = rotateItems(items, all, 90);
    expect((items[0] as { rotate: number }).rotate).toBe(450);
    items = rotateItems(items, all, -90);
    expect((items[0] as { rotate: number }).rotate).toBe(360);
    expect(toSpecs(items)).toEqual([{ kind: 'page', src: SRC, page: 0 }]);
  });

  it('is a no-op for nothing selected or a zero turn', () => {
    const items = fresh(3);
    expect(rotateItems(items, sel(), 90)).toBe(items);
    expect(rotateItems(items, sel('nope'), 90)).toBe(items);
    expect(rotateItems(items, sel(items[0].uid), 0)).toBe(items);
  });

  it('swaps width and height of blank pages for quarter turns only', () => {
    const items = insertBlank(fresh(1), sel(), createUidGen('b'), lookup).items;
    const blank = items[1];
    const quarter = rotateItems(items, sel(blank.uid), 90)[1];
    expect(quarter).toMatchObject({ kind: 'blank', width: 800, height: 600 });
    const half = rotateItems(items, sel(blank.uid), 180);
    expect(half[1]).toMatchObject({ kind: 'blank', width: 600, height: 800 });
  });
});

describe('delete and focus', () => {
  it('removes the selected items', () => {
    const items = fresh(5);
    const out = deleteItems(items, sel(items[1].uid, items[3].uid));
    expect(pages(out)).toEqual([1, 3, 5]);
    expect(pages(items)).toEqual([1, 2, 3, 4, 5]);
    expect(deleteItems(items, sel())).toBe(items);
    expect(deleteItems(items, sel('x'))).toBe(items);
    expect(deleteItems(items, new Set(items.map((i) => i.uid)))).toEqual([]);
  });

  it('picks a neighbour to focus afterwards', () => {
    const items = fresh(5);
    expect(neighbourAfterRemoval(items, sel(items[1].uid))).toBe(items[2].uid);
    expect(neighbourAfterRemoval(items, sel(items[4].uid))).toBe(items[3].uid);
    expect(neighbourAfterRemoval(items, sel(items[3].uid, items[4].uid))).toBe(items[2].uid);
    expect(neighbourAfterRemoval(items, new Set(items.map((i) => i.uid)))).toBeNull();
    expect(neighbourAfterRemoval(items, sel('x'))).toBeNull();
  });
});

describe('duplicate and insert', () => {
  it('copies the selection after its last page, keeping order, with fresh uids', () => {
    const items = fresh(5);
    const gen = createUidGen('c');
    const { items: out, added } = duplicateItems(items, sel(items[3].uid, items[1].uid), gen);
    expect(pages(out)).toEqual([1, 2, 3, 4, 2, 4, 5]);
    expect(added).toEqual([out[4].uid, out[5].uid]);
    expect(new Set(out.map((i) => i.uid)).size).toBe(7);
    expect(pages(items)).toEqual([1, 2, 3, 4, 5]);
    // copies keep their turn
    const turned = rotateItems(items, sel(items[0].uid), 90);
    const dup = duplicateItems(turned, sel(turned[0].uid), gen).items;
    expect(dup[1]).toMatchObject({ kind: 'page', page: 0, rotate: 90 });
  });

  it('does nothing without a selection', () => {
    const items = fresh(3);
    const r = duplicateItems(items, sel(), createUidGen());
    expect(r.items).toBe(items);
    expect(r.added).toEqual([]);
  });

  it('inserts new pages at a gap, clamped to the list', () => {
    const items = fresh(3);
    const extra = fresh(2, 7);
    expect(insertAt(items, 1, extra).map((i) => (i.kind === 'page' ? `${i.src}.${i.page}` : '-'))).toEqual([
      '1.0',
      '7.0',
      '7.1',
      '1.1',
      '1.2',
    ]);
    expect(insertAt(items, 99, extra)).toHaveLength(5);
    expect(insertAt(items, -4, extra)[0]).toBe(extra[0]);
    expect(insertAt(items, 1, [])).toBe(items);
  });

  it('finds the gap after the selection, or the end', () => {
    const items = fresh(5);
    expect(gapAfterSelection(items, sel())).toBe(5);
    expect(gapAfterSelection(items, sel(items[1].uid, items[3].uid))).toBe(4);
    expect(gapAfterSelection([], sel())).toBe(0);
  });

  it('inserts a blank page the size of the neighbour it follows', () => {
    const items = fresh(5);
    const gen = createUidGen('b');
    // after the landscape page 3: landscape blank
    const a = insertBlank(items, sel(items[2].uid), gen, lookup);
    expect(a.items).toHaveLength(6);
    expect(a.items[3]).toMatchObject({ kind: 'blank', width: 800, height: 600, uid: a.added[0] });
    // nothing selected: at the end, sized like the last page
    const b = insertBlank(items, sel(), gen, lookup);
    expect(b.items[5]).toMatchObject({ kind: 'blank', width: 600, height: 800 });
    // follows the turned size of a rotated page
    const turned = rotateItems(items, sel(items[0].uid), 90);
    expect(insertBlank(turned, sel(turned[0].uid), gen, lookup).items[1]).toMatchObject({ width: 800, height: 600 });
    // an empty list uses the fallback (Letter by default)
    expect(insertBlank([], sel(), gen, lookup).items[0]).toMatchObject({ width: 612, height: 792 });
    expect(insertBlank([], sel(), gen, lookup, { width: 595, height: 842 }).items[0]).toMatchObject({ width: 595, height: 842 });
  });
});

describe('moving', () => {
  it('moves a block to a gap, counted in the current list', () => {
    const items = fresh(6);
    const two = sel(items[1].uid, items[2].uid);
    expect(pages(moveToIndex(items, two, 5))).toEqual([1, 4, 5, 2, 3, 6]);
    expect(pages(moveToIndex(items, two, 6))).toEqual([1, 4, 5, 6, 2, 3]);
    expect(pages(moveToIndex(items, two, 0))).toEqual([2, 3, 1, 4, 5, 6]);
    // dropping next to itself changes nothing and returns the same array
    expect(moveToIndex(items, two, 1)).toBe(items);
    expect(moveToIndex(items, two, 2)).toBe(items);
    expect(moveToIndex(items, two, 3)).toBe(items);
  });

  it('gathers a scattered selection at the gap and keeps its order', () => {
    const items = fresh(7);
    const scattered = sel(items[5].uid, items[1].uid, items[3].uid);
    expect(pages(moveToIndex(items, scattered, 0))).toEqual([2, 4, 6, 1, 3, 5, 7]);
    expect(pages(moveToIndex(items, scattered, 7))).toEqual([1, 3, 5, 7, 2, 4, 6]);
    // gap 4 sits between page 4 and page 5: one selected page before it (page 2) and page 4 itself, so 1 3 | 2 4 6 | 5 7
    expect(pages(moveToIndex(items, scattered, 4))).toEqual([1, 3, 2, 4, 6, 5, 7]);
  });

  it('clamps out-of-range gaps and ignores empty selections', () => {
    const items = fresh(4);
    const first = sel(items[0].uid);
    expect(pages(moveToIndex(items, first, 100))).toEqual([2, 3, 4, 1]);
    expect(pages(moveToIndex(items, sel(items[3].uid), -5))).toEqual([4, 1, 2, 3]);
    expect(moveToIndex(items, sel(), 2)).toBe(items);
  });

  it('nudges the selection one place at a time', () => {
    const items = fresh(5);
    expect(pages(moveBy(items, sel(items[2].uid), -1))).toEqual([1, 3, 2, 4, 5]);
    expect(pages(moveBy(items, sel(items[2].uid), 1))).toEqual([1, 2, 4, 3, 5]);
    expect(pages(moveBy(items, sel(items[1].uid, items[2].uid), 1))).toEqual([1, 4, 2, 3, 5]);
    expect(pages(moveBy(items, sel(items[1].uid, items[2].uid), -1))).toEqual([2, 3, 1, 4, 5]);
    // scattered selections each move
    expect(pages(moveBy(items, sel(items[1].uid, items[3].uid), -1))).toEqual([2, 1, 4, 3, 5]);
    // several steps
    expect(pages(moveBy(items, sel(items[0].uid), 3))).toEqual([2, 3, 4, 1, 5]);
  });

  it('stops at the edges instead of wrapping', () => {
    const items = fresh(4);
    expect(moveBy(items, sel(items[0].uid), -1)).toBe(items);
    expect(moveBy(items, sel(items[3].uid), 1)).toBe(items);
    // a block touching the edge stays put while the rest moves
    expect(pages(moveBy(items, sel(items[0].uid, items[2].uid), -1))).toEqual([1, 3, 2, 4]);
    expect(moveBy(items, sel(), 1)).toBe(items);
    expect(moveBy(items, sel(items[1].uid), 0)).toBe(items);
  });
});

describe('specs and bookmarks', () => {
  it('turns the list into build specs', () => {
    const items = fresh(3);
    let list = rotateItems(items, sel(items[1].uid), 90);
    list = rotateItems(list, sel(items[2].uid), -90);
    list = insertBlank(list, sel(items[0].uid), createUidGen('b'), lookup).items;
    list = [...list, ...fresh(1, 9)];
    expect(toSpecs(list)).toEqual([
      { kind: 'page', src: 1, page: 0 },
      { kind: 'blank', width: 600, height: 800 },
      { kind: 'page', src: 1, page: 1, rotate: 90 },
      { kind: 'page', src: 1, page: 2, rotate: 270 },
      { kind: 'page', src: 9, page: 0 },
    ]);
  });

  it('maps bookmarks to positions in the arranged list', () => {
    const outline = [
      { title: 'One', page: 0, level: 1 },
      { title: 'One-a', page: 1, level: 2 },
      { title: 'Two', page: 3, level: 1 },
      { title: 'Nowhere', page: -1, level: 1 },
      { title: 'Beyond', page: 40, level: 1 },
    ];
    const items = fresh(5);
    expect(outlineByPosition(items, outline, SRC).map((e) => [e.title, e.page, e.level])).toEqual([
      ['One', 0, 1],
      ['One-a', 1, 2],
      ['Two', 3, 1],
    ]);
    // delete page 2 (index 1) and move page 4 to the front: bookmarks follow their pages, deleted ones disappear
    const rearranged = moveToIndex(deleteItems(items, sel(items[1].uid)), sel(items[3].uid), 0);
    expect(pages(rearranged)).toEqual([4, 1, 3, 5]);
    expect(outlineByPosition(rearranged, outline, SRC).map((e) => [e.title, e.page])).toEqual([
      ['One', 1],
      ['Two', 0],
    ]);
    // a duplicated page: the bookmark points at its first appearance
    const doubled = duplicateItems(items, sel(items[0].uid), createUidGen('d')).items;
    expect(outlineByPosition(doubled, outline, SRC)[0]).toMatchObject({ title: 'One', page: 0 });
    // pages of other sources and blanks never match
    const other = [...fresh(5, 2), ...insertBlank([], sel(), createUidGen('z'), lookup).items];
    expect(outlineByPosition(other, outline, SRC)).toEqual([]);
  });
});
