import { writeOut, bitmapToPng } from '../helpers/node-core';
import { readCorpus } from '../helpers/node-core';
import { makeSession } from '../helpers/node-session';

const s = await makeSession();
const info = s.open(readCorpus('chrome_basic.pdf'));
console.log(
  'pages',
  info.pages.length,
  'size',
  info.pages[0].width,
  info.pages[0].height,
  'toDevice',
  info.pages[0].toDevice.map((x) => +x.toFixed(3)),
);
const runs = s.getLines(0);
console.log('runs', runs.length, 'editable', runs.filter((r) => r.editable).length);
const title = runs.find((r) => r.text.startsWith('Quarterly'))!;
console.log('title run:', JSON.stringify(title.text), title.id, 'size', title.size, 'font', title.font.name, 'glyphs', title.glyphs.length);

let r = s.setLineText(title.id, 'Quarterly Report 2020');
console.log(
  '2026→2020:',
  JSON.stringify(r),
  'edited text now:',
  JSON.stringify(s.getLines(0).find((x) => x.id === title.id)!.text),
  'modified',
  s.getLines(0).find((x) => x.id === title.id)!.modified,
);
r = s.setLineText(title.id, 'Quarterly Reports 2020');
console.log('add "s" (not in subset):', JSON.stringify(r));
r = s.setLineText(title.id, 'Quarterly Report 2020');
const img = s.render(0, 1.5);
writeOut('session-smoke/after.png', bitmapToPng({ width: img.width, height: img.height, data: new Uint8Array(img.data) }));
writeOut('session-smoke/saved.pdf', s.save());
console.log('saved bytes', s.save().length, '(original', readCorpus('chrome_basic.pdf').length + ')', 'rev', s.revisionNumber);
s.resetLine(title.id);
console.log(
  'after reset → bytes equal original:',
  s.save().length === readCorpus('chrome_basic.pdf').length,
  'modified runs:',
  s.getLines(0).filter((x) => x.modified).length,
);
