# Sticker PDF Lab (v2)

A free, private, in-browser PDF editor whose headline feature is **editing existing text in its original font and size**.
Everything runs on your device — there is no server and no account.

> Status: first implementation pass of the v2 rewrite. The previous version lives in `legacy/` and keeps being published at
> the site root; v2 is published at `/v2/` (see `.github/workflows/pages.yml`, including the one-time Pages setting it needs).

## What works today

- **Edit text in place.** Click a line, type. New characters are drawn with the document's own font object, size, colour and
  spacing. The preview you see is PDFium rendering the actual patched file, so what you see is what you save.
- **Whole lines, not fragments.** Many PDFs store one operator per glyph or per word. The editor merges them into lines,
  keeps table cells separate, and moves the rest of the line when a word gets longer or shorter.
- **Characters the font doesn't have.** Embedded PDF fonts are usually subsets. When you type a missing letter the editor
  embeds a stand-in (Gelasio for Georgia, Arimo for Arial, Nanum for Hangul, …) for just those characters and says so.
- **Real text selection and copy** (drag, double-click a word, triple-click a line, ⌘/Ctrl+C), powered by PDFium's
  reading-order logic.
- Undo / redo, save (a byte-minimal incremental update: everything you didn't touch is byte-identical).
- **Pages & Split.** A page grid to reorder (drag), rotate, delete, duplicate, insert blank pages and add pages from other
  PDFs (merge); **Split** by ranges (`1-3, 7, 9-12`, `5-`, `odd`, `last`…), every N pages, by bookmarks or the selected pages, as
  separate files or one ZIP. Pages are copied *exactly* (fonts, images and text are the same objects, nothing is re-rendered),
  text edits made before splitting are included, and bookmarks, internal links and hidden layers are carried over.
  "Save clean copy" rewrites the whole file so older versions of edited text are gone from it.
- **Protected PDFs.** Files with an owner password or editing restrictions open and are edited as an unprotected copy (the app
  tells you when the author restricted editing); files that need a password ask for it. Damaged files are rebuilt by PDFium first.

## Run it

```bash
pnpm install
node scripts/fetch-fonts.mjs      # one-time: downloads the open-licensed fallback fonts into public/fonts (~26 MB)
pnpm dev                          # http://localhost:5173  (add ?sample=quarterly-report to open a sample)
pnpm test                         # engine + line-model tests (needs the fonts above)
pnpm build                        # production build in dist/
```

Optional stress corpus (not committed): `pnpm corpus:external` downloads ~900 regression PDFs from pdf.js into
`tests/corpus/external`, used by the scripts in `tests/spikes`. To check the editor on your own PDFs, put them in
`tests/corpus/user/` (git-ignored) and run `npx tsx tests/spikes/user-corpus.ts`; it prints counts and timings only, never text.

## How it works

PDFium regenerating content streams turned out to be lossy (colour spaces, shadings, resource names…) and cannot reproduce
justified or tracked text, so edits never go through it. Instead:

| Layer | Role |
| --- | --- |
| `@embedpdf/pdfium` (WASM) | rendering, text selection, the test oracle |
| `src/pdf/*` | own PDF reader/writer: xref streams, object streams, repair, **incremental updates**; content-stream tokenizer with exact byte ranges; text-state interpreter; font model (widths, encodings, ToUnicode) |
| `src/pdf/patch.ts`, `reflow.ts` | rewrite only the string of the affected `Tj`/`TJ`; split an operator to switch fonts for new text; reposition the words that follow with explicit `Tm` and pin the first word that must not move |
| `src/fonts/*` | sfnt parser, HarfBuzz subsetting (original glyph ids retained → CID = GID), CID TrueType embedding with ToUnicode, catalog + per-character resolver |
| `src/engine/lines.ts` | logical **line model** and `planLineEdit` (text edit → per-operator edits) |
| `src/engine/session.ts` | edits are planned against the *original* document every time, so undo/redo and "reset" restore exact bytes |
| `src/ui`, `src/state` | React viewer, overlay, IME-ready editor |

Verification highlights (all in `tests/`): a word replaced with the real Georgia Bold matches a PDF Chrome generates from the
same HTML **pixel for pixel**; 261/262 patched PDFs from a hostile corpus are pixel-identical outside the edit; 819/819
no-op incremental updates render identically; line-edit geometry is checked against PDFium's independent glyph positions.

### Pages & Split under the hood

`src/engine/pages.ts` builds a new PDF from a list of pages (`{src, page, rotate}` or blank) with PDFium's page import, which
clones page objects instead of regenerating them. PDFium drops some document-level data, which we restore: bookmarks
(recreated with the same nesting and view, re-aimed at the new page numbers), links to pages that moved (`restoreLinks`), and
the layer configuration of PDFs with optional content (`src/engine/carry.ts` maps old objects to their copies by walking the
original page and its copy side by side). Not carried over: tagged-PDF structure, AcroForm fields, page labels, named destinations.
Range syntax and file naming are pure functions in `src/organize/` (`ranges.ts`, `split.ts`), covered by `tests/organize.test.ts`.

Verification (`tests/pages.test.ts`, `tests/spikes/pages-corpus.ts`, `tests/spikes/pages-user.ts`): over the 910 hostile PDFs,
997 of 999 sampled single-page copies and 887 of 889 whole-document copies render pixel-identically to the originals; the rest
are two files with non-embedded fonts (PDFium renders even *identical bytes* differently across document loads) and one
file whose page tree loops. Outputs also open cleanly in poppler and pypdf.

## Known limits (next on the list)

Paragraph wrapping/re-justification, text inside shared form XObjects (copy-on-write), ligature glyphs, vertical writing,
Type 3 fonts, exact font matching through the Local Font Access API, and the rest of the roadmap beyond text editing and
page organizing (image/PDF conversion, compression, password protection, find & replace, OCR).

## License

GPL-3.0-only — see `LICENSE` and `NOTICE` (third-party components and fonts).
