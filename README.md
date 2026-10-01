# Sticker PDF Lab (v2)

A free, private, in-browser PDF editor whose headline feature is **editing existing text in its original font and size**.
Everything runs on your device — there is no server and no account.

> Status: first implementation pass of the v2 rewrite (see `docs`/the plan below). The previous version lives in `legacy/`.

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

## Run it

```bash
pnpm install
node scripts/fetch-fonts.mjs      # one-time: downloads the open-licensed fallback fonts into public/fonts (~26 MB)
pnpm dev                          # http://localhost:5173  (add ?sample=quarterly-report to open a sample)
pnpm test                         # engine + line-model tests (needs the fonts above)
pnpm build                        # production build in dist/
```

Optional stress corpus (not committed): `pnpm corpus:external` downloads ~900 regression PDFs from pdf.js into
`tests/corpus/external`, used by the scripts in `tests/spikes`.

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

## Known limits (next on the list)

Paragraph wrapping/re-justification, text inside shared form XObjects (copy-on-write), ligature glyphs, vertical writing,
Type 3 fonts, encrypted PDFs, exact font matching through the Local Font Access API, and everything in the roadmap beyond
text editing (organize/convert tools).

## License

GPL-3.0-only — see `LICENSE` and `NOTICE` (third-party components and fonts).
