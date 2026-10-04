import { useEffect, useId, useRef, useState } from 'react';
import { saveClean, saveEdited } from '../state/actions';

const TEXT = {
  save: '💾 Save',
  more: 'More ways to save',
  menu: 'Save options',
  incremental: '💾 Save',
  incrementalNote: 'Keeps your file byte-for-byte and adds only the edited text, so digital signatures stay valid.',
  clean: '🧼 Save clean copy',
  cleanNote: 'Rebuilds the file page by page. Older versions of edited text are removed from it; digital signatures no longer apply.',
  blocked: 'Apply or discard your page changes first',
};

/** "💾 Save" with a small menu for the other way to save: a clean copy rebuilt from scratch. */
export function SaveMenu({ disabled, dirty, blocked }: { disabled: boolean; dirty: boolean; blocked?: boolean }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const off = disabled || !!blocked;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    wrap.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open]);

  useEffect(() => {
    if (off) setOpen(false);
  }, [off]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    const items = [...(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      toggle.current?.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    } else if (e.key === 'Tab') setOpen(false);
  };

  const run = (action: () => Promise<void>) => {
    setOpen(false);
    toggle.current?.focus();
    void action();
  };

  return (
    <div className="group splitbtn" ref={wrap} onKeyDown={open ? onMenuKey : undefined}>
      <button
        className="btn accent main"
        onClick={() => void saveEdited()}
        disabled={off}
        title={blocked ? TEXT.blocked : TEXT.incrementalNote}
      >
        {TEXT.save}
        {dirty ? ' •' : ''}
      </button>
      <button
        ref={toggle}
        className="btn accent more"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={TEXT.more}
        title={blocked ? TEXT.blocked : TEXT.more}
        disabled={off}
        onClick={() => setOpen((o) => !o)}
      >
        ▾
      </button>
      {open && (
        <div className="menu" id={menuId} role="menu" aria-label={TEXT.menu}>
          <button role="menuitem" className="menu-item" onClick={() => run(saveEdited)}>
            <strong>{TEXT.incremental}</strong>
            <span>{TEXT.incrementalNote}</span>
          </button>
          <button role="menuitem" className="menu-item" onClick={() => run(saveClean)}>
            <strong>{TEXT.clean}</strong>
            <span>{TEXT.cleanNote}</span>
          </button>
        </div>
      )}
    </div>
  );
}
