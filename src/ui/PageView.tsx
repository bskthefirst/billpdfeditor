import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PageInfo, RenderedPage, LineInfo } from '../engine/api';
import { engine } from '../engine/instance';
import { useApp } from '../state/store';
import { apply, caretIndexAt, caretSegment, invert, pointInQuad, scaleMat, spanQuad, type Pt } from './geometry';

const poly = (q: Pt[]) => q.map((p) => p.join(',')).join(' ');
const DRAG_THRESHOLD = 4;

export function PageView({ info }: { info: PageInfo }) {
  const zoom = useApp((s) => s.zoom);
  const revision = useApp((s) => s.revision);
  const tool = useApp((s) => s.tool);
  const active = useApp((s) => s.active);
  const selection = useApp((s) => s.selection);
  const { setActive, setStatus, setSelection } = useApp.getState();

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [lines, setLines] = useState<LineInfo[] | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [sel, setSel] = useState({ a: 0, b: 0 });
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  const toCss = useMemo(() => scaleMat(info.toDevice, zoom), [info, zoom]);

  useEffect(() => {
    const el = wrapRef.current!;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '700px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // ── raster: coalesce requests so fast typing never queues stale renders ──
  const latest = useRef({ zoom, dpr });
  latest.current = { zoom, dpr };
  const busy = useRef(false);
  const again = useRef(false);
  const draw = useCallback((r: RenderedPage) => {
    const c = canvasRef.current;
    if (!c) return;
    if (c.width !== r.width || c.height !== r.height) {
      c.width = r.width;
      c.height = r.height;
    }
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(r.data), r.width, r.height), 0, 0);
  }, []);
  const requestRender = useCallback(() => {
    if (busy.current) {
      again.current = true;
      return;
    }
    busy.current = true;
    void (async () => {
      try {
        do {
          again.current = false;
          const { zoom: z, dpr: d } = latest.current;
          draw(await engine.api.render(info.index, z * d));
        } while (again.current);
      } catch (e) {
        console.error('[render] failed', e);
        useApp.getState().setStatus(`Could not draw page ${info.index + 1}: ${e instanceof Error ? e.message : e}`, 'error');
      } finally {
        busy.current = false;
      }
    })();
  }, [draw, info.index]);
  useEffect(() => {
    if (visible) requestRender();
  }, [visible, zoom, revision, dpr, requestRender]);

  // ── text lines (geometry for hit testing and caret placement) ──
  useEffect(() => {
    if (!visible || tool !== 'edit') return;
    let cancelled = false;
    void engine.api.getLines(info.index).then((r) => {
      if (!cancelled) setLines(r);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, revision, tool, info.index]);

  const activeLine = active && active.page === info.index ? lines?.find((r) => r.id === active.lineId) : undefined;

  const toUser = (clientX: number, clientY: number): { css: Pt; user: Pt } => {
    const r = wrapRef.current!.getBoundingClientRect();
    const css: Pt = [clientX - r.left, clientY - r.top];
    return { css, user: apply(invert(toCss), css[0], css[1]) };
  };

  const pickLine = (css: Pt): LineInfo | null => {
    let best: LineInfo | null = null;
    let bestArea = Infinity;
    for (const line of lines ?? []) {
      if (!line.glyphs.length) continue;
      const q = spanQuad(line, 0, line.glyphs.length, toCss);
      if (!pointInQuad(q, css[0], css[1])) continue;
      const area = Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]) * Math.hypot(q[3][0] - q[0][0], q[3][1] - q[0][1]);
      if (area < bestArea) [best, bestArea] = [line, area];
    }
    return best;
  };

  // ── pointer model ──
  // pointerdown records the gesture; moving past a threshold turns it into a text selection (PDFium's reading order),
  // while a plain click in Edit mode opens the editor on pointerup.
  const gesture = useRef<{ x: number; y: number; anchor: Promise<number>; dragging: boolean; clicks: number } | null>(null);
  const moveSeq = useRef(0);
  // PointerEvent.detail is always 0, so count multi-clicks ourselves
  const lastClick = useRef({ t: 0, x: 0, y: 0, n: 0 });

  const selectBetween = async (a: number, b: number) => {
    const s = await engine.api.select(info.index, a, b);
    setSelection(s.count ? s : null);
  };

  const onPointerDown = async (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const { css, user } = toUser(e.clientX, e.clientY);
    // the anchor is a promise: a fast drag can start moving before PDFium has answered
    const lc = lastClick.current;
    const clicks = e.timeStamp - lc.t < 450 && Math.hypot(e.clientX - lc.x, e.clientY - lc.y) < 6 ? lc.n + 1 : 1;
    lastClick.current = { t: e.timeStamp, x: e.clientX, y: e.clientY, n: clicks };
    const g = { x: e.clientX, y: e.clientY, anchor: engine.api.hitChar(info.index, user[0], user[1]), dragging: false, clicks };
    gesture.current = g;
    wrapRef.current!.setPointerCapture(e.pointerId);
    setSelection(null);
    if (tool === 'edit') e.preventDefault();
    const anchor = await g.anchor;
    if (clicks >= 2 && anchor >= 0 && tool === 'select') {
      const s = await engine.api.expandSelection(info.index, anchor, clicks >= 3 ? 'line' : 'word');
      setSelection(s.count ? s : null);
      g.dragging = true; // a word/line selection is not a click
    }
    void css;
  };

  const onPointerMove = async (e: React.PointerEvent) => {
    const g = gesture.current;
    const { css, user } = toUser(e.clientX, e.clientY);
    if (!g) {
      if (tool === 'edit') setHover(pickLine(css)?.id ?? null);
      return;
    }
    if (!g.dragging && Math.hypot(e.clientX - g.x, e.clientY - g.y) < DRAG_THRESHOLD) return;
    if (g.clicks >= 2) return;
    g.dragging = true;
    if (tool === 'edit') {
      setActive(null);
      setHover(null);
    }
    const seq = ++moveSeq.current;
    const [anchor, idx] = await Promise.all([g.anchor, engine.api.hitChar(info.index, user[0], user[1])]);
    if (seq !== moveSeq.current || anchor < 0 || idx < 0) return;
    await selectBetween(anchor, idx);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.dragging || tool !== 'edit') return;
    const { css, user } = toUser(e.clientX, e.clientY);
    const run = pickLine(css);
    if (!run) {
      setActive(null);
      return;
    }
    if (!run.editable) {
      setStatus(`Can't edit this text: ${run.reason ?? 'unsupported'}`, 'warn');
      setActive(null);
      return;
    }
    const caret = caretIndexAt(run, user[0], user[1]);
    let selEnd: number | undefined;
    let from = caret;
    if (g.clicks >= 3) [from, selEnd] = [0, run.text.length];
    else if (g.clicks === 2) {
      const isWord = (c: string) => /[\p{L}\p{N}\p{M}_'’-]/u.test(c);
      const t = Array.from(run.text);
      let a = Math.min(caret, t.length - 1);
      if (a >= 0 && !isWord(t[a]) && a > 0 && isWord(t[a - 1])) a--;
      let b = a;
      while (a > 0 && isWord(t[a - 1])) a--;
      while (b < t.length && isWord(t[b])) b++;
      [from, selEnd] = [a, Math.max(b, a)];
    }
    setActive({ page: info.index, lineId: run.id, caret: from, selEnd });
    setStatus(`${run.font.name || 'font'} · ${run.size.toFixed(1)} pt${run.font.embedded ? '' : ' · not embedded'} — type to edit`, 'info');
  };

  const editReady = tool === 'edit' && lines !== null;
  const hoverLine = hover && hover !== active?.lineId ? lines?.find((r) => r.id === hover) : undefined;
  const caretSeg = activeLine ? caretSegment(activeLine, Math.min(sel.b, activeLine.glyphs.length), toCss) : null;
  const selQuad =
    activeLine && sel.a !== sel.b
      ? spanQuad(activeLine, Math.min(sel.a, sel.b), Math.min(Math.max(sel.a, sel.b), activeLine.glyphs.length), toCss)
      : null;
  const pageSel = selection && selection.page === info.index ? selection : null;

  return (
    <div
      ref={wrapRef}
      className="page"
      data-page={info.index}
      style={{ width: info.width * zoom, height: info.height * zoom, cursor: tool === 'edit' ? (hover ? 'text' : 'default') : 'text' }}
      onPointerMove={(e) => void onPointerMove(e)}
      onPointerLeave={() => setHover(null)}
      onPointerDown={(e) => void onPointerDown(e)}
      onPointerUp={onPointerUp}
    >
      <canvas ref={canvasRef} className="page-canvas" style={{ width: '100%', height: '100%' }} />
      <span className="page-number">{info.index + 1}</span>
      <svg className="page-overlay" width="100%" height="100%">
        {pageSel?.rects.map((r, i) => (
          <polygon
            key={i}
            className="text-selection"
            points={poly(
              (
                [
                  [r[0], r[1]],
                  [r[2], r[1]],
                  [r[2], r[3]],
                  [r[0], r[3]],
                ] as Pt[]
              ).map((p) => apply(toCss, p[0], p[1])),
            )}
          />
        ))}
        {hoverLine && <polygon className="run-hover" points={poly(spanQuad(hoverLine, 0, hoverLine.glyphs.length, toCss))} />}
        {activeLine && <polygon className="run-active" points={poly(spanQuad(activeLine, 0, activeLine.glyphs.length, toCss))} />}
        {selQuad && <polygon className="run-selection" points={poly(selQuad)} />}
        {caretSeg && sel.a === sel.b && (
          <line
            key={`${sel.b}:${activeLine?.text}`}
            className="caret"
            x1={caretSeg[0][0]}
            y1={caretSeg[0][1]}
            x2={caretSeg[1][0]}
            y2={caretSeg[1][1]}
          />
        )}
      </svg>
      {activeLine && (
        <Editor
          key={activeLine.id}
          run={activeLine}
          toCss={toCss}
          zoom={zoom}
          initialSel={[active!.caret, active!.selEnd ?? active!.caret]}
          onSel={(a, b) => setSel({ a, b })}
        />
      )}
      {visible && tool === 'edit' && !editReady && <span className="page-hint">Preparing text…</span>}
    </div>
  );
}

function Editor({
  run,
  toCss,
  zoom,
  initialSel,
  onSel,
}: {
  run: LineInfo;
  toCss: ReturnType<typeof scaleMat>;
  zoom: number;
  initialSel: [number, number];
  onSel: (a: number, b: number) => void;
}) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const good = useRef(run.text);
  const composing = useRef(false);
  const setRevision = useApp((s) => s.setRevision);
  const setStatus = useApp((s) => s.setStatus);
  const setActive = useApp((s) => s.setActive);
  const setHistory = useApp((s) => s.setHistory);
  const revision = useApp((s) => s.revision);
  const localRev = useRef(-1);
  const seg = caretSegment(run, 0, toCss);

  // Undo/redo (or any change we did not make ourselves) must show up in the textarea; our own typing must not be overwritten
  // by the slightly older text the engine echoes back.
  useEffect(() => {
    const t = ta.current;
    if (!t || composing.current || revision === localRev.current || t.value === run.text) return;
    const pos = Math.min(t.selectionStart, run.text.length);
    t.value = run.text;
    t.setSelectionRange(pos, pos);
    good.current = run.text;
    onSel(pos, pos);
  }, [revision, run.text, onSel]);

  useLayoutEffect(() => {
    const t = ta.current!;
    t.value = run.text;
    t.setSelectionRange(initialSel[0], initialSel[1]);
    t.focus({ preventScroll: true });
    onSel(initialSel[0], initialSel[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const h = () => {
      const t = ta.current;
      if (t && document.activeElement === t) onSel(t.selectionStart, t.selectionEnd);
    };
    document.addEventListener('selectionchange', h);
    return () => document.removeEventListener('selectionchange', h);
  }, [onSel]);

  const commit = async () => {
    const t = ta.current!;
    const v = t.value;
    const res = await engine.api.setLineText(run.id, v);
    setHistory(res);
    if (res.ok) {
      good.current = v;
      localRev.current = res.revision;
      setRevision(res.revision);
      const subs = res.substitutions;
      setStatus(
        subs?.length
          ? `“${subs.map((x) => x.text).join('')}” is drawn with ${[...new Set(subs.map((x) => x.font))].join(' + ')} (${subs[0].note}) because the original font file doesn't include those letters.`
          : 'Edited — the preview is the real render of the saved file.',
        subs?.length ? 'info' : 'ok',
      );
    } else {
      const pos = Math.max(0, t.selectionStart - (v.length - good.current.length));
      t.value = good.current;
      t.setSelectionRange(pos, pos);
      onSel(pos, pos);
      setStatus(
        res.missing?.length
          ? `No available font can draw “${res.missing.join('')}”, so the text was left as it was.`
          : `Can't apply that edit: ${res.error ?? 'unknown error'}`,
        'warn',
      );
    }
  };

  return (
    <textarea
      ref={ta}
      className="run-input"
      aria-label="Edit text"
      spellCheck={false}
      autoCapitalize="off"
      autoComplete="off"
      wrap="off"
      rows={1}
      style={{ left: seg[0][0], top: seg[1][1], height: Math.max(12, run.size * zoom * 1.2), fontSize: Math.max(10, run.size * zoom) }}
      onInput={() => {
        if (!composing.current) void commit();
      }}
      onCompositionStart={() => (composing.current = true)}
      onCompositionEnd={() => {
        composing.current = false;
        void commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();
          setActive(null);
        }
      }}
    />
  );
}
