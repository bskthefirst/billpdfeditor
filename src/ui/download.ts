/** Hands bytes to the browser as a file download. */
export function downloadBytes(bytes: Uint8Array | ArrayBuffer, fileName: string, type = 'application/pdf'): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // the download has started by the time the click returns; keep the URL a little longer for slow browsers
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The document's name without its `.pdf` extension, for building output names. */
export const baseNameOf = (fileName: string): string => fileName.replace(/\.pdf$/i, '') || 'document';
