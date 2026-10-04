import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addPdfFiles,
  clearSelection,
  deleteSelected,
  moveSelectedBy,
  moveSelectedToGap,
  rotateSelected,
  selectAll,
  selectOnly,
  selectThrough,
  setFocus,
  toggleSelect,
  useOrganize,
} from '../state/organize';
import type { PageItem } from '../organize/model';
import { PageCard, VisibilityContext, devicePixelRatioClamped, type Reach, type Visibility } from './PageCard';

const TEXT = {
  list: 'Pages',
  loading: 'Preparing your pages…',
  empty: 'No pages left. Press ⌘/Ctrl+Z to bring them back, or add PDFs.',
  dropHint: 'Drop PDFs to add their pages here',
  count: (n: number) => `${n} page${n === 1 ? '' : 's'}`,
  selected: (n: number) => `${n} selected`,
  tips: 'Drag to reorder · Space selects · R turns · Delete removes · Alt+←/→ moves',
  ghost: (n: number) => `🗂️ ${n} pages`,
};

/** Marks a drag that started on one of our cards (as opposed to files coming from the desktop). */
const DRAG_TYPE = 'application/x-sticker-pages';
/** Width a card needs around its thumbnail (padding, borders and the shadow): the grid column is `size + CELL_EXTRA`. */
const CELL_EXTRA = 44;
const NEAR = '400px 0px';
const FAR = '1600px 0px';

interface Gap {
  /** Insert position (0 = before the first card). */
  index: number;
  /** Where to draw the marker, relative to the grid. */
  left: number;
  top: number;
  height: number;
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export function PagesView() {
  const phase = useOrganize((s) => s.phase);
  const items = useOrganize((s) => s.items);
  const sources = useOrganize((s) => s.sources);
  const selected = useOrganize((s) => s.selected);
  const focus = useOrganize((s) => s.focus);
  const thumb = useOrganize((s) => s.thumb);
  const busy = useOrganize((s) => s.busy);
  const scroll = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [gap, setGap] = useState<Gap | null>(null);
  const [dragging, setDragging] = useState(false);
  const internalDrag = useRef(false);
  const frame = useRef(0);
  const dpr = devicePixelRatioClamped();
  const multi = Object.keys(sources).length > 1;

  // On narrow screens the cards shrink so that two always fit side by side.
  const [areaWidth, setAreaWidth] = useState(0);
  useEffect(() => {
    const el = scroll.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAreaWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const size = areaWidth > 0 && areaWidth < 640 ? Math.max(80, Math.min(thumb, Math.floor((areaWidth - 24) / 2) - CELL_EXTRA)) : thumb;

  // One IntersectionObserver per reach, shared by every thumbnail, rooted at the scrolling area.
  const visibility = useMemo<Visibility>(() => {
    const groups: Record<Reach, { io: IntersectionObserver | null; cbs: Map<Element, (v: boolean) => void>; margin: string }> = {
      near: { io: null, cbs: new Map(), margin: NEAR },
      far: { io: null, cbs: new Map(), margin: FAR },
    };
    return {
      observe(el, reach, cb) {
        const g = groups[reach];
        g.io ??= new IntersectionObserver(
          (entries) => {
            for (const e of entries) g.cbs.get(e.target)?.(e.isIntersecting);
          },
          { root: scroll.current, rootMargin: g.margin },
        );
        g.cbs.set(el, cb);
        g.io.observe(el);
        return () => {
          g.io?.unobserve(el);
          g.cbs.delete(el);
          if (!g.cbs.size) {
            g.io?.disconnect();
            g.io = null;
          }
        };
      },
    };
  }, []);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const cellOf = (uid: string) => grid.current?.querySelector<HTMLElement>(`[data-uid="${CSS.escape(uid)}"]`) ?? null;
  const cells = () => Array.from(grid.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);

  // Keep DOM focus on the focused card after changes that move it (delete, undo, nudging pages) — but never pull it away
  // from a toolbar control the user is working with.
  useEffect(() => {
    if (!focus) return;
    const a = document.activeElement;
    const free =
      !a || a === document.body || a === scroll.current || scroll.current?.contains(a) || (a instanceof HTMLButtonElement && a.disabled);
    const el = cellOf(focus);
    if (free && el && a !== el) el.focus({ preventScroll: false });
  }, [focus, items]);

  // ── keyboard ──
  const neighbour = (dir: 'left' | 'right' | 'up' | 'down', from: string): string | null => {
    const all = cells();
    const i = all.findIndex((c) => c.dataset.uid === from);
    if (i < 0) return all[0]?.dataset.uid ?? null;
    if (dir === 'left') return all[Math.max(0, i - 1)].dataset.uid ?? null;
    if (dir === 'right') return all[Math.min(all.length - 1, i + 1)].dataset.uid ?? null;
    const r = all[i].getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const rows = all
      .map((c) => ({ c, q: c.getBoundingClientRect() }))
      .filter(({ q }) => (dir === 'down' ? q.top >= r.bottom - 1 : q.bottom <= r.top + 1))
      .map((x) => ({ ...x, dy: dir === 'down' ? x.q.top - r.bottom : r.top - x.q.bottom }));
    if (!rows.length) return null;
    const nearest = Math.min(...rows.map((x) => x.dy));
    const row = rows.filter((x) => x.dy <= nearest + 4);
    row.sort((a, b) => Math.abs(a.q.left + a.q.width / 2 - cx) - Math.abs(b.q.left + b.q.width / 2 - cx));
    return row[0].c.dataset.uid ?? null;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const s = useOrganize.getState();
    if (e.defaultPrevented || isTyping(e.target) || s.phase !== 'ready' || s.busy) return;
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key;
    const owner = (e.target as HTMLElement).closest<HTMLElement>('[role="option"]')?.dataset.uid;
    const current = owner ?? s.focus ?? s.items[0]?.uid ?? null;
    const go = (uid: string | null) => {
      if (!uid) return;
      e.preventDefault();
      if (e.shiftKey) selectThrough(uid);
      cellOf(uid)?.focus();
    };
    if (mod) {
      if (key.toLowerCase() === 'a') {
        e.preventDefault();
        selectAll();
      }
      return; // leave ⌘R, ⌘C and the rest to the browser
    }
    const arrow = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[key] as
      'left' | 'right' | 'up' | 'down' | undefined;
    if (e.altKey) {
      // Alt+arrows nudge the selected pages earlier/later (the keyboard way to drag)
      if (arrow) {
        e.preventDefault();
        moveSelectedBy(arrow === 'left' || arrow === 'up' ? -1 : 1);
      }
      return;
    }
    if (arrow) return go(current ? neighbour(arrow, current) : null);
    switch (key) {
      case 'Home':
        return go(s.items[0]?.uid ?? null);
      case 'End':
        return go(s.items[s.items.length - 1]?.uid ?? null);
      case ' ':
        if (current) {
          e.preventDefault();
          toggleSelect(current);
        }
        return;
      case 'Enter':
        if (current) {
          e.preventDefault();
          selectOnly(current);
        }
        return;
      case 'Escape':
        return clearSelection();
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        return deleteSelected();
      case 'r':
      case 'R':
        e.preventDefault();
        return rotateSelected(e.shiftKey ? -90 : 90);
    }
  };

  // ── mouse selection ──
  const onClick = (e: React.MouseEvent) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>('[role="option"]');
    if (!cell) return clearSelection(); // empty space
    const uid = cell.dataset.uid!;
    const mod = e.metaKey || e.ctrlKey;
    if (e.shiftKey) selectThrough(uid, mod);
    else if (mod) toggleSelect(uid);
    else selectOnly(uid);
  };

  // ── drag and drop: reorder our cards, or drop PDFs from the desktop ──
  /** The gap (between two cards) closest to a point, with the place to draw the marker. */
  const gapAt = (x: number, y: number): Gap | null => {
    const g = grid.current;
    if (!g) return null;
    const box = g.getBoundingClientRect();
    const all = cells();
    if (!all.length) return { index: 0, left: 8, top: 8, height: 120 };
    let best = 0;
    let bestD = Infinity;
    let bestRect = all[0].getBoundingClientRect();
    all.forEach((c, i) => {
      const r = c.getBoundingClientRect();
      const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      const d = dx * dx + dy * dy;
      if (d < bestD) [best, bestD, bestRect] = [i, d, r];
    });
    const after = x > bestRect.left + bestRect.width / 2;
    return {
      index: best + (after ? 1 : 0),
      left: (after ? bestRect.right : bestRect.left) - box.left,
      top: bestRect.top - box.top,
      height: bestRect.height,
    };
  };

  const isOurs = (e: React.DragEvent) => e.dataTransfer.types.includes(DRAG_TYPE);
  const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes('Files');

  const onDragStart = (e: React.DragEvent) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>('[role="option"]');
    const s = useOrganize.getState();
    if (!cell || s.busy || s.phase !== 'ready') return e.preventDefault();
    const uid = cell.dataset.uid!;
    // dragging a card that is not part of the selection drags just that card; dragging a selected one drags them all
    if (!s.selected.has(uid)) selectOnly(uid);
    const n = useOrganize.getState().selected.size;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(DRAG_TYPE, String(n));
    if (n > 1) {
      const ghost = document.createElement('div');
      ghost.className = 'drag-ghost';
      ghost.textContent = TEXT.ghost(n);
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 24, 18);
      setTimeout(() => ghost.remove(), 0);
    }
    internalDrag.current = true;
    // restyle after the browser has taken its drag snapshot
    setTimeout(() => internalDrag.current && setDragging(true), 0);
  };

  const onDragOver = (e: React.DragEvent) => {
    const ours = isOurs(e);
    if (!ours && !hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = ours ? 'move' : 'copy';
    const { clientX: x, clientY: y } = e;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => setGap(gapAt(x, y)));
    // scroll when the pointer is close to the top or bottom edge of the area
    const box = scroll.current?.getBoundingClientRect();
    if (box && scroll.current) {
      if (y - box.top < 56) scroll.current.scrollTop -= 18;
      else if (box.bottom - y < 56) scroll.current.scrollTop += 18;
    }
  };

  const endDrag = () => {
    cancelAnimationFrame(frame.current);
    internalDrag.current = false;
    setDragging(false);
    setGap(null);
  };

  const onDrop = (e: React.DragEvent) => {
    const ours = isOurs(e);
    if (!ours && !hasFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    const at = gapAt(e.clientX, e.clientY);
    const files = Array.from(e.dataTransfer.files);
    endDrag();
    if (!at) return;
    if (ours) moveSelectedToGap(at.index);
    else {
      const before = useOrganize.getState().items[at.index]?.uid ?? null;
      void addPdfFiles(files, before);
    }
  };

  const onDragLeave = (e: React.DragEvent) => {
    if (!scroll.current?.contains(e.relatedTarget as Node | null)) setGap(null);
  };

  const base = (it: PageItem): [number, number] => {
    if (it.kind === 'blank') return [it.width, it.height];
    const p = sources[it.src]?.pages[it.page];
    return p ? [p.width, p.height] : [612, 792];
  };

  const ready = phase === 'ready';
  const focusAt = items.findIndex((it) => it.uid === focus);
  return (
    <div
      ref={scroll}
      className={`pages-view${gap && !internalDrag.current ? ' is-dropping' : ''}`}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={endDrag}
    >
      {!ready && <p className="pages-note">{TEXT.loading}</p>}
      {ready && (
        <>
          <p className="pages-caption">
            <strong>{TEXT.count(items.length)}</strong>
            {selected.size > 0 && <span> · {TEXT.selected(selected.size)}</span>}
            <span className="tips">{TEXT.tips}</span>
          </p>
          {!items.length && <p className="pages-note">{TEXT.empty}</p>}
          <VisibilityContext.Provider value={visibility}>
            <div
              ref={grid}
              role="listbox"
              aria-label={TEXT.list}
              aria-multiselectable="true"
              aria-busy={!!busy}
              className="pgrid"
              style={{ '--t': `${size}px` } as React.CSSProperties}
              onDragStart={onDragStart}
              onFocus={(e) => {
                const uid = (e.target as HTMLElement).closest<HTMLElement>('[role="option"]')?.dataset.uid;
                if (uid) setFocus(uid);
              }}
            >
              {items.map((it, i) => {
                const [w, h] = base(it);
                return (
                  <PageCard
                    key={it.uid}
                    item={it}
                    index={i}
                    total={items.length}
                    baseW={w}
                    baseH={h}
                    source={it.kind === 'page' ? (sources[it.src] ?? null) : null}
                    showSource={multi}
                    size={size}
                    dpr={dpr}
                    selected={selected.has(it.uid)}
                    tabbable={i === Math.max(0, focusAt)}
                    dragging={dragging && selected.has(it.uid)}
                  />
                );
              })}
              {gap && <div className="drop-bar" style={{ left: gap.left, top: gap.top, height: gap.height }} aria-hidden="true" />}
            </div>
          </VisibilityContext.Provider>
          {gap && !internalDrag.current && <div className="drop-hint">{TEXT.dropHint}</div>}
        </>
      )}
    </div>
  );
}
