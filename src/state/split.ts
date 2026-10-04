/**
 * State behind the Split dialog. It always works on a *list* of pages: in Pages mode the arranged list (so reordering,
 * turning and deleting first, then splitting, works); from the editor the document as it is, taken as a snapshot source
 * that is closed again with the dialog. Positions in ranges are positions in that list (1..N as shown on screen).
 */
import { create } from 'zustand';
import type { OutlineEntry } from '../engine/api';
import { engine } from '../engine/instance';
import { itemsFromSource, outlineByPosition, positionsOf, createUidGen, type PageItem } from '../organize/model';
import { baseNameOf } from '../ui/download';
import { useOrganize } from './organize';
import { useApp } from './store';

export interface SplitSession {
  origin: 'edit' | 'pages';
  /** The open file's name without `.pdf`, the stem of every output name. */
  baseName: string;
  items: PageItem[];
  /** 0-based positions of the pages selected in the grid (always empty when opened from the editor). */
  selected: number[];
  /** The document's bookmarks as positions in `items`; entries whose page is not in the list are gone. */
  outline: OutlineEntry[];
  /** A snapshot opened just for this dialog (closed with it), or null when the Pages session owns the sources. */
  ownedSource: number | null;
}

interface SplitState {
  open: boolean;
  loading: boolean;
  error: string | null;
  session: SplitSession | null;
  /** The control that opened the dialog; it gets the focus back when the dialog closes. */
  returnFocus: HTMLElement | null;
}

export const useSplit = create<SplitState>(() => ({ open: false, loading: false, error: null, session: null, returnFocus: null }));

const uid = createUidGen('s');
let token = 0;

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const closeOwned = (id: number | null) => {
  if (id) void engine.api.closeSource(id).catch(() => {});
};

export async function openSplit(trigger?: HTMLElement | null): Promise<void> {
  const app = useApp.getState();
  if (!app.doc || useSplit.getState().open) return;
  const mine = ++token;
  useSplit.setState({ open: true, loading: true, error: null, session: null, returnFocus: trigger ?? null });
  let owned: number | null = null;
  try {
    const org = useOrganize.getState();
    let session: SplitSession;
    if (app.view === 'pages') {
      if (org.phase !== 'ready') throw new Error('the pages are still loading');
      const outline = await engine.api.outline(org.baseSrc);
      session = {
        origin: 'pages',
        baseName: baseNameOf(app.fileName),
        items: org.items,
        selected: positionsOf(org.items, org.selected),
        outline: outlineByPosition(org.items, outline, org.baseSrc),
        ownedSource: null,
      };
    } else {
      const info = await engine.api.snapshotSource(app.fileName || 'document.pdf');
      owned = info.id || null;
      if (info.needsPassword || !info.id) throw new Error('the document could not be read');
      const items = itemsFromSource(info.id, info.pages.length, uid);
      const outline = await engine.api.outline(info.id).catch(() => [] as OutlineEntry[]);
      session = {
        origin: 'edit',
        baseName: baseNameOf(app.fileName),
        items,
        selected: [],
        outline: outlineByPosition(items, outline, info.id),
        ownedSource: info.id,
      };
    }
    if (mine !== token) {
      closeOwned(owned);
      return;
    }
    useSplit.setState({ loading: false, session });
  } catch (e) {
    closeOwned(owned);
    if (mine === token) useSplit.setState({ loading: false, error: errorText(e) });
  }
}

/** Closes the dialog and frees the snapshot it opened. Safe to call twice. */
export function closeSplit(): void {
  token++;
  closeOwned(useSplit.getState().session?.ownedSource ?? null);
  useSplit.setState({ open: false, loading: false, error: null, session: null });
  // `returnFocus` stays set until the next open so the dialog can still read it while it unmounts
}
