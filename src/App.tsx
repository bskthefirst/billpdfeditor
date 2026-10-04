import { useEffect, useLayoutEffect, useRef } from 'react';
import { openFile, openSample, redoCommand, switchView, undoCommand, undoPageChanges } from './state/actions';
import { addPdfFiles, hasChanges, useOrganize } from './state/organize';
import { openSplit, useSplit } from './state/split';
import { useApp } from './state/store';
import { LeaveDialog } from './ui/LeaveDialog';
import { PageView } from './ui/PageView';
import { PagesToolbar } from './ui/PagesToolbar';
import { PagesView } from './ui/PagesView';
import { SaveMenu } from './ui/SaveMenu';
import { SplitDialog } from './ui/SplitDialog';
import { thumbs } from './ui/thumbs';

const SAMPLES = [
  { file: 'quarterly-report.pdf', label: 'Quarterly report (Chrome · Georgia/Arial · Korean)' },
  { file: 'embedded-fonts.pdf', label: 'Embedded TrueType subsets' },
  { file: 'study-guide.pdf', label: 'Study guide (24 pages · bookmarks · try Pages & Split)' },
];

const TEXT = {
  tagline: 'v2 preview · edit text in its original font · organize & split pages',
  open: '📂 Open PDF',
  samples: '🧪 Samples…',
  openSample: 'Open a sample',
  viewGroup: 'View',
  edit: '✏️ Edit',
  editTip: 'Edit text in the document',
  pages: '🗂️ Pages',
  pagesTip: 'Rearrange, rotate, delete and add pages',
  pagesBusy: 'Wait for the page change to finish',
  toolGroup: 'Tool',
  select: '🎯 Select text',
  editText: '📝 Edit text',
  undo: 'Undo',
  undoTip: 'Undo (⌘Z)',
  redo: 'Redo',
  redoTip: 'Redo (⇧⌘Z)',
  undoPages: '↩ Undo page changes',
  undoPagesTip: 'Go back to the document as it was before you applied your page changes',
  zoomOut: 'Zoom out',
  zoomIn: 'Zoom in',
  fit: 'Fit',
  split: '✂️ Split',
  splitTip: 'Split into several PDFs: by page ranges, every N pages, or bookmarks',
  emptyTitle: 'Drop a PDF here',
  emptyBody:
    'Everything stays on your device. Click a word, type, and the new text is drawn with the document’s own font. Pages and Split rearrange, merge and cut the file apart without re-rendering anything.',
  trySample: 'Try the sample',
  tryGuide: 'Try Pages & Split',
};

export default function App() {
  const { doc, fileName, zoom, tool, status, dirty, canUndo, canRedo, view, generation, preApply } = useApp();
  const { setZoom, setTool } = useApp.getState();
  const pagesBusy = useOrganize((s) => s.busy !== null);
  const pagesChanged = useOrganize((s) => hasChanges(s));
  const pagesReady = useOrganize((s) => s.phase === 'ready');
  const scroller = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const editScroll = useRef(0);
  const lastGeneration = useRef(generation);
  const autoOpened = useRef(false);

  useEffect(() => {
    // StrictMode runs effects twice in development; a ref keeps the sample from being opened twice
    if (autoOpened.current) return;
    autoOpened.current = true;
    const sample = new URLSearchParams(location.search).get('sample');
    if (sample) openSample(`${sample}.pdf`);
  }, []);

  // Debug handles for devtools and the automated browser checks (dev builds only; main.tsx adds engine and useApp).
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const lab = ((window as unknown as { __lab?: Record<string, unknown> }).__lab ??= {});
    Object.assign(lab, { organize: useOrganize, split: useSplit, thumbs });
  }, []);

  // ⌘/Ctrl+Z undo, ⇧⌘/Ctrl+Z or Ctrl+Y redo. Handled for the document, including while typing in the editor, so the
  // browser's own per-textarea undo never fights the engine's history. In Pages mode they act on the page list instead.
  // Dialogs keep the browser's own undo for their text fields.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      if (e.target instanceof Element && e.target.closest('[role="dialog"]')) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) undoCommand();
      else if ((k === 'z' && e.shiftKey) || k === 'y') redoCommand();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // ⌘/Ctrl+C copies the PDF text selection (the textarea handles its own copy while editing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'c') return;
      if (document.activeElement instanceof HTMLTextAreaElement) return;
      const sel = useApp.getState().selection;
      if (!sel?.text) return;
      e.preventDefault();
      void navigator.clipboard
        .writeText(sel.text.replace(/\r\n/g, '\n'))
        .then(() => useApp.getState().setStatus(`Copied ${sel.text.length} characters.`, 'ok'));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Back in the editor (Discard, or Apply of a different page count) the page list is where it was left, or at the top for
  // a different document.
  useLayoutEffect(() => {
    if (view !== 'edit' || !scroller.current) return;
    scroller.current.scrollTop = lastGeneration.current === generation ? editScroll.current : 0;
    lastGeneration.current = generation;
  }, [view, generation]);

  const changeView = (next: 'edit' | 'pages') => {
    if (view === 'edit' && scroller.current) editScroll.current = scroller.current.scrollTop;
    switchView(next);
  };

  const onFiles = (files: File[]) => {
    if (!files.length) return;
    if (useApp.getState().view === 'pages') void addPdfFiles(files);
    else openFile(files[0]);
  };

  const fit = () => {
    if (!doc || !scroller.current) return;
    const w = Math.max(...doc.pages.map((p) => p.width));
    setZoom((scroller.current.clientWidth - 64) / w);
  };

  const inPages = view === 'pages';
  return (
    <div
      className="app"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <header className="topbar">
        <div className="topbar-row">
          <div className="brand">
            <span className="brand-sticker" aria-hidden="true">
              📄
            </span>
            <div>
              <h1>Sticker PDF Lab</h1>
              <p>{TEXT.tagline}</p>
            </div>
          </div>
          <div className="actions">
            <div className="group">
              <button className="btn primary" onClick={() => fileInput.current?.click()} disabled={pagesBusy}>
                {TEXT.open}
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="application/pdf"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = ''; // picking the same file again must still open it
                  if (f) openFile(f);
                }}
              />
              <select
                className="btn"
                aria-label={TEXT.openSample}
                value=""
                disabled={pagesBusy}
                onChange={(e) => e.target.value && openSample(e.target.value)}
              >
                <option value="">{TEXT.samples}</option>
                {SAMPLES.map((s) => (
                  <option key={s.file} value={s.file}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="group seg mode" role="group" aria-label={TEXT.viewGroup}>
              <button
                className={!inPages ? 'on' : ''}
                aria-pressed={!inPages}
                onClick={() => changeView('edit')}
                disabled={pagesBusy}
                title={TEXT.editTip}
              >
                {TEXT.edit}
              </button>
              <button
                className={inPages ? 'on' : ''}
                aria-pressed={inPages}
                onClick={() => changeView('pages')}
                disabled={!doc || pagesBusy}
                title={pagesBusy ? TEXT.pagesBusy : TEXT.pagesTip}
              >
                {TEXT.pages}
              </button>
            </div>
            {!inPages && (
              <>
                <div className="group seg" role="group" aria-label={TEXT.toolGroup}>
                  <button className={tool === 'select' ? 'on' : ''} onClick={() => setTool('select')}>
                    {TEXT.select}
                  </button>
                  <button className={tool === 'edit' ? 'on' : ''} onClick={() => setTool('edit')}>
                    {TEXT.editText}
                  </button>
                </div>
                <div className="group">
                  <button className="btn icon" onClick={undoCommand} disabled={!canUndo} aria-label={TEXT.undo} title={TEXT.undoTip}>
                    ↩
                  </button>
                  <button className="btn icon" onClick={redoCommand} disabled={!canRedo} aria-label={TEXT.redo} title={TEXT.redoTip}>
                    ↪
                  </button>
                </div>
                <div className="group">
                  <button className="btn icon" onClick={() => setZoom(zoom / 1.15)} aria-label={TEXT.zoomOut}>
                    −
                  </button>
                  <span className="zoom">{Math.round(zoom * 100)}%</span>
                  <button className="btn icon" onClick={() => setZoom(zoom * 1.15)} aria-label={TEXT.zoomIn}>
                    +
                  </button>
                  <button className="btn" onClick={fit} disabled={!doc}>
                    {TEXT.fit}
                  </button>
                </div>
              </>
            )}
            <div className="group">
              <button
                className="btn"
                onClick={(e) => void openSplit(e.currentTarget)}
                disabled={!doc || (inPages && !pagesReady) || pagesBusy}
                title={TEXT.splitTip}
              >
                {TEXT.split}
              </button>
            </div>
            <SaveMenu disabled={!doc} dirty={dirty} blocked={inPages && (pagesChanged || pagesBusy)} />
          </div>
        </div>
        {inPages && <PagesToolbar />}
      </header>
      <main className={`stage${inPages ? ' stage-pages' : ''}`} ref={scroller}>
        {!doc && (
          <div className="empty">
            <div className="empty-card">
              <span className="empty-emoji">📎</span>
              <h2>{TEXT.emptyTitle}</h2>
              <p>{TEXT.emptyBody}</p>
              <div className="empty-actions">
                <button className="btn primary" onClick={() => openSample(SAMPLES[0].file)}>
                  {TEXT.trySample}
                </button>
                <button className="btn" onClick={() => openSample('study-guide.pdf')}>
                  {TEXT.tryGuide}
                </button>
              </div>
            </div>
          </div>
        )}
        {doc && !inPages && (
          <div className="pages">
            {doc.pages.map((p) => (
              <PageView key={`${generation}:${p.index}`} info={p} />
            ))}
          </div>
        )}
        {doc && inPages && <PagesView />}
      </main>
      <footer className={`status ${status.kind}`} role="status" aria-live="polite">
        <span>{status.text}</span>
        {preApply && !inPages && (
          <button className="btn small" onClick={() => void undoPageChanges()} title={TEXT.undoPagesTip}>
            {TEXT.undoPages}
          </button>
        )}
        {fileName && <span className="file">{fileName}</span>}
      </footer>
      <SplitDialog />
      <LeaveDialog />
    </div>
  );
}
