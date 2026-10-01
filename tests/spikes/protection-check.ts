import { readFileSync } from 'node:fs';
import { makeSession } from '../helpers/node-session';
// Prints how the editor treats your protected PDFs (no document text).
for (const path of process.argv.slice(2)) {
  const s = await makeSession();
  const info = s.open(new Uint8Array(readFileSync(path)));
  console.log(
    `${path.split('/').pop()}: decrypted=${info.decrypted} restrictedEditing=${info.restricted} needsPassword=${!!info.needsPassword} pages=${info.pages.length}`,
  );
}
