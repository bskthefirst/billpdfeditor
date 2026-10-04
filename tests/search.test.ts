import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeSession } from './helpers/node-session';
import { readCorpus } from './helpers/node-core';
import type { EngineSession } from '../src/engine/session';

const guide = () => new Uint8Array(readFileSync('public/samples/study-guide.pdf'));

describe('EngineSession.search', () => {
  let s: EngineSession;
  beforeEach(async () => {
    s = await makeSession();
    s.open(guide());
  });

  it('finds every occurrence with rectangles and context', () => {
    const { hits, next } = s.search('Splitting', {}, 0, 100);
    expect(next).toBeNull();
    expect(hits.length).toBeGreaterThan(5); // the chapter 4 heading plus every footer on its six pages
    const first = hits[0];
    expect(first.text).toBe('Splitting');
    expect(first.rects.length).toBeGreaterThan(0);
    const [x0, y0, x1, y1] = first.rects[0];
    expect(x1).toBeGreaterThan(x0);
    expect(y1).toBeGreaterThan(y0);
    expect(first.before + first.text + first.after).toContain('Splitting');
    // the hit's indices select exactly the matched text (what the highlight and "select" use)
    expect(s.select(first.page, first.start, first.start + first.count - 1).text).toBe('Splitting');
  });

  it('is case-insensitive unless asked, and can require whole words', () => {
    const loose = s.search('CHAPTER 3', {}, 0, 100).hits.length;
    expect(loose).toBeGreaterThan(0);
    expect(s.search('CHAPTER 3', { matchCase: true }, 0, 100).hits).toHaveLength(0);
    // headings say "Chapter 3", the footer links say "chapter 3"
    const exact = s.search('Chapter 3', { matchCase: true }, 0, 100).hits.length;
    expect(exact).toBeGreaterThan(0);
    expect(exact).toBeLessThan(loose);
    expect(s.search('page', { wholeWord: true }, 0, 100).hits.length).toBeGreaterThan(0);
    expect(s.search('pag', { wholeWord: true }, 0, 100).hits).toHaveLength(0);
  });

  it('searches in slices so long documents can stream their results', () => {
    const all = s.search('Page', {}, 0, 100).hits;
    const first = s.search('Page', {}, 0, 10);
    expect(first.next).toBe(10);
    expect(first.hits.every((h) => h.page < 10)).toBe(true);
    const rest = s.search('Page', {}, first.next!, 100);
    expect(rest.next).toBeNull();
    expect(first.hits.length + rest.hits.length).toBe(all.length);
  });

  it('empty queries and misses return nothing', () => {
    expect(s.search('').hits).toEqual([]);
    expect(s.search('zzzz-not-in-this-document', {}, 0, 100).hits).toEqual([]);
  });

  it('sees text edits', async () => {
    s.open(readCorpus('chrome_basic.pdf'));
    const id = s.getLines(0).find((l) => l.text.startsWith('Quarterly'))!.id;
    expect(s.search('2020').hits).toHaveLength(0);
    await s.setLineText(id, 'Quarterly Report 2020');
    expect(s.search('2020').hits).toHaveLength(1);
  });
});
