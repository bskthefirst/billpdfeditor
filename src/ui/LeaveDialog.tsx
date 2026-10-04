import { resolveGuard, useOrganize } from '../state/organize';
import { Modal } from './Modal';

const TEXT = {
  title: 'Apply your page changes?',
  body: 'You rearranged, added or removed pages, but the document itself has not changed yet.',
  apply: '✅ Apply changes',
  applying: 'Applying…',
  discard: 'Discard changes',
  keep: 'Keep editing',
};

/** Asks what to do with unapplied page changes before leaving Pages mode, opening another file or closing the document. */
export function LeaveDialog() {
  const guard = useOrganize((s) => s.guard);
  const applying = useOrganize((s) => s.busy === 'applying');
  if (!guard) return null;
  return (
    <Modal
      title={TEXT.title}
      width={540}
      hideClose
      onClose={() => !applying && void resolveGuard('keep')}
      footer={
        <>
          <button className="btn" onClick={() => void resolveGuard('keep')} disabled={applying}>
            {TEXT.keep}
          </button>
          <button className="btn danger" onClick={() => void resolveGuard('discard')} disabled={applying}>
            {TEXT.discard}
          </button>
          <button className="btn accent" data-autofocus onClick={() => void resolveGuard('apply')} disabled={applying}>
            {applying ? TEXT.applying : TEXT.apply}
          </button>
        </>
      }
    >
      <p className="modal-text">{TEXT.body}</p>
    </Modal>
  );
}
