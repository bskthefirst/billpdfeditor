import { useRef } from 'react';
import { redoCommand, undoCommand } from '../state/actions';
import {
  THUMB_MAX,
  THUMB_MIN,
  addPdfFiles,
  applyPages,
  canApply,
  deleteSelected,
  discardPages,
  duplicateSelected,
  insertBlankPage,
  moveSelectedBy,
  rotateSelected,
  setThumbSize,
  useOrganize,
} from '../state/organize';

const TEXT = {
  group: 'Page tools',
  rotateLeft: 'Rotate left',
  rotateLeftTip: 'Turn the selected pages left (⇧R)',
  rotateRight: 'Rotate right',
  rotateRightTip: 'Turn the selected pages right (R)',
  delete: '🗑️ Delete',
  deleteTip: 'Remove the selected pages (Delete)',
  duplicate: '📑 Duplicate',
  duplicateTip: 'Copy the selected pages right after them',
  blank: '➕ Blank page',
  blankTip: 'Insert a blank page after the selection (or at the end), the size of the page before it',
  earlier: '◀ Earlier',
  earlierTip: 'Move the selected pages one place earlier (Alt+←)',
  later: 'Later ▶',
  laterTip: 'Move the selected pages one place later (Alt+→)',
  add: '📥 Add PDFs…',
  addTip: 'Add the pages of other PDFs (you can also drop PDF files onto the grid)',
  undo: 'Undo',
  undoTip: 'Undo the last page change (⌘Z)',
  redo: 'Redo',
  redoTip: 'Redo (⇧⌘Z)',
  size: 'Thumbnail size',
  discard: 'Discard',
  discardTip: 'Leave without changing the document',
  apply: '✅ Apply changes',
  applyTip: 'Put the new page order into the document',
  applyDisabledTip: 'Change something first: rotate, delete, reorder or add pages',
  applying: 'Applying…',
};

/** The page actions of Pages mode (second toolbar row). */
export function PagesToolbar() {
  const phase = useOrganize((s) => s.phase);
  const busy = useOrganize((s) => s.busy);
  const hasSelection = useOrganize((s) => s.selected.size > 0);
  const canUndo = useOrganize((s) => s.past.length > 0);
  const canRedo = useOrganize((s) => s.future.length > 0);
  const apply = useOrganize((s) => canApply(s));
  const thumb = useOrganize((s) => s.thumb);
  const picker = useRef<HTMLInputElement>(null);

  const idle = phase === 'ready' && !busy;
  const needSel = !idle || !hasSelection;

  return (
    <div className="toolrow" role="toolbar" aria-label={TEXT.group}>
      <div className="group">
        <button
          className="btn icon"
          onClick={() => rotateSelected(-90)}
          disabled={needSel}
          aria-label={TEXT.rotateLeft}
          title={TEXT.rotateLeftTip}
        >
          ↺
        </button>
        <button
          className="btn icon"
          onClick={() => rotateSelected(90)}
          disabled={needSel}
          aria-label={TEXT.rotateRight}
          title={TEXT.rotateRightTip}
        >
          ↻
        </button>
      </div>
      <div className="group">
        <button className="btn" onClick={deleteSelected} disabled={needSel} title={TEXT.deleteTip}>
          {TEXT.delete}
        </button>
        <button className="btn" onClick={duplicateSelected} disabled={needSel} title={TEXT.duplicateTip}>
          {TEXT.duplicate}
        </button>
        <button className="btn" onClick={insertBlankPage} disabled={!idle} title={TEXT.blankTip}>
          {TEXT.blank}
        </button>
      </div>
      <div className="group seg" role="group" aria-label="Move">
        <button onClick={() => moveSelectedBy(-1)} disabled={needSel} title={TEXT.earlierTip}>
          {TEXT.earlier}
        </button>
        <button onClick={() => moveSelectedBy(1)} disabled={needSel} title={TEXT.laterTip}>
          {TEXT.later}
        </button>
      </div>
      <div className="group">
        <button className="btn" onClick={() => picker.current?.click()} disabled={!idle} title={TEXT.addTip}>
          {TEXT.add}
        </button>
        <input
          ref={picker}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = ''; // so picking the same file again still fires
            if (files.length) void addPdfFiles(files);
          }}
        />
      </div>
      <div className="group">
        <button className="btn icon" onClick={undoCommand} disabled={!idle || !canUndo} aria-label={TEXT.undo} title={TEXT.undoTip}>
          ↩
        </button>
        <button className="btn icon" onClick={redoCommand} disabled={!idle || !canRedo} aria-label={TEXT.redo} title={TEXT.redoTip}>
          ↪
        </button>
      </div>
      <label className="size" title={TEXT.size}>
        <span aria-hidden="true">🔍</span>
        <input
          type="range"
          min={THUMB_MIN}
          max={THUMB_MAX}
          step={10}
          value={thumb}
          aria-label={TEXT.size}
          onChange={(e) => setThumbSize(Number(e.target.value))}
        />
      </label>
      <div className="group end">
        <button className="btn" onClick={discardPages} disabled={busy === 'applying'} title={TEXT.discardTip}>
          {TEXT.discard}
        </button>
        <button
          className="btn accent"
          onClick={() => void applyPages()}
          disabled={!apply}
          title={apply ? TEXT.applyTip : TEXT.applyDisabledTip}
        >
          {busy === 'applying' ? TEXT.applying : TEXT.apply}
        </button>
      </div>
    </div>
  );
}
