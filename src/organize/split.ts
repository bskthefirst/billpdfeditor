/**
 * Turns a split request ("these ranges", "every 5 pages", "one file per chapter") into the list of files to produce.
 * Pure functions: the engine only ever sees lists of page positions, so everything here is easy to test.
 */
import type { OutlineEntry } from '../engine/api';
import { formatPages, type RangeItem } from './ranges';

export type { OutlineEntry };

/** One output file: which pages (0-based positions in the list being split, in output order) and what to call it. */
export interface SplitPart {
  name: string;
  pages: number[];
  /** Short human description, e.g. "pages 1–3". */
  label: string;
}

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** A file name that is legal on Windows, macOS and Linux and still readable (Korean etc. is kept). */
export function safeFileName(raw: string, fallback = 'file'): string {
  let s = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[. ]+|[. ]+$/g, '');
  if (s.length > 80) s = s.slice(0, 80).trim();
  if (!s) s = fallback;
  if (RESERVED.test(s)) s = `_${s}`;
  return s;
}

/** Makes names unique within one download (a, a (2), a (3) …), case-insensitively like the file systems do. */
export function dedupeNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const stem = n.replace(/\.pdf$/i, '');
    const key = stem.toLowerCase();
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    return count === 1 ? n : `${stem} (${count}).pdf`;
  });
}

const pad = (n: number, width: number) => String(n).padStart(width, '0');
const span = (pages: number[]) => (pages.length === 1 ? `page ${pages[0] + 1}` : `pages ${formatPages(pages)}`);
const slug = (pages: number[]) => (pages.length === 1 ? `page-${pages[0] + 1}` : `pages-${formatPages(pages, '_')}`);

/** One file per item ("1-3, 7, 9-12" → three files), or everything in one file when `merge` is set. */
export function planRanges(items: RangeItem[], baseName: string, merge: boolean): SplitPart[] {
  const base = safeFileName(baseName, 'document');
  if (!items.length) return [];
  if (merge) {
    const pages = items.flatMap((i) => i.pages);
    return [{ name: `${base}-${slug(pages)}.pdf`, pages, label: span(pages) }];
  }
  const parts = items.map((i) => ({ name: `${base}-${slug(i.pages)}.pdf`, pages: i.pages, label: span(i.pages) }));
  const names = dedupeNames(parts.map((p) => p.name));
  return parts.map((p, i) => ({ ...p, name: names[i] }));
}

/** Consecutive chunks of `n` pages (the last one may be shorter). */
export function planEvery(pageCount: number, n: number, baseName: string): SplitPart[] {
  const base = safeFileName(baseName, 'document');
  const size = Math.max(1, Math.floor(n));
  const count = Math.ceil(pageCount / size);
  const width = String(count).length;
  const parts: SplitPart[] = [];
  for (let i = 0; i < count; i++) {
    const pages = Array.from({ length: Math.min(size, pageCount - i * size) }, (_, k) => i * size + k);
    parts.push({ name: `${base}-part-${pad(i + 1, width)}-${slug(pages)}.pdf`, pages, label: span(pages) });
  }
  return parts;
}

/**
 * One file per bookmark up to `level` (1 = top-level only): from the bookmark's page to just before the next one.
 * Pages in front of the first bookmark become their own "front matter" file so nothing is lost.
 */
export function planBookmarks(outline: OutlineEntry[], pageCount: number, level: number, baseName: string): SplitPart[] {
  const base = safeFileName(baseName, 'document');
  const starts: Array<{ page: number; title: string }> = [];
  for (const e of outline) {
    if (e.level > level || e.page < 0 || e.page >= pageCount) continue;
    starts.push({ page: e.page, title: e.title });
  }
  // outlines are normally in page order, but not always; a stable sort keeps document order for equal pages
  starts.sort((a, b) => a.page - b.page);
  const unique = starts.filter((s, i) => i === 0 || s.page !== starts[i - 1].page);
  if (!unique.length) return [];
  if (unique[0].page > 0) unique.unshift({ page: 0, title: 'Front matter' });
  const width = String(unique.length).length;
  const parts: SplitPart[] = unique.map((s, i) => {
    const end = (unique[i + 1]?.page ?? pageCount) - 1;
    const pages = Array.from({ length: end - s.page + 1 }, (_, k) => s.page + k);
    return { name: `${base}-${pad(i + 1, width)}-${safeFileName(s.title, 'untitled')}.pdf`, pages, label: `${s.title} · ${span(pages)}` };
  });
  const names = dedupeNames(parts.map((p) => p.name));
  return parts.map((p, i) => ({ ...p, name: names[i] }));
}

/** The selected pages (in the order they appear) as one file. */
export function planSelection(selected: number[], baseName: string): SplitPart[] {
  if (!selected.length) return [];
  const base = safeFileName(baseName, 'document');
  const pages = [...selected].sort((a, b) => a - b);
  return [{ name: `${base}-${slug(pages)}.pdf`, pages, label: span(pages) }];
}
