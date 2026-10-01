/**
 * Tiny watchdog pool for corpus runs: each item is processed in a worker thread with a deadline, so a hung or
 * crashed PDFium (fuzzed PDFs happen) costs one item, not the run.
 *
 * Worker file:   export default defineWorker(async (item: string) => result)
 * Driver:        const results = await runBatch(new URL('./x.worker.ts', import.meta.url), items, { timeoutMs: 20000 })
 */
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { cpus } from 'node:os';

export type BatchResult<R> =
  { item: string; ok: true; result: R; ms: number } | { item: string; ok: false; error: string; ms: number; timeout?: boolean };

export function defineWorker<R>(handler: (item: string) => Promise<R> | R): true {
  if (!isMainThread && parentPort) {
    const port = parentPort;
    port.on('message', async (item: string) => {
      const t0 = performance.now();
      try {
        const result = await handler(item);
        port.postMessage({ item, ok: true, result, ms: performance.now() - t0 });
      } catch (e) {
        port.postMessage({ item, ok: false, error: e instanceof Error ? (e.stack ?? e.message) : String(e), ms: performance.now() - t0 });
        // After a wasm trap the module may be corrupt: let the pool replace this worker.
        setTimeout(() => process.exit(0), 5);
      }
    });
  }
  return true;
}

export async function runBatch<R>(
  workerUrl: URL,
  items: string[],
  opts: { timeoutMs?: number; concurrency?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<BatchResult<R>[]> {
  const timeoutMs = opts.timeoutMs ?? 20000;
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? Math.max(2, cpus().length - 2), items.length));
  const queue = items.slice();
  const results: BatchResult<R>[] = [];
  const workerPath = fileURLToPath(workerUrl);

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      let worker: Worker | null = null;
      const spawn = () => new Worker(workerPath, { execArgv: ['--import', 'tsx'] });
      while (queue.length) {
        const item = queue.shift()!;
        worker ??= spawn();
        const t0 = performance.now();
        const w = worker;
        const res = await new Promise<BatchResult<R>>((resolve) => {
          const timer = setTimeout(() => {
            cleanup();
            w.terminate();
            worker = null;
            resolve({ item, ok: false, error: `timeout after ${timeoutMs}ms`, ms: performance.now() - t0, timeout: true });
          }, timeoutMs);
          const onMsg = (m: BatchResult<R>) => {
            cleanup();
            if (!m.ok) worker = null; // worker exits itself after reporting an error
            resolve(m);
          };
          const onErr = (e: Error) => {
            cleanup();
            worker = null;
            resolve({ item, ok: false, error: `worker crashed: ${e.message}`, ms: performance.now() - t0 });
          };
          const onExit = () => {
            cleanup();
            worker = null;
            resolve({ item, ok: false, error: 'worker exited unexpectedly', ms: performance.now() - t0 });
          };
          function cleanup() {
            clearTimeout(timer);
            w.off('message', onMsg);
            w.off('error', onErr);
            w.off('exit', onExit);
          }
          w.on('message', onMsg);
          w.on('error', onErr);
          w.on('exit', onExit);
          w.postMessage(item);
        });
        results.push(res);
        opts.onProgress?.(results.length, items.length);
      }
      worker?.terminate();
    }),
  );
  return results.sort((a, b) => a.item.localeCompare(b.item));
}
