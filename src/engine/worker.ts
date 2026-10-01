/// <reference lib="webworker" />
import wasmUrl from '@embedpdf/pdfium/pdfium.wasm?url';
import hbWasmUrl from 'harfbuzzjs/dist/harfbuzz-subset.wasm?url';
import { PdfiumCore } from './core';
import { EngineSession } from './session';
import { FontResolver } from '../fonts/resolver';
import { Subsetter } from '../fonts/subset';
import type { EngineApi, EngineConfig } from './api';

type Req = { id: number; method: keyof EngineApi; args: unknown[] };

let config: EngineConfig | null = null;
let sessionPromise: Promise<EngineSession> | null = null;

const getSession = () =>
  (sessionPromise ??= (async () => {
    const [pdfiumWasm, hbWasm] = await Promise.all([
      fetch(wasmUrl).then((r) => r.arrayBuffer()),
      fetch(hbWasmUrl).then((r) => r.arrayBuffer()),
    ]);
    const core = await PdfiumCore.create(pdfiumWasm);
    const subsetter = await Subsetter.create(hbWasm);
    const fonts = new FontResolver(async (file) => {
      if (!config) throw new Error('engine not configured');
      const res = await fetch(new URL(file, config.fontsBase));
      if (!res.ok) throw new Error(`font ${file}: HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    });
    return new EngineSession(core, { subsetter, fonts });
  })());

self.onmessage = async (ev: MessageEvent<Req>) => {
  const { id, method, args } = ev.data;
  try {
    if (method === 'configure') {
      config = args[0] as EngineConfig;
      (self as unknown as Worker).postMessage({ id, ok: true, result: null });
      return;
    }
    const s = await getSession();
    let result: unknown;
    const transfer: Transferable[] = [];
    switch (method) {
      case 'open':
        result = s.open(new Uint8Array(args[0] as ArrayBuffer));
        break;
      case 'getLines':
        result = s.getLines(args[0] as number);
        break;
      case 'setLineText':
        result = await s.setLineText(args[0] as string, args[1] as string);
        break;
      case 'resetLine':
        result = await s.resetLine(args[0] as string);
        break;
      case 'render': {
        const r = s.render(args[0] as number, args[1] as number);
        transfer.push(r.data);
        result = r;
        break;
      }
      case 'undo':
        result = await s.undo();
        break;
      case 'redo':
        result = await s.redo();
        break;
      case 'history':
        result = s.history();
        break;
      case 'hitChar':
        result = s.hitChar(args[0] as number, args[1] as number, args[2] as number);
        break;
      case 'select':
        result = s.select(args[0] as number, args[1] as number, args[2] as number);
        break;
      case 'expandSelection':
        result = s.expandSelection(args[0] as number, args[1] as number, args[2] as 'word' | 'line');
        break;
      case 'save': {
        const copy = s.save().slice().buffer as ArrayBuffer;
        transfer.push(copy);
        result = copy;
        break;
      }
      case 'revision':
        result = s.revisionNumber;
        break;
    }
    (self as unknown as Worker).postMessage({ id, ok: true, result }, transfer);
  } catch (e) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: e instanceof Error ? e.message : String(e) });
  }
};
