import type { EngineApi } from './api';

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

/** Promise-based proxy to the engine worker. */
export function createEngine(): {
  api: { [K in keyof EngineApi]: (...a: Parameters<EngineApi[K]>) => Promise<Awaited<ReturnType<EngineApi[K]>>> };
  terminate(): void;
} {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  const pending = new Map<number, Pending>();
  let next = 1;
  worker.onmessage = (ev: MessageEvent<{ id: number; ok: boolean; result?: unknown; error?: string }>) => {
    const p = pending.get(ev.data.id);
    if (!p) return;
    pending.delete(ev.data.id);
    if (ev.data.ok) p.resolve(ev.data.result);
    else p.reject(new Error(ev.data.error));
  };
  const call = (method: string, args: unknown[], transfer: Transferable[] = []) =>
    new Promise((resolve, reject) => {
      const id = next++;
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, method, args }, transfer);
    });
  const api = new Proxy({} as never, {
    get:
      (_t, method: string) =>
      (...args: unknown[]) =>
        call(method, args, method === 'open' ? [args[0] as ArrayBuffer] : []),
  });
  return { api, terminate: () => worker.terminate() };
}
