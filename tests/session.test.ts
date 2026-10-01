import { describe, expect, it, beforeEach } from 'vitest';
import { makeSession } from './helpers/node-session';
import { loadCore, readCorpus, diffBitmaps } from './helpers/node-core';
import type { EngineSession } from '../src/engine/session';

const render = (s: EngineSession, scale = 2) => {
  const r = s.render(0, scale);
  return { width: r.width, height: r.height, data: new Uint8Array(r.data) };
};

describe('EngineSession on a Chrome-printed PDF (Georgia/Arial/Korean)', () => {
  let s: EngineSession;
  let titleId: string;
  beforeEach(async () => {
    s = await makeSession();
    s.open(readCorpus('chrome_basic.pdf'));
    titleId = s.getLines(0).find((r) => r.text.startsWith('Quarterly'))!.id;
  });

  it('finds editable runs with the real font and size', () => {
    const title = s.getLines(0).find((r) => r.id === titleId)!;
    expect(title.text).toBe('Quarterly Report 2026');
    expect(title.font.name).toBe('Georgia-Bold');
    expect(title.size).toBeCloseTo(24, 3);
    expect(title.editable).toBe(true);
  });

  it('edits with the original font when every glyph exists in the subset (no new fonts)', async () => {
    const before = s.save().length;
    const r = await s.setLineText(titleId, 'Quarterly Report 2020');
    expect(r.ok).toBe(true);
    expect(r.substitutions).toBeUndefined();
    expect(s.getLines(0).find((x) => x.id === titleId)!.text).toBe('Quarterly Report 2020');
    // an in-place string rewrite only grows the file by the recompressed content stream
    expect(s.save().length - before).toBeLessThan(20_000);
  });

  it('resetting a run restores the original bytes exactly', async () => {
    const original = s.save();
    await s.setLineText(titleId, 'Quarterly Report 2020');
    await s.resetLine(titleId);
    expect(s.save()).toEqual(original);
  });

  it('typing the original text back is a no-op', async () => {
    const original = s.save();
    await s.setLineText(titleId, 'Quarterly Report 2020');
    await s.setLineText(titleId, 'Quarterly Report 2026');
    expect(s.save()).toEqual(original);
  });

  it('draws characters missing from the subset with an embedded stand-in font', async () => {
    const r = await s.setLineText(titleId, 'Annual Report 2026');
    expect(r.ok).toBe(true);
    expect(r.substitutions?.map((x) => x.text).join('')).toBe('Annual');
    expect(r.substitutions?.[0].font).toMatch(/Gelasio/); // Georgia → metric-compatible Gelasio
    const run = s.getLines(0).find((x) => x.id === titleId)!;
    expect(run.text).toBe('Annual Report 2026');
    expect(run.glyphs).toHaveLength('Annual Report 2026'.length);
    // the saved file must contain real, searchable text
    const core = await loadCore();
    const doc = core.open(s.save());
    const page = core.loadPage(doc, 0);
    const tp = core.loadTextPage(page);
    const text = core
      .textChars(tp)
      .map((c) => String.fromCodePoint(c.unicode))
      .join('');
    core.closeTextPage(tp);
    core.closePage(page);
    core.close(doc);
    expect(text).toContain('Annual Report 2026');
    expect(text).not.toContain('Quarterly');
  });

  it('keeps everything outside the edited line pixel-identical', async () => {
    const before = render(s);
    await s.setLineText(titleId, 'Annual Report 2026');
    const after = render(s);
    // below the title band nothing may change (title ends ~y=150 at 2x for this document)
    let outside = 0;
    for (let y = 200; y < before.height; y++)
      for (let x = 0; x < before.width; x++) {
        const i = (y * before.width + x) * 4;
        if (before.data[i] !== after.data[i] || before.data[i + 1] !== after.data[i + 1] || before.data[i + 2] !== after.data[i + 2])
          outside++;
      }
    expect(outside).toBe(0);
    expect(diffBitmaps(before, after).diffPixels).toBeGreaterThan(0);
  });

  it('supports Korean through a Hangul stand-in font', async () => {
    const r = await s.setLineText(titleId, '분기 Report 2026');
    expect(r.ok).toBe(true);
    expect(r.substitutions?.some((x) => /Nanum/.test(x.font))).toBe(true);
    expect(s.getLines(0).find((x) => x.id === titleId)!.text).toBe('분기 Report 2026');
  });

  it('refuses characters that no bundled font can draw', async () => {
    const r = await s.setLineText(titleId, 'Quarterly 🚀 Report 2026');
    expect(r.ok).toBe(false);
    expect(r.missing).toContain('🚀');
  });

  it('serializes rapid edits: the last write wins', async () => {
    const results = await Promise.all(['Annual', 'Annual R', 'Annual Re', 'Annual Report 2026'].map((t) => s.setLineText(titleId, t)));
    expect(results.every((x) => x.ok)).toBe(true);
    expect(s.getLines(0).find((x) => x.id === titleId)!.text).toBe('Annual Report 2026');
  });

  it('overlay geometry follows the edit: glyphs after the edit move by the width change', async () => {
    const before = s.getLines(0).find((x) => x.id === titleId)!;
    await s.setLineText(titleId, 'Annual Report 2026');
    const after = s.getLines(0).find((x) => x.id === titleId)!;
    const lastBefore = before.glyphs[before.glyphs.length - 1];
    const lastAfter = after.glyphs[after.glyphs.length - 1];
    expect(lastAfter[0]).toBeLessThan(lastBefore[0]); // "Annual" is narrower than "Quarterly"
    expect(after.glyphs[0][0]).toBeCloseTo(before.glyphs[0][0], 3);
  });

  it('selects characters, words and lines with PDFium reading order (for copy)', () => {
    const run = s.getLines(0).find((r) => r.id === titleId)!;
    const g = run.glyphs[0];
    const idx = s.hitChar(0, g[0] + 3, g[1] + run.size * 0.3);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(s.select(0, idx, idx + 4).text).toBe('Quart');
    const word = s.expandSelection(0, idx, 'word');
    expect(word.text).toBe('Quarterly');
    expect(word.rects.length).toBeGreaterThan(0);
    expect(s.expandSelection(0, idx, 'line').text).toContain('Quarterly Report 2026');
    // a point far from any text hits nothing
    expect(s.hitChar(0, 5, 5)).toBeLessThan(0);
  });
});

describe('undo / redo', () => {
  let s: EngineSession;
  let id: string;
  beforeEach(async () => {
    s = await makeSession();
    s.open(readCorpus('chrome_basic.pdf'));
    id = s.getLines(0).find((r) => r.text.startsWith('Quarterly'))!.id;
  });
  const textOf = () => s.getLines(0).find((r) => r.id === id)!.text;

  it('undoes and redoes edits, restoring exact bytes', async () => {
    const original = s.save();
    await s.setLineText(id, 'Quarterly Report 2020');
    const edited = s.save();
    expect(s.history()).toEqual({ canUndo: true, canRedo: false });
    const u = await s.undo();
    expect(u.ok).toBe(true);
    expect(u.lineId).toBe(id);
    expect(textOf()).toBe('Quarterly Report 2026');
    expect(s.save()).toEqual(original);
    expect(s.history()).toEqual({ canUndo: false, canRedo: true });
    await s.redo();
    expect(textOf()).toBe('Quarterly Report 2020');
    expect(s.save()).toEqual(edited);
  });

  it('coalesces a typing burst in one run into a single undo step', async () => {
    await s.setLineText(id, 'Quarterly Report 202');
    await s.setLineText(id, 'Quarterly Report 20');
    await s.setLineText(id, 'Quarterly Report 2');
    expect(textOf()).toBe('Quarterly Report 2');
    await s.undo();
    expect(textOf()).toBe('Quarterly Report 2026');
    expect(s.history().canUndo).toBe(false);
  });

  it('a new edit after undo drops the redo branch', async () => {
    await s.setLineText(id, 'Quarterly Report 2020');
    await s.undo();
    await s.setLineText(id, 'Quarterly Report 2000');
    expect(s.history().canRedo).toBe(false);
  });

  it('undoes font-fallback edits too', async () => {
    await s.setLineText(id, 'Annual Report 2026');
    expect((await s.undo()).ok).toBe(true);
    expect(textOf()).toBe('Quarterly Report 2026');
  });
});

describe('line editing and reflow', () => {
  let s: EngineSession;
  beforeEach(async () => {
    s = await makeSession();
    s.open(readCorpus('chrome_basic.pdf'));
  });

  /** PDFium's own view of where characters ended up (independent of our geometry). */
  const chars = async (bytes = s.save()) => {
    const core = await loadCore();
    const doc = core.open(bytes);
    const page = core.loadPage(doc, 0);
    const tp = core.loadTextPage(page);
    const all = core.textChars(tp);
    core.closeTextPage(tp);
    core.closePage(page);
    core.close(doc);
    const text = all.map((c) => String.fromCodePoint(c.unicode)).join('');
    return { all, text };
  };
  const originOf = (c: Awaited<ReturnType<typeof chars>>, needle: string, offset = 0) => {
    const i = c.text.indexOf(needle);
    expect(i, `"${needle}" in PDFium text`).toBeGreaterThanOrEqual(0);
    return c.all[i + offset];
  };
  const find = (starts: string) => s.getLines(0).find((l) => l.text.startsWith(starts))!;
  const flat = (t: string) => t.replace(/\s+/g, '');

  it('replaces a word inside a justified line; the rest of the line follows by exactly the width change', async () => {
    const before = await chars();
    const line = find('The quick brown fox');
    const k = line.text.indexOf('brown');
    const oldNext = originOf(before, 'vexingly').x;
    const r = await s.setLineText(line.id, line.text.replace('quick', 'swift'));
    expect(r.ok).toBe(true);
    const after = await chars();
    const updated = s.getLines(0).find((l) => l.id === line.id)!;
    const analytic = updated.glyphs[k][0] - line.glyphs[k][0]; // our overlay geometry
    const truth = originOf(after, 'brown fox').x - originOf(before, 'brown fox').x; // PDFium's
    expect(truth).toBeLessThan(0); // "swift" is narrower than "quick"
    expect(analytic).toBeCloseTo(truth, 1);
    expect(originOf(after, 'vexingly').x).toBeCloseTo(oldNext, 2); // next line untouched
    const how = line.text.indexOf('How');
    expect(originOf(after, 'jugs. How', 6).x - originOf(before, 'jugs. How', 6).x).toBeCloseTo(truth, 1);
    expect(updated.glyphs[how][0] - line.glyphs[how][0]).toBeCloseTo(truth, 1);
  });

  it('replaces text across a word gap', async () => {
    const line = find('The quick brown fox');
    const r = await s.setLineText(line.id, line.text.replace('quick brown', 'slow red'));
    expect(r.ok).toBe(true);
    const after = await chars();
    expect(flat(after.text)).toContain(flat('The slow red fox jumps'));
  });

  it('deletes a word together with its gap', async () => {
    const before = await chars();
    const line = find('The quick brown fox');
    const r = await s.setLineText(line.id, line.text.replace('quick ', ''));
    expect(r.ok).toBe(true);
    const after = await chars();
    expect(flat(after.text)).toContain(flat('The brown fox jumps'));
    // "brown" now starts where "quick" started
    expect(originOf(after, 'brown fox').x).toBeCloseTo(originOf(before, 'quick brown').x, 1);
  });

  it('appends text at the end of a line and extends it', async () => {
    const line = find('Prepared by the Finance Team.');
    const r = await s.setLineText(line.id, line.text + ' Team');
    expect(r.ok).toBe(true);
    expect(
      s
        .getLines(0)
        .find((l) => l.id === line.id)!
        .text.endsWith('inside one Team'),
    ).toBe(true);
    expect(flat((await chars()).text)).toContain(flat('inside one Team'));
  });

  it('keeps unrelated table cells in place', async () => {
    const before = await chars();
    const north = s.getLines(0).find((r) => r.text === 'North')!;
    const q1 = originOf(before, '1,204').x;
    expect((await s.setLineText(north.id, 'Nort')).ok).toBe(true);
    expect(originOf(await chars(), '1,204').x).toBeCloseTo(q1, 2);
  });

  it('closes a word gap that is encoded as a TJ adjustment, pulling the rest of the line in', async () => {
    const t = await makeSession();
    t.open(readCorpus('raw_tj_gaps.pdf'));
    const before = await chars(t.save());
    const line = t.getLines(0).find((l) => l.text.startsWith('The quick'))!;
    expect((await t.setLineText(line.id, 'The quickbrown fox jumps over')).ok).toBe(true);
    const after = await chars(t.save());
    expect(flat(after.text)).toContain('Thequickbrownfoxjumpsover');
    // "brown" moved left by the gap that was closed (0.25 em of 14 pt)
    expect(originOf(before, 'brown').x - originOf(after, 'brown').x).toBeCloseTo(3.5, 1);
    expect(originOf(before, 'over').x - originOf(after, 'over').x).toBeCloseTo(3.5, 1);
  });
});

describe('protected and damaged files', () => {
  it('opens an owner-restricted PDF through PDFium, edits an unprotected copy, and says so', async () => {
    const s = await makeSession();
    const info = s.open(readCorpus('rl_encrypted_owner.pdf'));
    expect(info.needsPassword).toBeFalsy();
    expect(info.decrypted).toBe(true);
    expect(info.restricted).toBe(true);
    const line = s.getLines(0).find((l) => l.text.startsWith('Protected quarterly'))!;
    expect(line.editable).toBe(true);
    expect((await s.setLineText(line.id, 'Protected quarterly summary: revenue grew rapidly')).ok).toBe(true);
    // the saved file opens with no password at all
    const core = await loadCore();
    const doc = core.open(s.save());
    expect(core.isEncrypted(doc)).toBe(false);
    core.close(doc);
    const again = await makeSession();
    again.open(s.save());
    expect(again.getLines(0).some((l) => l.text.includes('revenue grew rapidly'))).toBe(true);
  });

  it('asks for a password when the file needs one, and rejects a wrong one', async () => {
    const s = await makeSession();
    expect(s.open(readCorpus('rl_encrypted_user.pdf')).needsPassword).toBe(true);
    expect(s.open(readCorpus('rl_encrypted_user.pdf'), 'wrong').needsPassword).toBe(true);
    const ok = s.open(readCorpus('rl_encrypted_user.pdf'), 'secret');
    expect(ok.needsPassword).toBeFalsy();
    expect(ok.decrypted).toBe(true);
    expect(s.getLines(0).some((l) => l.text.includes('Protected quarterly'))).toBe(true);
  });
});
