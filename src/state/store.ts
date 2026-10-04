import { create } from 'zustand';
import type { DocInfo, TextSelection } from '../engine/api';

export type Tool = 'select' | 'edit';
/** `edit` = the document with its text editor, `pages` = the page grid (reorder, rotate, delete, add, merge). */
export type View = 'edit' | 'pages';
export type StatusKind = 'info' | 'warn' | 'error' | 'ok';

/** The document as it was just before pages were rearranged, so that one "Undo page changes" can bring it back. */
export interface PreApply {
  bytes: ArrayBuffer;
  /** Whether the document had unsaved edits at that moment. */
  dirty: boolean;
}

interface AppState {
  fileName: string;
  doc: DocInfo | null;
  /** Bumped every time a different document is loaded into the engine (open, apply, undo page changes). Page views are keyed by it. */
  generation: number;
  view: View;
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
  preApply: PreApply | null;
  setHistory: (h: { canUndo?: boolean; canRedo?: boolean }) => void;
  /** Loads a document into the UI state. `dirty` says whether it has changes that were not downloaded yet. */
  setDoc: (name: string, doc: DocInfo, opts?: { dirty?: boolean }) => void;
  setView: (v: View) => void;
  setPreApply: (p: PreApply | null) => void;
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
  generation: 0,
  view: 'edit',
  zoom: 1.25,
  tool: 'edit',
  revision: 0,
  active: null,
  selection: null,
  status: { text: 'Open a PDF to start.', kind: 'info' },
  dirty: false,
  canUndo: false,
  canRedo: false,
  preApply: null,
  setHistory: (h) => set((s) => ({ canUndo: h.canUndo ?? s.canUndo, canRedo: h.canRedo ?? s.canRedo })),
  setDoc: (fileName, doc, opts) =>
    set((s) => ({
      fileName,
      doc,
      generation: s.generation + 1,
      revision: 0,
      active: null,
      selection: null,
      dirty: opts?.dirty ?? false,
      canUndo: false,
      canRedo: false,
      preApply: null,
    })),
  setView: (view) => set((s) => (s.view === view ? s : { view, active: null, selection: null })),
  setPreApply: (preApply) => set({ preApply }),
  setZoom: (zoom) => set({ zoom: Math.min(4, Math.max(0.25, zoom)) }),
  setTool: (tool) => set({ tool, active: null, selection: null }),
  // a text edit (or its undo/redo) moves the document on, so "Undo page changes" would no longer be a faithful way back
  setRevision: (revision, dirty = true) => set((s) => ({ revision, dirty: dirty || s.dirty, selection: null, preApply: null })),
  setActive: (active) => set({ active }),
  setSelection: (selection) => set({ selection }),
  setStatus: (text, kind = 'info') => set({ status: { text, kind } }),
}));
