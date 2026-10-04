export type UnlockResult<T> = { status: 'ok'; info: T } | { status: 'cancelled' } | { status: 'wrong-password' };

/**
 * Calls an engine `open`/`openSource`-style method and, if the file needs a password, asks for it (up to 3 tries).
 * The engine takes ownership of the buffer it is given, so a copy is kept for the retries.
 */
export async function openWithPassword<T extends { needsPassword?: boolean }>(
  buf: ArrayBuffer,
  name: string,
  call: (bytes: ArrayBuffer, password: string) => Promise<T>,
): Promise<UnlockResult<T>> {
  const spare = buf.slice(0);
  let info = await call(buf, '');
  for (let attempt = 0; info.needsPassword && attempt < 3; attempt++) {
    const pw = window.prompt(attempt ? 'Wrong password. Try again:' : `“${name}” is password-protected. Password:`);
    if (pw === null) return { status: 'cancelled' };
    info = await call(spare.slice(0), pw);
  }
  return info.needsPassword ? { status: 'wrong-password' } : { status: 'ok', info };
}
