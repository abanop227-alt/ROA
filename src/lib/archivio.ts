// Scrittura dei file aggiornati nella cartella dell'archivio (E:\ARCHIVIO 2026) dal computer, con la File System Access API
// (Chrome / Edge). Su telefono non è disponibile: si scarica uno ZIP con gli stessi file.
import JSZip from 'jszip';
import type { FileGenerato } from './aggiornamenti';

export const cartellaSupportata = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

export async function scegliCartella(): Promise<FileSystemDirectoryHandle> {
  const w = window as unknown as { showDirectoryPicker: (o?: { mode: 'readwrite' }) => Promise<FileSystemDirectoryHandle> };
  return w.showDirectoryPicker({ mode: 'readwrite' });
}

type ConPermessi = FileSystemDirectoryHandle & {
  queryPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
};

/** true se si può scrivere; con `richiedi` chiede il permesso (serve un gesto dell'utente). */
export async function permessoScrittura(h: FileSystemDirectoryHandle, richiedi: boolean): Promise<boolean> {
  const x = h as ConPermessi;
  if ((await x.queryPermission?.({ mode: 'readwrite' })) === 'granted') return true;
  return richiedi ? (await x.requestPermission?.({ mode: 'readwrite' })) === 'granted' : false;
}

async function cartella(radice: FileSystemDirectoryHandle, percorso: string[]): Promise<FileSystemDirectoryHandle> {
  let h = radice;
  for (const p of percorso) h = await h.getDirectoryHandle(p, { create: true });
  return h;
}

/** Scrive i file nella cartella dell'archivio (crea le sottocartelle). Restituisce i percorsi scritti. */
export async function scriviNellArchivio(radice: FileSystemDirectoryHandle, file: FileGenerato[]): Promise<string[]> {
  const scritti: string[] = [];
  for (const f of file) {
    const dir = await cartella(radice, f.cartella);
    const fh = await dir.getFileHandle(f.nome, { create: true });
    const w = await (fh as FileSystemFileHandle & { createWritable: () => Promise<FileSystemWritableFileStream> }).createWritable();
    await w.write(f.blob);
    await w.close();
    scritti.push([...f.cartella, f.nome].join('/'));
  }
  return scritti;
}

/** Stessi file in un unico ZIP, per il telefono. */
export async function zipDeiFile(file: FileGenerato[]): Promise<Blob> {
  const zip = new JSZip();
  for (const f of file) zip.file([...f.cartella, f.nome].join('/'), f.blob);
  return zip.generateAsync({ type: 'blob' });
}
