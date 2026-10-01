import { create } from 'zustand';
import type { DocInfo, TextSelection } from '../engine/api';

export type Tool = 'select' | 'edit';
export type StatusKind = 'info' | 'warn' | 'error' | 'ok';

interface AppState {
  fileName: string;
  doc: DocInfo | null;
  /** CSS pixels per PDF point. */
  zoom: number;
  tool: Tool;
  /** Bumped by the engine on each document change; pages re-render when it changes. */
  revision: number;
  active: { page: number; lineId: string; caret: number; selEnd?: number } | null;
  selection: TextSelection | null;
  status: { text: string; kind: StatusKind };
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  setHistory: (h: { canUndo?: boolean; canRedo?: boolean }) => void;
  setDoc: (name: string, doc: DocInfo) => void;
  setZoom: (z: number) => void;
  setTool: (t: Tool) => void;
  setRevision: (r: number, dirty?: boolean) => void;
  setActive: (a: AppState['active']) => void;
  setSelection: (s: TextSelection | null) => void;
  setStatus: (text: string, kind?: StatusKind) => void;
}

export const useApp = create<AppState>((set) => ({
  fileName: '',
  doc: null,
  zoom: 1.25,
  tool: 'edit',
  revision: 0,
  active: null,
  selection: null,
  status: { text: 'Open a PDF to start.', kind: 'info' },
  dirty: false,
  canUndo: false,
  canRedo: false,
  setHistory: (h) => set((s) => ({ canUndo: h.canUndo ?? s.canUndo, canRedo: h.canRedo ?? s.canRedo })),
  setDoc: (fileName, doc) =>
    set({ fileName, doc, revision: 0, active: null, selection: null, dirty: false, canUndo: false, canRedo: false }),
  setZoom: (zoom) => set({ zoom: Math.min(4, Math.max(0.25, zoom)) }),
  setTool: (tool) => set({ tool, active: null, selection: null }),
  setRevision: (revision, dirty = true) => set((s) => ({ revision, dirty: dirty || s.dirty, selection: null })),
  setActive: (active) => set({ active }),
  setSelection: (selection) => set({ selection }),
  setStatus: (text, kind = 'info') => set({ status: { text, kind } }),
}));
