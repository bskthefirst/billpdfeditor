import { describe, expect, it } from 'vitest';
import { readCorpus } from './helpers/node-core';
import { PdfFile } from '../src/pdf/file';
import { TextExtractor, type ShowOp } from '../src/pdf/text';
import { buildLines } from '../src/engine/lines';

function linesOf(name: string, pageIndex = 0) {
  const f = PdfFile.load(readCorpus(name));
  const ops = new TextExtractor(f).extractPage(f.pages()[pageIndex]);
  const ord = new Map<ShowOp, string>();
  ops.forEach((o, i) => ord.set(o, `${o.unit.kind === 'page' ? 'p' : 'f' + o.unit.num}.${i}`));
  return buildLines(ops, (o) => ord.get(o)!, pageIndex);
}

describe('line model', () => {
  it('merges per-glyph operators into whole lines (Chrome output)', () => {
    const lines = linesOf('chrome_basic.pdf');
    const texts = lines.map((l) => l.text);
    expect(texts).toContain('Quarterly Report 2026');
    expect(
      texts.some((t) => t.startsWith('Prepared by the Finance Team. This document mixes bold, italic and colored runs inside one')),
    ).toBe(true);
    expect(
      texts.some((t) => t.startsWith('The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. How')),
    ).toBe(true);
    // far fewer lines than the ~600 single-glyph operators
    expect(lines.length).toBeLessThan(60);
  });

  it('keeps table cells separate', () => {
    const texts = linesOf('chrome_basic.pdf').map((l) => l.text);
    for (const cell of ['Region', 'Q1', 'Q2', 'Total', 'North', '1,204', '1,390', '2,594']) expect(texts).toContain(cell);
  });

  it('treats real space glyphs and kerning gaps correctly (no doubled spaces, no split words)', () => {
    for (const l of linesOf('chrome_basic.pdf')) {
      expect(l.text).not.toMatch(/ {2,}/);
      expect(l.text.length).toBe(l.items.length);
    }
  });

  it('virtual spaces appear where a PDF leaves a word gap without a space glyph', () => {
    // pdfTeX-style output encodes word gaps as TJ adjustments
    const lines = linesOf('raw_tj_gaps.pdf');
    const first = lines.find((l) => l.text.startsWith('The'))!;
    expect(first.text).toBe('The quick brown fox jumps over');
    expect(first.items.filter((i) => i.kind === 'gap')).toHaveLength(5);
    // a gap inside one TJ knows which adjustment element it came from, so it can be closed by editing that number
    expect(first.items.filter((i) => i.kind === 'gap').every((g) => g.adjElem !== undefined)).toBe(true);
    // kerning adjustments are not word gaps
    expect(lines.find((l) => l.text.startsWith('Kerning'))!.text).toBe('Kerning pairs like AV and To stay');
    // tracking and separate Tj operators stay one word; a far-away Tj starts another line
    expect(lines.map((l) => l.text)).toContain('Tracked heading');
    expect(lines.map((l) => l.text)).toContain('Abc');
    const texts = lines.map((l) => l.text);
    expect(texts).toContain('Total:');
    expect(texts).toContain('1,234.00');
  });

  it('does not mistake letter-spacing (tracking) for word spaces', () => {
    const texts = linesOf('chrome_basic.pdf').map((l) => l.text);
    expect(texts).toContain('LETTER-SPACED HEADING TEXT');
    expect(texts).toContain('invoice_no = 2026-00417; total = 12,345.67 USD');
  });

  it('orders lines top to bottom', () => {
    const lines = linesOf('chrome_basic.pdf');
    const ys = lines.map((l) => l.items[0].y);
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeLessThanOrEqual(ys[i - 1] + 1);
  });
});
