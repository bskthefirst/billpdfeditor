import { createEngine } from './client';

/** One engine worker per tab. */
export const engine = createEngine();
// The fallback fonts live next to index.html (public/fonts), so resolve them against the document, not the worker script.
void engine.api.configure({ fontsBase: new URL('fonts/', document.baseURI).href });
