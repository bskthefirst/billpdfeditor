/// <reference lib="webworker" />
import wasmUrl from '@embedpdf/pdfium/pdfium.wasm?url';
import hbWasmUrl from 'harfbuzzjs/dist/harfbuzz-subset.wasm?url';
import { PdfiumCore } from './core';
import { EngineSession } from './session';
import { PageTools } from './pages';
import { FontResolver } from '../fonts/resolver';
import { Subsetter } from '../fonts/subset';
import type { BuildOptions, EngineApi, EngineConfig, PageSpec, SearchOptions } from './api';

type Req = { id: number; method: keyof EngineApi; args: unknown[] };

let config: EngineConfig | null = null;
let enginePromise: Promise<{ session: EngineSession; tools: PageTools }> | null = null;

const getEngine = () =>
  (enginePromise ??= (async () => {
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
    return { session: new EngineSession(core, { subsetter, fonts }), tools: new PageTools(core) };
  })());

self.onmessage = async (ev: MessageEvent<Req>) => {
  const { id, method, args } = ev.data;
  try {
    if (method === 'configure') {
      config = args[0] as EngineConfig;
      (self as unknown as Worker).postMessage({ id, ok: true, result: null });
      return;
    }
    const { session: s, tools } = await getEngine();
    let result: unknown;
    const transfer: Transferable[] = [];
    switch (method) {
      case 'open':
        result = s.open(new Uint8Array(args[0] as ArrayBuffer), (args[1] as string | undefined) ?? '');
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
      case 'search':
        result = s.search(
          args[0] as string,
          args[1] as SearchOptions | undefined,
          args[2] as number | undefined,
          args[3] as number | undefined,
        );
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
      case 'openSource':
        result = tools.open(new Uint8Array(args[0] as ArrayBuffer), args[1] as string, (args[2] as string | undefined) ?? '');
        break;
      case 'snapshotSource':
        result = tools.open(s.save(), args[0] as string);
        break;
      case 'closeSource':
        tools.close(args[0] as number);
        result = null;
        break;
      case 'renderSource': {
        const r = tools.render(args[0] as number, args[1] as number, args[2] as number);
        transfer.push(r.data);
        result = r;
        break;
      }
      case 'outline':
        result = tools.outline(args[0] as number);
        break;
      case 'buildPdf': {
        const bytes = tools.build(args[0] as PageSpec[], args[1] as BuildOptions | undefined);
        const buf =
          bytes.byteOffset === 0 && bytes.buffer.byteLength === bytes.byteLength
            ? (bytes.buffer as ArrayBuffer)
            : (bytes.slice().buffer as ArrayBuffer);
        transfer.push(buf);
        result = buf;
        break;
      }
    }
    (self as unknown as Worker).postMessage({ id, ok: true, result }, transfer);
  } catch (e) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: e instanceof Error ? e.message : String(e) });
  }
};
