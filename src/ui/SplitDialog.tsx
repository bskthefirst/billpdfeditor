import { zipSync } from 'fflate';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { engine } from '../engine/instance';
import { toSpecs } from '../organize/model';
import { parseRanges, type RangeError } from '../organize/ranges';
import { planBookmarks, planEvery, planRanges, planSelection, safeFileName, type SplitPart } from '../organize/split';
import { closeSplit, useSplit, type SplitSession } from '../state/split';
import { useApp } from '../state/store';
import { downloadBytes, sleep } from './download';
import { Modal } from './Modal';

const TEXT = {
  title: '✂️ Split PDF',
  subPages: (n: number) => `Splitting the pages as you arranged them — ${n} page${n === 1 ? '' : 's'} in the list.`,
  subEdit: (n: number) => `Splitting this document — ${n} page${n === 1 ? '' : 's'}.`,
  loading: 'Preparing the pages…',
  loadFailed: (why: string) => `Could not prepare the split: ${why}`,
  close: 'Close',
  modeGroup: 'Split by',
  ranges: '✂️ Ranges',
  every: '🔢 Every N pages',
  bookmarks: '🔖 Bookmarks',
  selected: '☑️ Selected pages',
  noBookmarks: 'This document has no bookmarks to split by.',
  needSelection: 'Select pages in Pages mode to split off just those.',
  rangesLabel: 'Pages to extract',
  rangesPlaceholder: '1-3, 7, 9-12',
  rangesHint: (n: number) => `pages 1–${n} · try 5- · -3 · odd · even · last`,
  rangesEmpty: 'Type the pages you want, for example 1-3, 7, 9-12. Each part becomes its own file.',
  quickAdd: 'Quick add',
  from: 'From',
  to: 'To',
  addRange: '＋ Add range',
  merge: 'Merge all ranges into one PDF',
  everyLabel: 'Pages per file',
  everyInvalid: 'Enter a whole number of 1 or more.',
  levelLabel: 'Split at bookmarks up to',
  levelOption: (level: number, files: number) =>
    `Level ${level}${level === 1 ? ' (top level)' : ''} — ${files} file${files === 1 ? '' : 's'}`,
  selectedInfo: (n: number) => `The ${n} selected page${n === 1 ? '' : 's'}, in page order, as one file.`,
  preview: 'Files that will be created',
  previewNone: 'Nothing to create yet.',
  more: (n: number) => `+${n} more`,
  total: (files: number, pages: number) => `${files} file${files === 1 ? '' : 's'} · ${pages} page${pages === 1 ? '' : 's'} in total`,
  outputGroup: 'Download as',
  zip: (name: string) => `One ZIP file (${name})`,
  separate: 'Separate files',
  separateWarn: 'Your browser may ask for permission to download several files at once.',
  cancel: 'Cancel',
  stop: 'Stop',
  go: '✂️ Split',
  goOne: '✂️ Extract & download',
  goMany: (n: number) => `✂️ Split into ${n} files`,
  building: (done: number, total: number) => `Building ${Math.min(done + 1, total)}/${total}…`,
  failed: (why: string) => `Could not split the PDF: ${why}`,
  doneOne: (name: string) => `Split done · downloaded ${name}`,
  doneZip: (n: number, name: string) => `Split into ${n} files · downloaded ${name}`,
  doneSeparate: (n: number) => `Split into ${n} files · downloaded separately`,
};

type Mode = 'ranges' | 'every' | 'bookmarks' | 'selected';

export function SplitDialog() {
  const { open, loading, error, session, returnFocus } = useSplit();
  if (!open) return null;
  return (
    <Modal title={TEXT.title} onClose={closeSplit} width={600} restoreFocus={returnFocus}>
      {loading && <p className="modal-text">{TEXT.loading}</p>}
      {error && (
        <p className="field-error" role="alert">
          {TEXT.loadFailed(error)}
        </p>
      )}
      {session && <SplitForm session={session} />}
    </Modal>
  );
}

interface Plan {
  parts: SplitPart[];
  errors: RangeError[];
  /** Why there is nothing to do yet (shown instead of the preview). */
  note: string | null;
}

/** An error line that always says which item it is about. */
const describe = (e: RangeError) => (e.message.includes(e.text) ? e.message : `${e.text}: ${e.message}`);

function SplitForm({ session }: { session: SplitSession }) {
  const n = session.items.length;
  const hasSelection = session.selected.length > 0;
  const levels = useMemo(() => [...new Set(session.outline.map((e) => e.level))].sort((a, b) => a - b), [session.outline]);
  const hasBookmarks = levels.length > 0;
  const base = session.baseName;
  const zipName = `${safeFileName(base, 'document')}-split.zip`;

  const [mode, setMode] = useState<Mode>(hasSelection ? 'selected' : 'ranges');
  const [text, setText] = useState('');
  const [merge, setMerge] = useState(false);
  const [every, setEvery] = useState(String(Math.max(1, Math.min(n, 10))));
  const [level, setLevel] = useState(levels[0] ?? 1);
  const [output, setOutput] = useState<'zip' | 'separate'>('zip');
  const [from, setFrom] = useState('1');
  const [to, setTo] = useState(String(n));
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const ids = { text: useId(), hint: useId(), from: useId(), to: useId(), every: useId(), level: useId() };

  useEffect(() => {
    // The dialog opens before the page list is ready, so the form is not there yet when the dialog first takes focus:
    // put the cursor where typing starts (or on the main button when there is nothing to type).
    const el = form.current;
    const a = document.activeElement;
    const stillUntouched = !a || a === document.body || a.closest('.modal-head') !== null || a.matches('[role="dialog"]');
    if (el && stillUntouched)
      (el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>('button[type="submit"]:not(:disabled)'))?.focus();
    return () => {
      cancelled.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const plan = useMemo<Plan>(() => {
    const empty = { parts: [] as SplitPart[], errors: [] as RangeError[] };
    if (mode === 'ranges') {
      const parsed = parseRanges(text, n);
      return { parts: planRanges(parsed.items, base, merge), errors: parsed.errors, note: text.trim() ? null : TEXT.rangesEmpty };
    }
    if (mode === 'every') {
      const k = Number(every);
      if (!Number.isInteger(k) || k < 1) return { ...empty, note: TEXT.everyInvalid };
      return { ...empty, parts: planEvery(n, k, base), note: null };
    }
    if (mode === 'bookmarks') {
      if (!hasBookmarks) return { ...empty, note: TEXT.noBookmarks };
      return { ...empty, parts: planBookmarks(session.outline, n, level, base), note: null };
    }
    if (!hasSelection) return { ...empty, note: TEXT.needSelection };
    return { ...empty, parts: planSelection(session.selected, base), note: null };
  }, [mode, text, merge, every, level, n, base, hasBookmarks, hasSelection, session.outline, session.selected]);

  const parts = plan.parts;
  const totalPages = parts.reduce((sum, p) => sum + p.pages.length, 0);
  const busy = progress !== null;
  const blocked = busy || !parts.length || plan.errors.length > 0;

  const fromN = Number(from);
  const toN = Number(to);
  const quickOk = Number.isInteger(fromN) && Number.isInteger(toN) && fromN >= 1 && toN <= n && fromN <= toN;
  const addRange = () => {
    if (!quickOk) return;
    const piece = fromN === toN ? String(fromN) : `${fromN}-${toN}`;
    const t = text.trim();
    setText(!t ? piece : `${t.replace(/[,\s]+$/, '')}, ${piece}`);
  };

  const deliver = async (files: Array<{ name: string; bytes: Uint8Array }>): Promise<string> => {
    if (files.length === 1) {
      downloadBytes(files[0].bytes, files[0].name);
      return TEXT.doneOne(files[0].name);
    }
    if (output === 'zip') {
      // PDFs are already compressed: store them as they are
      const zip = zipSync(Object.fromEntries(files.map((f) => [f.name, f.bytes])), { level: 0 });
      downloadBytes(zip, zipName, 'application/zip');
      return TEXT.doneZip(files.length, zipName);
    }
    for (const f of files) {
      downloadBytes(f.bytes, f.name);
      await sleep(350); // browsers drop or prompt for downloads fired in the same instant
    }
    return TEXT.doneSeparate(files.length);
  };

  const run = async () => {
    if (blocked) return;
    cancelled.current = false;
    setError(null);
    const specs = toSpecs(session.items);
    const todo = parts;
    setProgress({ done: 0, total: todo.length });
    try {
      const files: Array<{ name: string; bytes: Uint8Array }> = [];
      for (const [i, part] of todo.entries()) {
        const buf = await engine.api.buildPdf(
          part.pages.map((p) => specs[p]),
          { bookmarks: true },
        );
        if (cancelled.current) return;
        files.push({ name: part.name, bytes: new Uint8Array(buf) });
        setProgress({ done: i + 1, total: todo.length });
      }
      const message = await deliver(files);
      if (cancelled.current) return;
      closeSplit();
      useApp.getState().setStatus(message, 'ok');
    } catch (e) {
      if (!cancelled.current) setError(TEXT.failed(e instanceof Error ? e.message : String(e)));
    } finally {
      setProgress(null);
    }
  };

  const stop = () => {
    cancelled.current = true;
    closeSplit();
  };

  const modes: Array<{ id: Mode; label: string; off: boolean }> = [
    { id: 'ranges', label: TEXT.ranges, off: false },
    { id: 'every', label: TEXT.every, off: false },
    { id: 'bookmarks', label: TEXT.bookmarks, off: !hasBookmarks },
    { id: 'selected', label: TEXT.selected, off: !hasSelection },
  ];
  const levelCounts = useMemo(
    () => levels.map((l) => ({ level: l, files: planBookmarks(session.outline, n, l, base).length })),
    [levels, session.outline, n, base],
  );

  return (
    <form
      ref={form}
      className="split-form"
      onSubmit={(e) => {
        e.preventDefault();
        void run();
      }}
    >
      <p className="modal-text">{session.origin === 'pages' ? TEXT.subPages(n) : TEXT.subEdit(n)}</p>

      <div className="group seg modes" role="group" aria-label={TEXT.modeGroup}>
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            className={mode === m.id ? 'on' : ''}
            aria-pressed={mode === m.id}
            disabled={m.off || busy}
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
      {(!hasBookmarks || !hasSelection) && (
        <p className="muted small">
          {!hasBookmarks && (
            <span>
              {TEXT.bookmarks}: {TEXT.noBookmarks}{' '}
            </span>
          )}
          {!hasSelection && (
            <span>
              {TEXT.selected}: {TEXT.needSelection}
            </span>
          )}
        </p>
      )}

      <fieldset className="split-fields" disabled={busy}>
        {mode === 'ranges' && (
          <>
            <label htmlFor={ids.text}>{TEXT.rangesLabel}</label>
            <input
              id={ids.text}
              className="field"
              type="text"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              placeholder={TEXT.rangesPlaceholder}
              value={text}
              aria-describedby={ids.hint}
              aria-invalid={plan.errors.length > 0}
              onChange={(e) => setText(e.target.value)}
              data-autofocus
            />
            <p id={ids.hint} className="muted small">
              {TEXT.rangesHint(n)}
            </p>
            {plan.errors.length > 0 && (
              <ul className="errors" role="alert">
                {plan.errors.map((e, i) => (
                  <li key={`${e.text}:${i}`} className="field-error">
                    {describe(e)}
                  </li>
                ))}
              </ul>
            )}
            <div className="quick" role="group" aria-label={TEXT.quickAdd}>
              <span className="muted small">{TEXT.quickAdd}</span>
              <label htmlFor={ids.from}>{TEXT.from}</label>
              <input
                id={ids.from}
                className="field num"
                type="number"
                min={1}
                max={n}
                step={1}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
              <label htmlFor={ids.to}>{TEXT.to}</label>
              <input
                id={ids.to}
                className="field num"
                type="number"
                min={1}
                max={n}
                step={1}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
              <button type="button" className="btn" onClick={addRange} disabled={!quickOk}>
                {TEXT.addRange}
              </button>
            </div>
            <label className="check">
              <input type="checkbox" checked={merge} onChange={(e) => setMerge(e.target.checked)} />
              <span>{TEXT.merge}</span>
            </label>
          </>
        )}

        {mode === 'every' && (
          <>
            <label htmlFor={ids.every}>{TEXT.everyLabel}</label>
            <input
              id={ids.every}
              className="field num"
              type="number"
              min={1}
              max={Math.max(1, n)}
              step={1}
              value={every}
              onChange={(e) => setEvery(e.target.value)}
              aria-invalid={!!plan.note}
              data-autofocus
            />
            {plan.note && (
              <p className="field-error" role="alert">
                {plan.note}
              </p>
            )}
          </>
        )}

        {mode === 'bookmarks' && hasBookmarks && (
          <>
            <label htmlFor={ids.level}>{TEXT.levelLabel}</label>
            <select id={ids.level} className="field" value={level} onChange={(e) => setLevel(Number(e.target.value))} data-autofocus>
              {levelCounts.map((l) => (
                <option key={l.level} value={l.level}>
                  {TEXT.levelOption(l.level, l.files)}
                </option>
              ))}
            </select>
          </>
        )}

        {mode === 'selected' && hasSelection && <p className="modal-text">{TEXT.selectedInfo(session.selected.length)}</p>}
      </fieldset>

      <section className="preview" aria-label={TEXT.preview}>
        <h3>{TEXT.preview}</h3>
        {parts.length === 0 ? (
          <p className="muted">{mode === 'ranges' || mode === 'every' ? (plan.note ?? TEXT.previewNone) : TEXT.previewNone}</p>
        ) : (
          <>
            <ul>
              {parts.slice(0, 8).map((p) => (
                <li key={p.name}>
                  <span className="pv-name">{p.name}</span>
                  <span className="pv-label">{p.label}</span>
                </li>
              ))}
              {parts.length > 8 && <li className="pv-more">{TEXT.more(parts.length - 8)}</li>}
            </ul>
            <p className="pv-total">{TEXT.total(parts.length, totalPages)}</p>
          </>
        )}
      </section>

      {parts.length > 1 && (
        <fieldset className="output" disabled={busy}>
          <legend>{TEXT.outputGroup}</legend>
          <label className="check">
            <input type="radio" name="output" checked={output === 'zip'} onChange={() => setOutput('zip')} />
            <span>{TEXT.zip(zipName)}</span>
          </label>
          <label className="check">
            <input type="radio" name="output" checked={output === 'separate'} onChange={() => setOutput('separate')} />
            <span>{TEXT.separate}</span>
          </label>
          {output === 'separate' && <p className="muted small">⚠️ {TEXT.separateWarn}</p>}
        </fieldset>
      )}

      {progress && (
        <div
          className="progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.done}
          aria-label={TEXT.building(progress.done, progress.total)}
        >
          <div className="progress-bar" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
        </div>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      <div className="modal-foot split-foot">
        <button type="button" className="btn" onClick={stop}>
          {busy ? TEXT.stop : TEXT.cancel}
        </button>
        <button type="submit" className="btn primary" disabled={blocked} aria-live="polite">
          {progress
            ? TEXT.building(progress.done, progress.total)
            : parts.length > 1
              ? TEXT.goMany(parts.length)
              : parts.length === 1
                ? TEXT.goOne
                : TEXT.go}
        </button>
      </div>
    </form>
  );
}
