import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const TEXT = { close: 'Close' };

/** How many modals are open; the app behind them is made inert while any is. */
let open = 0;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function setBackgroundInert(on: boolean) {
  const root = document.getElementById('root');
  if (!root) return;
  // `inert` takes the app out of the tab order and the accessibility tree while a dialog is open
  if (on) root.setAttribute('inert', '');
  else root.removeAttribute('inert');
}

interface ModalProps {
  title: ReactNode;
  /** Called for Esc, the close button and a click on the backdrop. */
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Dialog width in CSS pixels (it never exceeds the screen). */
  width?: number;
  /** Hide the ✕ button (for questions that must be answered with one of the footer buttons). */
  hideClose?: boolean;
  /** Where focus goes when the dialog closes; defaults to whatever had focus when it opened. */
  restoreFocus?: HTMLElement | null;
}

/**
 * A modal dialog: focus moves into it (to the first `[data-autofocus]` element, else the first control), Tab stays inside,
 * Esc closes it, and focus goes back to where it was when it closes. The rest of the page is inert meanwhile.
 */
export function Modal({ title, onClose, children, footer, width = 560, hideClose, restoreFocus }: ModalProps) {
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const previous = restoreFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    open++;
    setBackgroundInert(true);
    const el = box.current!;
    const first = el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>(FOCUSABLE) ?? el;
    first.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null || n === document.activeElement);
      if (!items.length) {
        e.preventDefault();
        el.focus();
        return;
      }
      const a = document.activeElement;
      const last = items[items.length - 1];
      if (!el.contains(a)) {
        e.preventDefault();
        items[0].focus();
      } else if (e.shiftKey && (a === items[0] || a === el)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && a === last) {
        e.preventDefault();
        items[0].focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (--open <= 0) {
        open = 0;
        setBackgroundInert(false);
      }
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <div
      className="modal-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close.current();
      }}
    >
      <div ref={box} className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} style={{ maxWidth: width }}>
        <header className="modal-head">
          <h2 id={titleId}>{title}</h2>
          {!hideClose && (
            <button
              type="button"
              className="btn icon"
              aria-label={TEXT.close}
              title={`${TEXT.close} (Esc)`}
              onClick={() => close.current()}
            >
              ✕
            </button>
          )}
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
