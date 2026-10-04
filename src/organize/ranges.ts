/**
 * Page-range expressions as people type them: "1-3, 7, 9-12", "5-" (to the end), "-3" (from the start),
 * "2-last", "odd", "even", "all". Text is 1-based; results are 0-based page indices.
 *
 * Each comma/space separated item becomes one entry, so a splitter can make one file per item. Mistakes are reported
 * per item instead of being "fixed" silently (the old app clamped and swapped, which hid typos).
 */

export interface RangeItem {
  /** The item as written, trimmed. */
  text: string;
  /** 0-based page indices in the order written. */
  pages: number[];
}

export interface RangeError {
  text: string;
  message: string;
}

export interface ParsedRanges {
  items: RangeItem[];
  errors: RangeError[];
}

/** Unicode look-alikes (full-width digits and commas from Korean/Japanese IMEs, en dashes, wave dashes) → ASCII. */
function normalize(input: string): string {
  return input
    .normalize('NFKC')
    .replace(/[‐-―−∼〜~]/g, '-')
    .replace(/[、;，、]/g, ',')
    .replace(/\s*-\s*/g, '-');
}

const range = (from: number, to: number): number[] => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);

function parseItem(text: string, pageCount: number): number[] | string {
  const t = text.toLowerCase();
  if (t === 'all' || t === '*') return range(0, pageCount - 1);
  if (t === 'odd') return range(0, pageCount - 1).filter((i) => i % 2 === 0);
  if (t === 'even') return range(0, pageCount - 1).filter((i) => i % 2 === 1);

  const num = (s: string): number | string => {
    if (s === 'last' || s === 'end' || s === '$') return pageCount;
    if (!/^\d+$/.test(s)) return `Couldn’t read “${s}”. Use page numbers like 1-3, 7, 9-12.`;
    const n = Number(s);
    if (n < 1) return 'Pages start at 1.';
    if (n > pageCount) return `Page ${n} doesn’t exist — this PDF has ${pageCount} page${pageCount === 1 ? '' : 's'}.`;
    return n;
  };

  const dash = t.indexOf('-');
  if (dash < 0) {
    const n = num(t);
    return typeof n === 'string' ? n : [n - 1];
  }
  const [a, b] = [t.slice(0, dash), t.slice(dash + 1)];
  if (b.includes('-')) return `Couldn’t read “${text}”. Use a range like 3-5.`;
  const from = a === '' ? 1 : num(a);
  const to = b === '' ? pageCount : num(b);
  if (typeof from === 'string') return from;
  if (typeof to === 'string') return to;
  if (from > to) return `“${text}” runs backwards — write ${to}-${from}.`;
  return range(from - 1, to - 1);
}

export function parseRanges(input: string, pageCount: number): ParsedRanges {
  const items: RangeItem[] = [];
  const errors: RangeError[] = [];
  const parts = normalize(input)
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const text of parts) {
    const r = parseItem(text, pageCount);
    if (typeof r === 'string') errors.push({ text, message: r });
    else if (r.length) items.push({ text, pages: r });
  }
  return { items, errors };
}

/** "1-3,7,9-12" for a list of 0-based pages (consecutive ascending runs are collapsed; order is kept). */
export function formatPages(pages: number[], sep = ','): string {
  const runs: string[] = [];
  for (let i = 0; i < pages.length;) {
    let j = i;
    while (j + 1 < pages.length && pages[j + 1] === pages[j] + 1) j++;
    runs.push(j > i ? `${pages[i] + 1}-${pages[j] + 1}` : `${pages[i] + 1}`);
    i = j + 1;
  }
  return runs.join(sep);
}
