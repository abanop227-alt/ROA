const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function scarica(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function fileDaBlob(blob: Blob, nome: string, tipo = blob.type || MIME_DOCX): File {
  return new File([blob], nome, { type: tipo });
}

export function puoCondividere(file: File): boolean {
  try {
    return typeof navigator.share === 'function' && !!navigator.canShare?.({ files: [file] });
  } catch {
    return false;
  }
}

/** Apre il foglio di condivisione (mail, WhatsApp…). Restituisce false se l'utente annulla. */
export async function condividi(file: File, titolo: string): Promise<boolean> {
  try {
    await navigator.share({ files: [file], title: titolo });
    return true;
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return false;
    throw e;
  }
}

/** Sui telefoni tocco/penna "grossolano" = dispositivo mobile */
export function isMobile(): boolean {
  return window.matchMedia?.('(pointer: coarse)').matches ?? false;
}

export { MIME_DOCX };
