/** Thin wrapper over HarfBuzz's subsetter (harfbuzzjs, MIT). Works in browsers/workers and Node. */

const HB_MEMORY_MODE_WRITABLE = 2;
const HB_SUBSET_SETS_DROP_TABLE_TAG = 3;

export const SubsetFlags = {
  NoHinting: 0x1,
  /** Keep original glyph ids: glyphs not requested become empty. Lets us use CID = GID without a mapping table. */
  RetainGids: 0x2,
  NotdefOutline: 0x40,
  NoLayoutClosure: 0x200,
} as const;

interface HbExports {
  memory: WebAssembly.Memory;
  _initialize(): void;
  malloc(n: number): number;
  free(p: number): void;
  hb_blob_create(data: number, len: number, mode: number, userData: number, destroy: number): number;
  hb_blob_destroy(b: number): void;
  hb_blob_get_data(b: number, lenPtr: number): number;
  hb_blob_get_length(b: number): number;
  hb_face_create(blob: number, index: number): number;
  hb_face_destroy(f: number): void;
  hb_face_reference_blob(f: number): number;
  hb_set_add(s: number, v: number): void;
  hb_subset_input_create_or_fail(): number;
  hb_subset_input_destroy(i: number): void;
  hb_subset_input_set_flags(i: number, f: number): void;
  hb_subset_input_unicode_set(i: number): number;
  hb_subset_input_set(i: number, which: number): number;
  hb_subset_input_pin_axis_location(i: number, face: number, tag: number, v: number): number;
  hb_subset_or_fail(face: number, input: number): number;
}

const tag = (s: string) => s.split('').reduce((a, c) => (a << 8) + c.charCodeAt(0), 0) >>> 0;

export interface SubsetOptions {
  /** Pin variable-font axes, e.g. `{ wght: 700 }`. */
  variations?: Record<string, number>;
  ttcIndex?: number;
}

export class Subsetter {
  private constructor(private readonly hb: HbExports) {}

  static async create(wasm: BufferSource): Promise<Subsetter> {
    const { instance } = await WebAssembly.instantiate(wasm, {});
    const hb = instance.exports as unknown as HbExports;
    hb._initialize();
    return new Subsetter(hb);
  }

  /**
   * Subset `font` to the glyphs for `codePoints` (plus whatever composite glyphs need), keeping original glyph ids and
   * dropping hinting and layout tables, which a PDF does not need.
   */
  subset(font: Uint8Array, codePoints: Iterable<number>, opts: SubsetOptions = {}): Uint8Array {
    const hb = this.hb;
    const heap = () => new Uint8Array(hb.memory.buffer); // wasm memory can grow: never cache the view
    const input = hb.hb_subset_input_create_or_fail();
    if (!input) throw new Error('hb_subset_input_create_or_fail failed');
    const fontPtr = hb.malloc(font.length);
    heap().set(font, fontPtr);
    const blob = hb.hb_blob_create(fontPtr, font.length, HB_MEMORY_MODE_WRITABLE, 0, 0);
    const face = hb.hb_face_create(blob, opts.ttcIndex ?? 0);
    hb.hb_blob_destroy(blob);
    try {
      hb.hb_subset_input_set_flags(
        input,
        SubsetFlags.NoHinting | SubsetFlags.RetainGids | SubsetFlags.NotdefOutline | SubsetFlags.NoLayoutClosure,
      );
      const drop = hb.hb_subset_input_set(input, HB_SUBSET_SETS_DROP_TABLE_TAG);
      for (const t of ['GSUB', 'GPOS', 'GDEF', 'BASE', 'JSTF', 'MATH', 'DSIG', 'kern', 'morx', 'mort', 'feat', 'name', 'meta', 'STAT'])
        hb.hb_set_add(drop, tag(t));
      const uni = hb.hb_subset_input_unicode_set(input);
      for (const cp of codePoints) hb.hb_set_add(uni, cp);
      for (const [axis, value] of Object.entries(opts.variations ?? {})) {
        if (!hb.hb_subset_input_pin_axis_location(input, face, tag(axis), value)) throw new Error(`cannot pin axis ${axis}=${value}`);
      }
      const sub = hb.hb_subset_or_fail(face, input);
      if (!sub) throw new Error('hb_subset_or_fail failed');
      try {
        const out = hb.hb_face_reference_blob(sub);
        const len = hb.hb_blob_get_length(out);
        const ptr = hb.hb_blob_get_data(out, 0);
        const bytes = heap().slice(ptr, ptr + len);
        hb.hb_blob_destroy(out);
        return bytes;
      } finally {
        hb.hb_face_destroy(sub);
      }
    } finally {
      hb.hb_face_destroy(face);
      hb.hb_subset_input_destroy(input);
      hb.free(fontPtr);
    }
  }
}
