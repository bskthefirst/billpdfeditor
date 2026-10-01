import { engine } from '../engine/instance';
import { useApp } from './store';

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
