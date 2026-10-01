import { useCallback, useEffect, useRef } from 'react';
import { engine } from './engine/instance';
import { useApp } from './state/store';
import { redo, undo } from './state/actions';
import { PageView } from './ui/PageView';

const SAMPLES = [
  { file: 'quarterly-report.pdf', label: 'Quarterly report (Chrome · Georgia/Arial · Korean)' },
  { file: 'embedded-fonts.pdf', label: 'Embedded TrueType subsets' },
];

export default function App() {
  const { doc, fileName, zoom, tool, status, dirty, canUndo, canRedo } = useApp();
  const { setZoom, setTool, setStatus } = useApp.getState();
  const scroller = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const openBytes = useCallback(async (buf: ArrayBuffer, name: string) => {
    useApp.getState().setStatus('Opening…');
    try {
      const info = await engine.api.open(buf);
      useApp.getState().setDoc(name, info);
      useApp
        .getState()
        .setStatus(
          `${info.pages.length} page${info.pages.length === 1 ? '' : 's'} loaded${info.repaired ? ' (file structure was repaired)' : ''}. Click any text to edit it.`,
          'ok',
        );
    } catch (e) {
      useApp.getState().setStatus(`Could not open this PDF: ${e instanceof Error ? e.message : e}`, 'error');
    }
  }, []);

  const openSample = useCallback(
    async (file: string) => {
      const res = await fetch(`./samples/${file}`);
      await openBytes(await res.arrayBuffer(), file);
    },
    [openBytes],
  );

  useEffect(() => {
    const sample = new URLSearchParams(location.search).get('sample');
    if (sample) void openSample(`${sample}.pdf`);
  }, [openSample]);

  // ⌘/Ctrl+Z undo, ⇧⌘/Ctrl+Z or Ctrl+Y redo. Handled for the document, including while typing in the editor,
  // so the browser's own per-textarea undo never fights the engine's history.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) void undo();
      else if ((k === 'z' && e.shiftKey) || k === 'y') void redo();
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

  const onFile = async (f: File | undefined | null) => {
    if (f) await openBytes(await f.arrayBuffer(), f.name);
  };

  const save = async () => {
    const bytes = await engine.api.save();
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName.replace(/\.pdf$/i, '') + '-edited.pdf';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    setStatus('Saved. Only the edited text was rewritten; everything else is byte-identical.', 'ok');
  };

  const fit = () => {
    if (!doc || !scroller.current) return;
    const w = Math.max(...doc.pages.map((p) => p.width));
    setZoom((scroller.current.clientWidth - 64) / w);
  };

  return (
    <div
      className="app"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void onFile(e.dataTransfer.files[0]);
      }}
    >
      <header className="topbar">
        <div className="brand">
          <span className="brand-sticker" aria-hidden="true">
            📄
          </span>
          <div>
            <h1>Sticker PDF Lab</h1>
            <p>v2 preview · edit text in its original font</p>
          </div>
        </div>
        <div className="actions">
          <div className="group">
            <button className="btn primary" onClick={() => fileInput.current?.click()}>
              📂 Open PDF
            </button>
            <input ref={fileInput} type="file" accept="application/pdf" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
            <select className="btn" aria-label="Open a sample" value="" onChange={(e) => e.target.value && void openSample(e.target.value)}>
              <option value="">🧪 Samples…</option>
              {SAMPLES.map((s) => (
                <option key={s.file} value={s.file}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="group seg" role="group" aria-label="Tool">
            <button className={tool === 'select' ? 'on' : ''} onClick={() => setTool('select')}>
              🎯 Select text
            </button>
            <button className={tool === 'edit' ? 'on' : ''} onClick={() => setTool('edit')}>
              📝 Edit text
            </button>
          </div>
          <div className="group">
            <button className="btn icon" onClick={() => void undo()} disabled={!canUndo} aria-label="Undo" title="Undo (⌘Z)">
              ↩
            </button>
            <button className="btn icon" onClick={() => void redo()} disabled={!canRedo} aria-label="Redo" title="Redo (⇧⌘Z)">
              ↪
            </button>
          </div>
          <div className="group">
            <button className="btn icon" onClick={() => setZoom(zoom / 1.15)} aria-label="Zoom out">
              −
            </button>
            <span className="zoom">{Math.round(zoom * 100)}%</span>
            <button className="btn icon" onClick={() => setZoom(zoom * 1.15)} aria-label="Zoom in">
              +
            </button>
            <button className="btn" onClick={fit} disabled={!doc}>
              Fit
            </button>
          </div>
          <div className="group">
            <button className="btn accent" onClick={() => void save()} disabled={!doc}>
              💾 Save{dirty ? ' •' : ''}
            </button>
          </div>
        </div>
      </header>
      <main className="stage" ref={scroller}>
        {!doc && (
          <div className="empty">
            <div className="empty-card">
              <span className="empty-emoji">📎</span>
              <h2>Drop a PDF here</h2>
              <p>Everything stays on your device. Click a word, type, and the new text is drawn with the document’s own font.</p>
              <button className="btn primary" onClick={() => void openSample(SAMPLES[0].file)}>
                Try the sample
              </button>
            </div>
          </div>
        )}
        {doc && (
          <div className="pages">
            {doc.pages.map((p) => (
              <PageView key={p.index} info={p} />
            ))}
          </div>
        )}
      </main>
      <footer className={`status ${status.kind}`} role="status" aria-live="polite">
        <span>{status.text}</span>
        {fileName && <span className="file">{fileName}</span>}
      </footer>
    </div>
  );
}
