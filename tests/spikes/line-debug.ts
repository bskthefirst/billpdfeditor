import { readFileSync } from 'node:fs';
import { makeSession } from '../helpers/node-session';
import { loadCore } from '../helpers/node-core';
const core = await loadCore();
for (const path of process.argv.slice(2)) {
  const bytes = new Uint8Array(readFileSync(path));
  const s = await makeSession();
  s.open(bytes);
  const l = s.getLines(0).find((l) => l.editable && l.text.length >= 10 && /[A-Za-z]{5,}/.test(l.text.slice(2)))!;
  const m = /[A-Za-z]{5,}/.exec(l.text.slice(2))!;
  const at = m.index + 2;
  const newText = l.text.slice(0, at + 2) + l.text.slice(at + 3);
  const r = await s.setLineText(l.id, newText);
  const ext = (b: Uint8Array) => {
    const d = core.open(b);
    const p = core.loadPage(d, 0);
    const tp = core.loadTextPage(p);
    const t = core
      .textChars(tp)
      .map((c) => String.fromCodePoint(c.unicode))
      .join('');
    core.closeTextPage(tp);
    core.closePage(p);
    core.close(d);
    return t;
  };
  const before = ext(bytes),
    after = ext(s.save());
  const key = l.text.slice(0, 6);
  const show = (t: string) =>
    JSON.stringify(t.slice(Math.max(0, t.indexOf(key.trim().slice(0, 4)) - 2), t.indexOf(key.trim().slice(0, 4)) + 40));
  console.log(`${path.split('/').pop()}: line=${JSON.stringify(l.text.slice(0, 40))} → ${JSON.stringify(newText.slice(0, 40))} ok=${r.ok}`);
  console.log('   before:', show(before));
  console.log('   after :', show(after));
}
