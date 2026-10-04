import { createContext, memo, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import type { PageItem } from '../organize/model';
import type { SourceMeta } from '../state/organize';
import { thumbs, type Thumb, type ThumbRequest } from './thumbs';

const TEXT = {
  blank: 'Blank',
  failed: 'Could not draw this page',
  page: (n: number, total: number) => `Page ${n} of ${total}`,
  from: (name: string, page: number) => `from ${name}, page ${page}`,
  turned: (deg: number) => `turned ${deg} degrees`,
  blankPage: 'blank page',
  tip: (name: string, page: number) => `${name} · page ${page}`,
  tipBlank: 'New blank page',
};

// ───────────────────────────── layout ─────────────────────────────

/** Tall pages never get taller than this many card widths. */
const MAX_ASPECT = 1.5;
/** Thumbnails are drawn at one of these widths and scaled by CSS, so dragging the size slider does not re-render everything. */
const BUCKETS = [128, 176, 224, 272];

export interface Fit {
  /** Outer box of the card as shown (after the turn). */
  boxW: number;
  boxH: number;
  /** The page image before the turn; it is rotated around its centre inside the box. */
  imgW: number;
  imgH: number;
}

/** Fits a page of w×h points (before the turn) into a card of width `t`, turned sideways or not. */
export function fitCard(width: number, height: number, sideways: boolean, t: number): Fit {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const [rw, rh] = sideways ? [h, w] : [w, h];
  const s = Math.min(t / rw, (t * MAX_ASPECT) / rh);
  return { boxW: rw * s, boxH: rh * s, imgW: w * s, imgH: h * s };
}

/** Pixels per point to draw a thumbnail at: enough for every orientation the card can take at this size, never upscaled. */
export function rasterScale(w: number, h: number, t: number, dpr: number): number {
  const bucket = BUCKETS.find((b) => b >= t) ?? BUCKETS[BUCKETS.length - 1];
  const fit = (sideways: boolean) => {
    const f = fitCard(w, h, sideways, bucket);
    return f.imgW / Math.max(1, w);
  };
  return Math.max(fit(false), fit(true)) * dpr;
}

export const devicePixelRatioClamped = () => Math.min(2, Math.max(1, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1));

// ───────────────────────────── visibility ─────────────────────────────

/** `near`: close enough to be worth drawing. `far`: far enough away that its pixels can be released. */
export type Reach = 'near' | 'far';

export interface Visibility {
  observe(el: Element, reach: Reach, cb: (visible: boolean) => void): () => void;
}

export const VisibilityContext = createContext<Visibility | null>(null);

function useVisible(ref: RefObject<Element | null>, reach: Reach): boolean {
  const vis = useContext(VisibilityContext);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!vis || !el) return;
    return vis.observe(el, reach, setOn);
  }, [vis, ref, reach]);
  return on;
}

// ───────────────────────────── thumbnail ─────────────────────────────

function paint(c: HTMLCanvasElement, t: Thumb) {
  if (c.width !== t.width || c.height !== t.height) {
    c.width = t.width;
    c.height = t.height;
  }
  c.getContext('2d')!.drawImage(t.bitmap, 0, 0);
}

function PageThumb({ req }: { req: ThumbRequest }) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const near = useVisible(host, 'near');
  const far = useVisible(host, 'far');
  const wasFar = useRef(false);
  const [failed, setFailed] = useState(false);
  const { src, page, scale } = req;

  // a page that is already in the cache (a duplicate, say) is painted before the first frame instead of flashing white
  useLayoutEffect(() => {
    const hit = thumbs.get({ src, page, scale });
    if (hit && canvas.current) paint(canvas.current, hit);
  }, [src, page, scale]);

  useEffect(() => {
    if (!near) return;
    setFailed(false);
    return thumbs.request({ src, page, scale }, (t) => {
      if (!t) return setFailed(true);
      if (canvas.current) paint(canvas.current, t);
    });
  }, [near, src, page, scale]);

  // far away from the viewport: give the canvas memory back (it is redrawn from the cache or re-rendered when it returns)
  useEffect(() => {
    if (far) {
      wasFar.current = true;
      return;
    }
    const c = canvas.current;
    if (wasFar.current && c && c.width) {
      c.width = 0;
      c.height = 0;
    }
    wasFar.current = false;
  }, [far]);

  return (
    <div ref={host} className="pthumb">
      {/* 1×1 until a thumbnail is painted: a fresh canvas would otherwise reserve 300×150 pixels */}
      <canvas ref={canvas} width={1} height={1} className="pthumb-canvas" aria-hidden="true" />
      {failed && <span className="pthumb-fail">{TEXT.failed}</span>}
    </div>
  );
}

// ───────────────────────────── card ─────────────────────────────

export interface PageCardProps {
  item: PageItem;
  /** 0-based position in the list. */
  index: number;
  total: number;
  /** Displayed size of the page before the card's own turn, in points. */
  baseW: number;
  baseH: number;
  source: SourceMeta | null;
  /** Show which PDF the page comes from (when pages of several PDFs are mixed). */
  showSource: boolean;
  /** Card width in CSS pixels. */
  size: number;
  dpr: number;
  selected: boolean;
  tabbable: boolean;
  dragging: boolean;
}

export const PageCard = memo(function PageCard(p: PageCardProps) {
  const { item, index, total, baseW, baseH, source, showSource, size, dpr, selected, tabbable, dragging } = p;
  const angle = item.kind === 'page' ? item.rotate : 0;
  const sideways = Math.abs(Math.round(angle / 90)) % 2 === 1;
  const fit = fitCard(baseW, baseH, sideways, size);
  const turn = ((angle % 360) + 360) % 360;

  const labelParts = [TEXT.page(index + 1, total)];
  if (item.kind === 'blank') labelParts.push(TEXT.blankPage);
  else {
    if (showSource && source) labelParts.push(TEXT.from(source.name, item.page + 1));
    if (turn) labelParts.push(TEXT.turned(turn));
  }

  return (
    <div
      role="option"
      className="pcell"
      data-uid={item.uid}
      aria-selected={selected}
      aria-label={labelParts.join(', ')}
      tabIndex={tabbable ? 0 : -1}
      draggable
    >
      <div className={`pcard${selected ? ' sel' : ''}${dragging ? ' drag' : ''}`}>
        <div className="pframe" style={{ width: fit.boxW, height: fit.boxH }}>
          <div className="pimg" style={{ width: fit.imgW, height: fit.imgH, transform: `translate(-50%, -50%) rotate(${angle}deg)` }}>
            {item.kind === 'blank' ? (
              <span className="pblank">{TEXT.blank}</span>
            ) : (
              <PageThumb req={{ src: item.src, page: item.page, scale: rasterScale(baseW, baseH, size, dpr) }} />
            )}
          </div>
          <span className="pnum" aria-hidden="true">
            {index + 1}
          </span>
          {selected && (
            <span className="pcheck" aria-hidden="true">
              ✓
            </span>
          )}
        </div>
        {showSource && (
          <span
            className="psrc"
            style={{ '--c': `var(--src-${source?.color ?? 0})` } as CSSProperties}
            title={item.kind === 'page' && source ? TEXT.tip(source.name, item.page + 1) : TEXT.tipBlank}
          >
            {item.kind === 'page' && source ? source.name : TEXT.tipBlank}
          </span>
        )}
      </div>
    </div>
  );
});
