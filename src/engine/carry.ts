/**
 * PDFium's page import copies pages and everything they reference, but not document-level data that merely points at
 * them. Optional content (layers) is the one that changes how pages look: the catalog's /OCProperties lists which layers
 * are hidden by default, and without it hidden layers show up in the copy. This carries it over.
 *
 * The copy is an exact clone of the page's object graph with new object numbers, so walking the original page and its
 * copy side by side ("in lockstep") tells us which new object each old one became, without PDFium's help.
 */
import type { PdfFile } from '../pdf/file';
import { IncrementalUpdate } from '../pdf/writer';
import { PdfName, PdfRef, PdfString, isArray, isDict, isName, isRef, isStream, type PdfDict, type PdfValue } from '../pdf/objects';

export interface CarrySource {
  file: PdfFile;
  /** Which page of `file` became which page of the output. */
  pages: Array<{ srcPage: number; outPage: number }>;
}

type NumMap = Map<number, Set<number>>;

/** Links that lead back up or sideways (the copy dropped or rewrote them); following them would walk the whole page tree. */
const SKIP = new Set(['Parent', 'P', 'Prev', 'Next', 'First', 'Last', 'Dest', 'Popup', 'IRT']);

function lockstep(
  src: PdfFile,
  a: PdfValue | undefined,
  out: PdfFile,
  b: PdfValue | undefined,
  map: NumMap,
  seen: Set<string>,
  depth: number,
): void {
  if (depth > 48 || a === undefined || b === undefined) return;
  if (isRef(a) && isRef(b)) {
    const key = `${a.num}>${b.num}`;
    if (seen.has(key)) return;
    seen.add(key);
    let set = map.get(a.num);
    if (!set) map.set(a.num, (set = new Set()));
    set.add(b.num);
  }
  let x = src.resolve(a);
  let y = out.resolve(b);
  if (isStream(x)) x = x.dict;
  if (isStream(y)) y = y.dict;
  if (isDict(x) && isDict(y)) {
    for (const [k, v] of x) if (!SKIP.has(k)) lockstep(src, v, out, y.get(k), map, seen, depth + 1);
  } else if (isArray(x) && isArray(y) && x.length === y.length) {
    x.forEach((v, i) => lockstep(src, v, out, y[i], map, seen, depth + 1));
  }
}

/**
 * Returns the output with the layer configuration added to its catalog (as an incremental update), or null when none of
 * the sources has layers that the copied pages use.
 */
export function carryOptionalContent(out: PdfFile, sources: CarrySource[]): Uint8Array | null {
  const outPages = out.pages();
  const ocgs: PdfRef[] = [];
  const off: PdfRef[] = [];
  const order: PdfValue[] = [];
  const auto: PdfValue[] = [];
  const radio: PdfValue[] = [];
  let firstConfig: PdfDict | null = null;

  for (const s of sources) {
    const props = s.file.get(s.file.catalog, 'OCProperties');
    if (!isDict(props)) continue;

    const map: NumMap = new Map();
    const seen = new Set<string>();
    const srcPages = s.file.pages();
    for (const { srcPage, outPage } of s.pages) {
      const sp = srcPages[srcPage];
      const op = outPages[outPage];
      if (!sp || !op) continue;
      lockstep(s.file, sp.dict, out, op.dict, map, seen, 0);
      if (!sp.dict.has('Resources') && sp.resources) lockstep(s.file, sp.resources, out, op.dict.get('Resources'), map, seen, 0); // inherited
    }

    const copies = (v: PdfValue | undefined): PdfRef[] => {
      const arr = s.file.resolve(v ?? null);
      if (!isArray(arr)) return [];
      return arr.flatMap((x) => (isRef(x) ? [...(map.get(x.num) ?? [])].map((n) => new PdfRef(n, out.generationOf(n))) : []));
    };
    /** /Order entries: layer refs (all their copies), labels (kept) and sub-lists (kept when they still hold a layer). */
    const remapOrder = (v: PdfValue): PdfValue[] => {
      if (isRef(v)) return copies([v]);
      const x = s.file.resolve(v);
      if (x instanceof PdfString) return [x];
      if (!isArray(x)) return [];
      const inner = x.flatMap(remapOrder);
      return inner.some(isRef) ? [inner] : [];
    };

    const config = s.file.resolve(props.get('D') ?? null);
    const d: PdfDict = isDict(config) ? config : new Map();
    const all = copies(props.get('OCGs'));
    if (!all.length) continue;
    const onList = copies(d.get('ON'));
    const baseOff = isName(s.file.resolve(d.get('BaseState') ?? null), 'OFF');
    const hidden = baseOff ? all.filter((r) => !onList.some((o) => o.num === r.num)) : copies(d.get('OFF'));
    ocgs.push(...all);
    off.push(...hidden);
    firstConfig ??= d;

    const orderSrc = s.file.resolve(d.get('Order') ?? null);
    if (isArray(orderSrc)) order.push(...orderSrc.flatMap(remapOrder));
    const autoSrc = s.file.resolve(d.get('AS') ?? null);
    if (isArray(autoSrc)) {
      for (const e of autoSrc) {
        const ad = s.file.resolve(e);
        if (!isDict(ad)) continue;
        const list = copies(ad.get('OCGs'));
        if (!list.length) continue;
        const nd: PdfDict = new Map(ad);
        nd.set('OCGs', list);
        auto.push(nd);
      }
    }
    const rbSrc = s.file.resolve(d.get('RBGroups') ?? null);
    if (isArray(rbSrc))
      for (const g of rbSrc) {
        const list = copies(g);
        if (list.length > 1) radio.push(list);
      }
  }
  if (!ocgs.length) return null;

  const config: PdfDict = new Map<string, PdfValue>([['BaseState', new PdfName('ON')]]);
  if (off.length) config.set('OFF', off);
  for (const k of ['Name', 'Creator', 'ListMode', 'Intent']) {
    const v = firstConfig?.get(k);
    if (v !== undefined && !isRef(v)) config.set(k, v);
  }
  if (order.length) config.set('Order', order);
  if (auto.length) config.set('AS', auto);
  if (radio.length) config.set('RBGroups', radio);

  const upd = new IncrementalUpdate(out);
  const propsNum = upd.alloc();
  upd.set(
    propsNum,
    new Map<string, PdfValue>([
      ['OCGs', ocgs],
      ['D', config],
    ]),
    0,
  );
  const root = out.trailer.get('Root');
  if (!isRef(root)) return null;
  const catalog: PdfDict = new Map(out.catalog);
  catalog.set('OCProperties', new PdfRef(propsNum, 0));
  upd.set(root.num, catalog, out.generationOf(root.num));
  return upd.build();
}
