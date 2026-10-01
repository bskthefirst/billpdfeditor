import { readCorpus, writeOut } from '../helpers/node-core';
import { makeSession } from '../helpers/node-session';
const s = await makeSession();
s.open(readCorpus('chrome_basic.pdf'));
const title = s.getLines(0).find((r) => r.text.startsWith('Quarterly'))!;
for (const t of ['Quarterly oReport 2026', 'Quarterly oReport 2026 2026 Report']) {
  const r = s.setLineText(title.id, t);
  console.log(JSON.stringify(t), '→', JSON.stringify(r));
  try {
    const img = s.render(0, 1.25);
    console.log('  render ok', img.width, 'x', img.height);
  } catch (e) {
    console.log('  RENDER FAILED:', e instanceof Error ? e.message : e);
  }
  writeOut(`session-repro/${t.length}.pdf`, s.save());
}
