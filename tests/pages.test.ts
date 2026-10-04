import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, readCorpus, diffBitmaps } from './helpers/node-core';
import { makeSession } from './helpers/node-session';
import { PageTools } from '../src/engine/pages';
import type { PdfiumCore } from '../src/engine/core';

let core: PdfiumCore;
let tools: PageTools;
beforeAll(async () => {
  core = await loadCore();
  tools = new PageTools(core);
});

/** Renders page `i` of a source at 1× as raw pixels. */
const shot = (id: number, i: number) => {
  const r = tools.render(id, i, 1);
  return { width: r.width, height: r.height, data: new Uint8Array(r.data) };
};
const reopen = (bytes: Uint8Array, name = 'out.pdf') => tools.open(bytes, name);
const pageText = (bytes: Uint8Array, i: number): string => {
  const doc = core.open(bytes);
  const page = core.loadPage(doc, i);
  const tp = core.loadTextPage(page);
  const text = core.textRange(tp, 0, core.countChars(tp));
  core.closeTextPage(tp);
  core.closePage(page);
  core.close(doc);
  return text;
};

describe('PageTools', () => {
  it('opens a source and describes its pages', () => {
    const src = tools.open(readCorpus('rl_multipage.pdf'), 'multi.pdf');
    expect(src.id).toBeGreaterThan(0);
    expect(src.pages).toHaveLength(30);
    expect(src.pages[0]).toEqual({ width: 612, height: 792, rotate: 0 });
    expect(src.decrypted).toBe(false);
  });

  it('copies pages exactly: reordered, repeated, pixel-identical to the originals', () => {
    const src = tools.open(readCorpus('rl_multipage.pdf'), 'multi.pdf');
    const bytes = tools.build([4, 0, 0, 29].map((page) => ({ kind: 'page' as const, src: src.id, page })));
    const out = reopen(bytes);
    expect(out.pages).toHaveLength(4);
    [4, 0, 0, 29].forEach((page, i) => {
      expect(diffBitmaps(shot(src.id, page), shot(out.id, i)).diffPixels).toBe(0);
    });
    // far smaller than the 30-page source: only what these pages reference is copied
    expect(bytes.length).toBeLessThan(readCorpus('rl_multipage.pdf').length / 2);
    expect(pageText(bytes, 0)).toBe(pageText(readCorpus('rl_multipage.pdf'), 4));
  });

  it('merges pages from several files in the order given', () => {
    const a = tools.open(readCorpus('rl_multipage.pdf'), 'a.pdf');
    const b = tools.open(readCorpus('chrome_basic.pdf'), 'b.pdf');
    const bytes = tools.build([
      { kind: 'page', src: a.id, page: 1 },
      { kind: 'page', src: b.id, page: 0 },
      { kind: 'page', src: a.id, page: 2 },
    ]);
    const out = reopen(bytes);
    expect(out.pages).toHaveLength(3);
    expect(diffBitmaps(shot(a.id, 1), shot(out.id, 0)).diffPixels).toBe(0);
    expect(diffBitmaps(shot(b.id, 0), shot(out.id, 1)).diffPixels).toBe(0);
    expect(diffBitmaps(shot(a.id, 2), shot(out.id, 2)).diffPixels).toBe(0);
  });

  it('rotates on top of the page’s own rotation and inserts blank pages', () => {
    const src = tools.open(readCorpus('rl_multipage.pdf'), 'multi.pdf');
    const first = tools.build([
      { kind: 'page', src: src.id, page: 0, rotate: 90 },
      { kind: 'blank', width: 300, height: 200 },
    ]);
    const o1 = reopen(first);
    expect(o1.pages[0]).toEqual({ width: 792, height: 612, rotate: 90 });
    expect(o1.pages[1]).toEqual({ width: 300, height: 200, rotate: 0 });
    // rotating the rotated copy by 270° brings it back to the original orientation and pixels
    const second = tools.build([{ kind: 'page', src: o1.id, page: 0, rotate: 270 }]);
    const o2 = reopen(second);
    expect(o2.pages[0]).toEqual({ width: 612, height: 792, rotate: 0 });
    expect(diffBitmaps(shot(src.id, 0), shot(o2.id, 0)).diffPixels).toBe(0);
  });

  it('keeps document info and stamps the producer', () => {
    const src = tools.open(readCorpus('rl_multipage.pdf'), 'multi.pdf');
    const bytes = tools.build([{ kind: 'page', src: src.id, page: 3 }], { title: 'Chapter 4 · 한글' });
    const doc = core.open(bytes);
    expect(core.metaText(doc, 'Title')).toBe('Chapter 4 · 한글');
    expect(core.metaText(doc, 'Producer')).toBe('Sticker PDF Lab');
    expect(core.metaText(doc, 'ModDate')).toMatch(/^D:\d{14}Z$/);
    core.close(doc);
  });

  it('rejects pages that do not exist and empty requests', () => {
    const src = tools.open(readCorpus('chrome_basic.pdf'), 'one.pdf');
    expect(() => tools.build([{ kind: 'page', src: src.id, page: 5 }])).toThrow(/no page 6/);
    expect(() => tools.build([])).toThrow(/No pages/);
    expect(() => tools.build([{ kind: 'page', src: 9999, page: 0 }])).toThrow(/Unknown page source/);
  });

  it('copies out of protected files into an unprotected one', () => {
    const owner = tools.open(readCorpus('rl_encrypted_owner.pdf'), 'owner.pdf');
    expect(owner.decrypted).toBe(true);
    expect(owner.restricted).toBe(true);
    const bytes = tools.build([{ kind: 'page', src: owner.id, page: 0 }]);
    const out = reopen(bytes);
    expect(out.decrypted).toBe(false);
    expect(diffBitmaps(shot(owner.id, 0), shot(out.id, 0)).diffPixels).toBe(0);

    const locked = tools.open(readCorpus('rl_encrypted_user.pdf'), 'locked.pdf');
    expect(locked.needsPassword).toBe(true);
    expect(locked.id).toBe(0);
    const unlocked = tools.open(readCorpus('rl_encrypted_user.pdf'), 'locked.pdf', 'secret');
    expect(unlocked.needsPassword).toBeUndefined();
    expect(tools.build([{ kind: 'page', src: unlocked.id, page: 0 }]).length).toBeGreaterThan(100);
  });

  it('closed sources are gone', () => {
    const src = tools.open(readCorpus('chrome_basic.pdf'), 'x.pdf');
    tools.close(src.id);
    expect(() => tools.render(src.id, 0, 1)).toThrow(/Unknown page source/);
  });
});

describe('page tools on an edited document', () => {
  it('a split of edited pages carries the edit, and no trace of the old revision', async () => {
    const s = await makeSession();
    s.open(readCorpus('chrome_basic.pdf'));
    const id = s.getLines(0).find((r) => r.text.startsWith('Quarterly'))!.id;
    expect((await s.setLineText(id, 'Quarterly Report 2020')).ok).toBe(true);
    const saved = s.save();
    // an incremental save keeps the previous revision inside the file
    expect(Buffer.from(saved).toString('latin1').match(/%%EOF/g)!.length).toBeGreaterThan(1);

    const src = tools.open(saved, 'edited.pdf');
    const clean = tools.build([{ kind: 'page', src: src.id, page: 0 }]);
    expect(pageText(clean, 0)).toContain('Quarterly Report 2020');
    expect(pageText(clean, 0)).not.toContain('2026 ');
    expect(Buffer.from(clean).toString('latin1').match(/%%EOF/g)).toHaveLength(1);
    // and it looks exactly like the edited document
    const out = reopen(clean);
    expect(diffBitmaps(shot(src.id, 0), shot(out.id, 0)).diffPixels).toBe(0);
  });
});

describe('bookmarks and layers survive a copy', () => {
  const guide = () => new Uint8Array(readFileSync('public/samples/study-guide.pdf'));
  const outlineOf = (bytes: Uint8Array) => {
    const doc = core.open(bytes);
    const o = core.outline(doc).map((e) => `${e.level}:${e.title}→${e.page + 1}`);
    core.close(doc);
    return o;
  };

  it('keeps the bookmarks that point into the new file, re-aimed at the new pages', () => {
    const src = tools.open(guide(), 'study-guide.pdf');
    // pages 13–16 are chapter 3 (p13 "Reordering", p15 "Rotating and deleting")
    const bytes = tools.build([12, 13, 14, 15].map((page) => ({ kind: 'page' as const, src: src.id, page })));
    expect(outlineOf(bytes)).toEqual(['1:Chapter 3 · Organizing pages→1', '2:Reordering→1', '2:Rotating and deleting→3']);
  });

  it('moves children up when their parent bookmark is not in the new file', () => {
    const src = tools.open(guide(), 'study-guide.pdf');
    const bytes = tools.build([14, 15].map((page) => ({ kind: 'page' as const, src: src.id, page })));
    expect(outlineOf(bytes)).toEqual(['1:Rotating and deleting→1']);
  });

  it('follows reordered and repeated pages (first occurrence wins) and can be switched off', () => {
    const src = tools.open(guide(), 'study-guide.pdf');
    const pages = [14, 12, 12].map((page) => ({ kind: 'page' as const, src: src.id, page }));
    expect(outlineOf(tools.build(pages))).toEqual(['1:Chapter 3 · Organizing pages→2', '2:Reordering→2', '2:Rotating and deleting→1']);
    expect(outlineOf(tools.build(pages, { bookmarks: false }))).toEqual([]);
  });

  it('groups each file’s bookmarks under its name when merging', () => {
    const a = tools.open(guide(), 'guide.pdf');
    const b = tools.open(readCorpus('rl_multipage.pdf'), 'plain.pdf');
    const bytes = tools.build([
      { kind: 'page', src: a.id, page: 0 },
      { kind: 'page', src: b.id, page: 0 },
      { kind: 'page', src: a.id, page: 2 },
    ]);
    expect(outlineOf(bytes)).toEqual([
      '1:guide→1',
      '2:Chapter 1 · Getting started→1',
      '3:Why PDFs are hard→1',
      '3:Opening a file→3',
      '1:plain→2',
    ]);
  });

  /** A one-page PDF with two layers: a red square on a visible layer and a blue one on a layer that starts hidden. */
  function layeredPdf(): Uint8Array {
    const content = '/OC /L1 BDC 1 0 0 rg 20 20 100 100 re f EMC\n/OC /L2 BDC 0 0 1 rg 140 20 100 100 re f EMC\n';
    const objs = [
      '<< /Type /Catalog /Pages 2 0 R /OCProperties << /OCGs [5 0 R 6 0 R] /D << /BaseState /ON /OFF [6 0 R] /Order [5 0 R 6 0 R] >> >> >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 260 140] /Contents 4 0 R /Resources << /Properties << /L1 5 0 R /L2 6 0 R >> >> >>',
      `<< /Length ${content.length} >>\nstream\n${content}endstream`,
      '<< /Type /OCG /Name (Visible layer) >>',
      '<< /Type /OCG /Name (Hidden layer) >>',
    ];
    let out = '%PDF-1.7\n';
    const offsets: number[] = [];
    objs.forEach((o, i) => {
      offsets.push(out.length);
      out += `${i + 1} 0 obj\n${o}\nendobj\n`;
    });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return new TextEncoder().encode(out);
  }

  it('keeps hidden layers hidden in the copy (and a duplicated page too)', () => {
    const src = tools.open(layeredPdf(), 'layers.pdf');
    const original = shot(src.id, 0);
    const px = (b: { width: number; data: Uint8Array }, x: number, y: number) => [
      ...b.data.slice((y * b.width + x) * 4, (y * b.width + x) * 4 + 3),
    ];
    expect(px(original, 70, 70)).toEqual([255, 0, 0]); // red layer shows
    expect(px(original, 190, 70)).toEqual([255, 255, 255]); // blue layer is hidden by default

    const out = reopen(
      tools.build([
        { kind: 'page', src: src.id, page: 0 },
        { kind: 'page', src: src.id, page: 0, rotate: 0 },
      ]),
    );
    for (const i of [0, 1]) expect(diffBitmaps(original, shot(out.id, i)).diffPixels).toBe(0);
  });

  const linkTargets = (bytes: Uint8Array, pageIndex: number) => {
    const doc = core.open(bytes);
    const page = core.loadPage(doc, pageIndex);
    const t = core.links(doc, page).map((l) => l.destPage);
    core.closePage(page);
    core.close(doc);
    return t;
  };

  it('keeps internal links working, including links to pages that come later in the file', () => {
    const src = tools.open(guide(), 'study-guide.pdf');
    const pick = (pages: number[]) => pages.map((page) => ({ kind: 'page' as const, src: src.id, page }));
    // source page 14 (index 13) links to the chapter start (index 12), "Chapter 2 <" (6) and "> Chapter 4" (18)
    expect(linkTargets(guide(), 13)).toEqual([12, 6, 18]);
    // in order: the start of the chapter is earlier in the file, the other two chapters are not in it
    expect(linkTargets(tools.build(pick([12, 13])), 1)).toEqual([0, -1, -1]);
    // reversed: the target is now LATER in the file (PDFium alone drops that link)
    expect(linkTargets(tools.build(pick([13, 12])), 0)).toEqual([1, -1, -1]);
    // duplicated pages: the link on both copies leads to the first copy of its target
    expect(linkTargets(tools.build(pick([12, 13, 12, 13])), 3)).toEqual([0, -1, -1]);
    // pages from separate copy calls (another file in between)
    const other = tools.open(readCorpus('chrome_basic.pdf'), 'other.pdf');
    const mixed = tools.build([...pick([12]), { kind: 'page', src: other.id, page: 0 }, ...pick([13])]);
    expect(linkTargets(mixed, 2)).toEqual([0, -1, -1]);
  });

  it('keeps layers that start hidden hidden', () => {
    const file = 'tests/corpus/external/visibility_expressions.pdf';
    if (!existsSync(file)) return; // the 910 hostile PDFs are fetched separately (tests/corpus/build/fetch_external.sh)
    const src = tools.open(new Uint8Array(readFileSync(file)), 'layers.pdf');
    const out = reopen(tools.build([{ kind: 'page', src: src.id, page: 0 }]));
    expect(diffBitmaps(shot(src.id, 0), shot(out.id, 0)).diffPixels).toBe(0);
  });
});

describe('organize, then keep editing', () => {
  it('a rebuilt file is still editable, with the same result as editing the original', async () => {
    const edit = async (bytes: Uint8Array) => {
      const s = await makeSession();
      s.open(bytes);
      const id = s.getLines(0).find((l) => l.text.startsWith('Quarterly'))!.id;
      expect((await s.setLineText(id, 'Annual Report 2026')).ok).toBe(true); // needs stand-in glyphs, so it exercises font embedding too
      const r = s.render(0, 1);
      return { width: r.width, height: r.height, data: new Uint8Array(r.data) };
    };
    const src = tools.open(readCorpus('chrome_basic.pdf'), 'chrome_basic.pdf');
    const rebuilt = tools.build([{ kind: 'page', src: src.id, page: 0 }]);
    expect(diffBitmaps(await edit(readCorpus('chrome_basic.pdf')), await edit(rebuilt)).diffPixels).toBe(0);
  });

  it('survives several rounds (rebuild → edit → rebuild)', async () => {
    const s = await makeSession();
    s.open(readCorpus('chrome_basic.pdf'));
    const id = s.getLines(0).find((l) => l.text.startsWith('Quarterly'))!.id;
    await s.setLineText(id, 'Quarterly Report 2020');
    let src = tools.open(s.save(), 'round1.pdf');
    const second = await makeSession();
    second.open(tools.build([{ kind: 'page', src: src.id, page: 0 }]));
    const again = second.getLines(0).find((l) => l.text.startsWith('Quarterly'))!;
    expect(again.text).toBe('Quarterly Report 2020');
    expect((await second.setLineText(again.id, 'Quarterly Report 2019')).ok).toBe(true);
    src = tools.open(second.save(), 'round2.pdf');
    expect(pageText(tools.build([{ kind: 'page', src: src.id, page: 0 }]), 0)).toContain('Quarterly Report 2019');
  });
});
