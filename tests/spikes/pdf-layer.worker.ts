import { readFileSync } from 'node:fs';
import { loadCore, diffBitmaps } from '../helpers/node-core';
import { defineWorker } from '../helpers/batch';
import { PdfFile } from '../../src/pdf/file';
import { IncrementalUpdate } from '../../src/pdf/writer';
import { PdfNewStream } from '../../src/pdf/objects';
import { UnsupportedFilterError } from '../../src/pdf/filters';

export interface PdfLayerResult {
  status: 'ok' | 'encrypted';
  repaired: boolean;
  xref: string;
  pages: number;
  pdfiumPages: number;
  contentBytes: number;
  contentError?: string;
  roundtrip: 'identical' | 'differs' | 'skipped' | 'error';
  roundtripDetail?: string;
}

export default defineWorker<PdfLayerResult>(async (path) => {
  const bytes = new Uint8Array(readFileSync(path));
  const f = PdfFile.load(bytes);
  const pages = f.pages();
  const core = await loadCore();
  const r: PdfLayerResult = {
    status: f.encrypted ? 'encrypted' : 'ok',
    repaired: f.repaired,
    xref: f.xrefKind,
    pages: pages.length,
    pdfiumPages: -1,
    contentBytes: 0,
    roundtrip: 'skipped',
  };
  let pdfiumDoc;
  try {
    pdfiumDoc = core.open(bytes);
    r.pdfiumPages = pdfiumDoc.pageCount;
  } catch {
    /* PDFium cannot open it either */
  }
  if (f.encrypted) return r;

  try {
    for (const p of pages.slice(0, 3)) r.contentBytes += f.pageContent(p).length;
  } catch (e) {
    r.contentError = e instanceof UnsupportedFilterError ? `filter:${e.filter}` : String(e instanceof Error ? e.message : e).slice(0, 80);
  }

  // No-op incremental update on page 1: re-write its first content stream (decoded, unfiltered) and the page dict.
  if (pdfiumDoc && pages.length && !f.repaired) {
    try {
      const page = pages[0];
      const up = new IncrementalUpdate(f);
      const streams = f.contentStreams(page);
      if (streams.length && page.num) {
        const s = streams[0];
        const d = new Map(s.stream.dict);
        d.delete('Filter');
        d.delete('DecodeParms');
        d.delete('DP');
        d.delete('F');
        up.set(s.num, new PdfNewStream(d, f.decode(s.stream)));
        up.set(page.num, page.dict);
        const out = up.build();
        // PDFium's font substitution differs on the very first load in a process, so always compare fresh loads after a warm-up.
        const renderFresh = (b: Uint8Array) => {
          const d = core.open(b);
          const p = core.loadPage(d, 0);
          const img = core.render(p, 1.25);
          core.closePage(p);
          return { d, img };
        };
        const w = renderFresh(bytes);
        core.close(w.d);
        const o = renderFresh(bytes);
        core.close(o.d);
        const n = renderFresh(out);
        const before = o.img;
        const after = n.img;
        const doc2 = n.d;
        const pc = doc2.pageCount;
        core.close(doc2);
        const d2 = diffBitmaps(before, after);
        r.roundtrip = d2.diffPixels === 0 && pc === r.pdfiumPages ? 'identical' : 'differs';
        if (r.roundtrip === 'differs') r.roundtripDetail = `${d2.diffPixels}px, pages ${pc}/${r.pdfiumPages}`;
      }
    } catch (e) {
      r.roundtrip = 'error';
      r.roundtripDetail = String(e instanceof Error ? e.message : e).slice(0, 100);
    }
  }
  if (pdfiumDoc) core.close(pdfiumDoc);
  return r;
});
