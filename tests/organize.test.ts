import { describe, expect, it } from 'vitest';
import { formatPages, parseRanges } from '../src/organize/ranges';
import { dedupeNames, planBookmarks, planEvery, planRanges, planSelection, safeFileName } from '../src/organize/split';

const pages = (text: string, n = 20) => parseRanges(text, n).items.map((i) => i.pages.map((p) => p + 1));

describe('parseRanges', () => {
  it('reads the usual syntax', () => {
    expect(pages('1-3, 7, 9-12')).toEqual([[1, 2, 3], [7], [9, 10, 11, 12]]);
    expect(pages('1-3;7 9-10')).toEqual([[1, 2, 3], [7], [9, 10]]);
  });

  it('supports open ends, last, odd, even and all', () => {
    expect(pages('18-')).toEqual([[18, 19, 20]]);
    expect(pages('-3')).toEqual([[1, 2, 3]]);
    expect(pages('19-last')).toEqual([[19, 20]]);
    expect(pages('last')).toEqual([[20]]);
    expect(pages('odd', 6)).toEqual([[1, 3, 5]]);
    expect(pages('even', 6)).toEqual([[2, 4, 6]]);
    expect(pages('all', 3)).toEqual([[1, 2, 3]]);
  });

  it('accepts full-width digits, en dashes and spaces around dashes (Korean/Japanese IMEs)', () => {
    expect(pages('１－３，７')).toEqual([[1, 2, 3], [7]]);
    expect(pages('1 – 3 , 7')).toEqual([[1, 2, 3], [7]]);
    expect(pages('5〜6')).toEqual([[5, 6]]);
  });

  it('keeps the order written and allows repeats', () => {
    expect(pages('5, 1-2, 5')).toEqual([[5], [1, 2], [5]]);
  });

  it('reports mistakes instead of fixing them silently', () => {
    const r = parseRanges('3-1, 25, 0, abc, 1-2-3, 4', 20);
    expect(r.items.map((i) => i.text)).toEqual(['4']);
    expect(r.errors.map((e) => e.text)).toEqual(['3-1', '25', '0', 'abc', '1-2-3']);
    expect(r.errors[0].message).toMatch(/backwards/);
    expect(r.errors[1].message).toMatch(/20 pages/);
  });

  it('handles empty input and one-page documents', () => {
    expect(parseRanges('', 5)).toEqual({ items: [], errors: [] });
    expect(pages('1-', 1)).toEqual([[1]]);
    expect(parseRanges('2', 1).errors[0].message).toMatch(/1 page\./);
  });
});

describe('formatPages', () => {
  it('collapses runs', () => {
    expect(formatPages([0, 1, 2, 6, 8, 9, 10])).toBe('1-3,7,9-11');
    expect(formatPages([4, 3])).toBe('5,4');
    expect(formatPages([0, 1, 4], '_')).toBe('1-2_5');
  });
});

describe('safeFileName / dedupeNames', () => {
  it('removes characters that break file systems and keeps Korean', () => {
    expect(safeFileName('Ch 1: "Intro"/Basics?')).toBe('Ch 1 Intro Basics');
    expect(safeFileName('제1장 서론')).toBe('제1장 서론');
    expect(safeFileName('CON')).toBe('_CON');
    expect(safeFileName('  ... ', 'x')).toBe('x');
    expect(safeFileName('a'.repeat(200)).length).toBe(80);
  });
  it('numbers duplicates case-insensitively', () => {
    expect(dedupeNames(['a.pdf', 'A.pdf', 'b.pdf', 'a.pdf'])).toEqual(['a.pdf', 'A (2).pdf', 'b.pdf', 'a (3).pdf']);
  });
});

describe('split plans', () => {
  it('ranges → one file each, or one merged file', () => {
    const items = parseRanges('1-3, 7, 9-12', 20).items;
    const each = planRanges(items, 'report', false);
    expect(each.map((p) => p.name)).toEqual(['report-pages-1-3.pdf', 'report-page-7.pdf', 'report-pages-9-12.pdf']);
    expect(each[0].pages).toEqual([0, 1, 2]);
    const merged = planRanges(items, 'report', true);
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe('report-pages-1-3_7_9-12.pdf');
    expect(merged[0].pages).toHaveLength(8);
  });

  it('every N pages', () => {
    const parts = planEvery(11, 5, 'book');
    expect(parts.map((p) => p.pages.length)).toEqual([5, 5, 1]);
    expect(parts[0].name).toBe('book-part-1-pages-1-5.pdf');
    expect(planEvery(100, 10, 'x')[0].name).toBe('x-part-01-pages-1-10.pdf');
    expect(planEvery(3, 10, 'x')).toHaveLength(1);
  });

  it('bookmarks → chapters, with front matter and duplicate pages collapsed', () => {
    const outline = [
      { title: 'Chapter 1', page: 2, level: 1 },
      { title: '1.1 Basics', page: 3, level: 2 },
      { title: 'Chapter 2', page: 6, level: 1 },
      { title: 'Chapter 2 (again)', page: 6, level: 1 },
      { title: 'Broken', page: -1, level: 1 },
    ];
    const top = planBookmarks(outline, 10, 1, 'book');
    expect(top.map((p) => p.pages)).toEqual([
      [0, 1],
      [2, 3, 4, 5],
      [6, 7, 8, 9],
    ]);
    expect(top[0].name).toBe('book-1-Front matter.pdf');
    expect(top[2].name).toBe('book-3-Chapter 2.pdf');
    const deep = planBookmarks(outline, 10, 2, 'book');
    expect(deep.map((p) => p.pages[0])).toEqual([0, 2, 3, 6]);
    expect(planBookmarks([], 10, 1, 'book')).toEqual([]);
  });

  it('selection → one file in page order', () => {
    const [p] = planSelection([4, 1, 2], 'doc');
    expect(p.pages).toEqual([1, 2, 4]);
    expect(p.name).toBe('doc-pages-2-3_5.pdf');
    expect(planSelection([], 'doc')).toEqual([]);
  });
});
