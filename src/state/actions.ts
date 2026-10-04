import { engine } from '../engine/instance';
import { baseNameOf, downloadBytes } from '../ui/download';
import { endSession, enterPages, guardUnapplied, leavePages, redoPages, undoPages, useOrganize } from './organize';
import { useApp, type View } from './store';
import { openWithPassword } from './unlock';

// ───────────────────────────── undo / redo ─────────────────────────────

/** Text-edit undo. Pages mode has its own history (see `undoCommand`). */
export async function undo(): Promise<void> {
  const r = await engine.api.undo();
  const s = useApp.getState();
  s.setHistory(r);
  if (r.ok) {
    s.setRevision(r.revision);
    s.setStatus('Undid the last edit.', 'ok');
  }
}

export async function redo(): Promise<void> {
  const r = await engine.api.redo();
  const s = useApp.getState();
  s.setHistory(r);
  if (r.ok) {
    s.setRevision(r.revision);
    s.setStatus('Redid the edit.', 'ok');
  }
}

/** ⌘Z: acts on the page list in Pages mode and on the text editor otherwise. */
export function undoCommand(): void {
  if (useApp.getState().view === 'pages') undoPages();
  else void undo();
}

export function redoCommand(): void {
  if (useApp.getState().view === 'pages') redoPages();
  else void redo();
}

// ───────────────────────────── opening ─────────────────────────────

/** Loads a PDF into the editor (asking for a password when needed). Returns whether it was opened. */
export async function openDocument(buf: ArrayBuffer, name: string): Promise<boolean> {
  const app = useApp.getState();
  app.setStatus('Opening…');
  try {
    const res = await openWithPassword(buf, name, (bytes, pw) => engine.api.open(bytes, pw));
    if (res.status === 'cancelled') {
      app.setStatus('Open cancelled — the PDF needs a password.', 'warn');
      return false;
    }
    if (res.status === 'wrong-password') {
      app.setStatus('That password did not open the PDF.', 'error');
      return false;
    }
    const info = res.info;
    // a page grid that was open belonged to the previous document
    endSession();
    useApp.getState().setView('edit');
    useApp.getState().setDoc(name, info);
    const pages = `${info.pages.length} page${info.pages.length === 1 ? '' : 's'} loaded`;
    useApp
      .getState()
      .setStatus(
        info.decrypted
          ? `${pages}. This PDF was protected${info.restricted ? ' and its author restricted editing' : ''}; edits are saved to an unprotected copy, so only edit documents you are allowed to change.`
          : `${pages}${info.repaired ? ' (file structure was repaired)' : ''}. Click any text to edit it.`,
        info.restricted ? 'warn' : 'ok',
      );
    return true;
  } catch (e) {
    useApp.getState().setStatus(`Could not open this PDF: ${e instanceof Error ? e.message : e}`, 'error');
    return false;
  }
}

/** Opens a file the user picked or dropped, after asking what to do with unapplied page changes. */
export function openFile(file: File): void {
  if (useOrganize.getState().busy) return;
  guardUnapplied(async () => {
    await openDocument(await file.arrayBuffer(), file.name);
  });
}

export function openSample(file: string): void {
  if (useOrganize.getState().busy) return;
  guardUnapplied(async () => {
    const res = await fetch(`./samples/${file}`);
    await openDocument(await res.arrayBuffer(), file);
  });
}

// ───────────────────────────── views ─────────────────────────────

export function switchView(view: View): void {
  const app = useApp.getState();
  if (view === app.view || !app.doc) return;
  if (view === 'pages') void enterPages();
  else leavePages();
}

// ───────────────────────────── saving ─────────────────────────────

/** Incremental save: the original bytes plus an appended update, so nothing but the edited text changes. */
export async function saveEdited(): Promise<void> {
  const app = useApp.getState();
  try {
    const bytes = await engine.api.save();
    downloadBytes(bytes, `${baseNameOf(app.fileName)}-edited.pdf`);
    app.setStatus('Saved. Only the edited text was rewritten; everything else is byte-identical.', 'ok');
  } catch (e) {
    app.setStatus(`Could not save: ${e instanceof Error ? e.message : e}`, 'error');
  }
}

/** Rebuilds the file page by page into a fresh single-revision PDF, so nothing of earlier versions of edited text stays inside. */
export async function saveClean(): Promise<void> {
  const app = useApp.getState();
  app.setStatus('Building a clean copy…');
  let snapshotId = 0;
  try {
    const info = await engine.api.snapshotSource(app.fileName || 'document.pdf');
    snapshotId = info.id;
    if (info.needsPassword || !info.id) throw new Error('the document could not be read');
    const bytes = await engine.api.buildPdf(
      info.pages.map((_, page) => ({ kind: 'page' as const, src: info.id, page })),
      { bookmarks: true },
    );
    const name = `${baseNameOf(app.fileName)}-clean.pdf`;
    downloadBytes(bytes, name);
    app.setStatus(
      `Saved ${name}: the file was rebuilt page by page, so older versions of edited text are no longer inside it. Any digital signature no longer applies to this copy.`,
      'ok',
    );
  } catch (e) {
    app.setStatus(`Could not save a clean copy: ${e instanceof Error ? e.message : e}`, 'error');
  } finally {
    if (snapshotId) void engine.api.closeSource(snapshotId).catch(() => {});
  }
}

// ───────────────────────────── undo after Apply ─────────────────────────────

/** Puts the document back the way it was before the last Apply in Pages mode (one level). */
export async function undoPageChanges(): Promise<void> {
  const app = useApp.getState();
  const pre = app.preApply;
  if (!pre || app.view !== 'edit') return;
  try {
    // keep our copy until the engine has accepted the other one
    const res = await engine.api.open(pre.bytes.slice(0));
    if (res.needsPassword) throw new Error('the earlier version could not be reopened');
    useApp.getState().setDoc(app.fileName, res, { dirty: pre.dirty });
    useApp.getState().setStatus('Went back to the document as it was before the page changes. Text undo starts over from here.', 'ok');
  } catch (e) {
    useApp.getState().setStatus(`Could not undo the page changes: ${e instanceof Error ? e.message : e}`, 'error');
  }
}
