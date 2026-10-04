/**
 * Thumbnails for the page grid. Pages are rendered by the engine worker (`renderSource`), at most a couple at a time, in
 * the order they were asked for; requests for cards that scrolled away before their turn are dropped. Finished renders are
 * kept as ImageBitmaps in a small LRU cache (bounded by pixel count), so scrolling back or showing the same page twice
 * (duplicates) costs nothing. `clear()` frees everything and makes results still in flight from an older session useless.
 */
import { engine } from '../engine/instance';

export interface ThumbRequest {
  /** Engine source id. */
  src: number;
  /** 0-based page of that source. */
  page: number;
  /** Pixels per PDF point (device pixels, so already includes the screen's pixel ratio). */
  scale: number;
}

export interface Thumb {
  bitmap: ImageBitmap;
  width: number;
  height: number;
}

type Listener = (thumb: Thumb | null) => void;

interface Job {
  key: string;
  req: ThumbRequest;
  listeners: Set<Listener>;
  started: boolean;
}

export const thumbKey = (r: ThumbRequest) => `${r.src}:${r.page}:${Math.round(r.scale * 1000)}`;

export class ThumbCache {
  private cache = new Map<string, Thumb>();
  private pixels = 0;
  private jobs = new Map<string, Job>();
  private queue: Job[] = [];
  private running = 0;
  private epoch = 0;

  constructor(
    private readonly maxPixels = 16_000_000,
    private readonly concurrency = 2,
  ) {}

  /** A cached thumbnail (and marks it as recently used). */
  get(req: ThumbRequest): Thumb | undefined {
    const key = thumbKey(req);
    const hit = this.cache.get(key);
    if (hit) {
      this.cache.delete(key);
      this.cache.set(key, hit);
    }
    return hit;
  }

  /** Calls `listener` with the thumbnail (or null if it could not be drawn) once it is ready. Returns a cancel function. */
  request(req: ThumbRequest, listener: Listener): () => void {
    const hit = this.get(req);
    if (hit) {
      listener(hit);
      return () => {};
    }
    const key = thumbKey(req);
    let job = this.jobs.get(key);
    if (!job) {
      job = { key, req, listeners: new Set(), started: false };
      this.jobs.set(key, job);
      this.queue.push(job);
    }
    job.listeners.add(listener);
    this.pump();
    const mine = job;
    return () => {
      mine.listeners.delete(listener);
      if (!mine.started && !mine.listeners.size) {
        this.queue = this.queue.filter((j) => j !== mine);
        if (this.jobs.get(mine.key) === mine) this.jobs.delete(mine.key);
      }
    };
  }

  /** Drops every thumbnail and queued request; renders already running finish but their results are discarded. */
  clear(): void {
    this.epoch++;
    for (const t of this.cache.values()) t.bitmap.close();
    this.cache.clear();
    this.pixels = 0;
    this.queue = [];
    this.jobs.clear();
  }

  get stats() {
    return { cached: this.cache.size, pixels: this.pixels, queued: this.queue.length, running: this.running };
  }

  private pump(): void {
    while (this.running < this.concurrency && this.queue.length) {
      const job = this.queue.shift()!;
      void this.run(job);
    }
  }

  private async run(job: Job): Promise<void> {
    job.started = true;
    this.running++;
    const epoch = this.epoch;
    try {
      const r = await engine.api.renderSource(job.req.src, job.req.page, job.req.scale);
      const bitmap = await createImageBitmap(new ImageData(new Uint8ClampedArray(r.data), r.width, r.height));
      if (epoch !== this.epoch) {
        bitmap.close();
        return;
      }
      const thumb: Thumb = { bitmap, width: r.width, height: r.height };
      this.remember(job.key, thumb);
      for (const l of job.listeners) l(thumb);
    } catch (e) {
      if (epoch === this.epoch) {
        console.warn('[thumbs] could not render page', job.req.page + 1, e);
        for (const l of job.listeners) l(null);
      }
    } finally {
      if (this.jobs.get(job.key) === job) this.jobs.delete(job.key);
      this.running--;
      this.pump();
    }
  }

  private remember(key: string, thumb: Thumb): void {
    const old = this.cache.get(key);
    if (old) {
      this.pixels -= old.width * old.height;
      old.bitmap.close();
    }
    this.cache.set(key, thumb);
    this.pixels += thumb.width * thumb.height;
    // oldest first; never evict the one that was just added
    for (const [k, t] of this.cache) {
      if (this.pixels <= this.maxPixels || this.cache.size <= 1) break;
      if (k === key) continue;
      this.cache.delete(k);
      this.pixels -= t.width * t.height;
      t.bitmap.close();
    }
  }
}

export const thumbs = new ThumbCache();
