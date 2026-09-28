import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Catalogo, FotoRecord, Sopralluogo } from './types';
import { nuovoId } from './util';

interface RoaDB extends DBSchema {
  sopralluoghi: { key: string; value: Sopralluogo };
  foto: { key: string; value: FotoRecord; indexes: { sopralluogoId: string } };
  impostazioni: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<RoaDB>> | null = null;

export function db(): Promise<IDBPDatabase<RoaDB>> {
  if (!dbPromise) {
    dbPromise = openDB<RoaDB>('roa-antincendio', 1, {
      upgrade(d) {
        d.createObjectStore('sopralluoghi', { keyPath: 'id' });
        const foto = d.createObjectStore('foto', { keyPath: 'id' });
        foto.createIndex('sopralluogoId', 'sopralluogoId');
        d.createObjectStore('impostazioni');
      },
    });
  }
  return dbPromise;
}

/** Chiede al browser di non cancellare i dati in caso di poco spazio (importante su iPhone). */
export async function richiediArchivioPersistente(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* non supportato */
  }
}

// ---- sopralluoghi ----

export async function elencaSopralluoghi(): Promise<Sopralluogo[]> {
  const tutti = await (await db()).getAll('sopralluoghi');
  return tutti.sort((a, b) => b.modificato - a.modificato);
}

export async function leggiSopralluogo(id: string): Promise<Sopralluogo | undefined> {
  return (await db()).get('sopralluoghi', id);
}

export async function salvaSopralluogo(s: Sopralluogo): Promise<void> {
  await (await db()).put('sopralluoghi', s);
}

export async function eliminaSopralluogo(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(['sopralluoghi', 'foto'], 'readwrite');
  await tx.objectStore('sopralluoghi').delete(id);
  const idx = tx.objectStore('foto').index('sopralluogoId');
  for await (const cur of idx.iterate(id)) await cur.delete();
  await tx.done;
}

export async function duplicaSopralluogo(id: string): Promise<Sopralluogo | undefined> {
  const d = await db();
  const orig = await d.get('sopralluoghi', id);
  if (!orig) return undefined;
  const foto = await d.getAllFromIndex('foto', 'sopralluogoId', id);
  const nuovoIdS = nuovoId();
  const mappa = new Map<string, string>();
  const ora = Date.now();
  const copieFoto = foto.map((f) => {
    const nid = nuovoId('f-');
    mappa.set(f.id, nid);
    return { ...f, id: nid, sopralluogoId: nuovoIdS };
  });
  const copia: Sopralluogo = {
    ...structuredClone(orig),
    id: nuovoIdS,
    creato: ora,
    modificato: ora,
  };
  copia.condominio.committente = `${orig.condominio.committente || 'Sopralluogo'} (copia)`;
  copia.voci = copia.voci.map((v) => ({ ...v, fotoIds: v.fotoIds.map((x) => mappa.get(x)).filter((x): x is string => !!x) }));
  const tx = d.transaction(['sopralluoghi', 'foto'], 'readwrite');
  await tx.objectStore('sopralluoghi').put(copia);
  for (const f of copieFoto) await tx.objectStore('foto').put(f);
  await tx.done;
  return copia;
}

// ---- foto ----

export async function salvaFoto(f: FotoRecord): Promise<void> {
  await (await db()).put('foto', f);
}

export async function leggiFoto(id: string): Promise<FotoRecord | undefined> {
  return (await db()).get('foto', id);
}

export async function eliminaFoto(id: string): Promise<void> {
  await (await db()).delete('foto', id);
}

export async function fotoDiSopralluogo(id: string): Promise<FotoRecord[]> {
  return (await db()).getAllFromIndex('foto', 'sopralluogoId', id);
}

// ---- libreria personalizzata ----

const CHIAVE_CATALOGO = 'catalogo';

export async function leggiCatalogoPersonalizzato(): Promise<Catalogo | undefined> {
  return (await (await db()).get('impostazioni', CHIAVE_CATALOGO)) as Catalogo | undefined;
}

export async function salvaCatalogoPersonalizzato(c: Catalogo | null): Promise<void> {
  const d = await db();
  if (c) await d.put('impostazioni', c, CHIAVE_CATALOGO);
  else await d.delete('impostazioni', CHIAVE_CATALOGO);
}
