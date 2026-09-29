import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Commessa } from './commesse';
import type { Stabile } from './stabili';
import type { Catalogo, DatiModuli, FotoRecord, Sopralluogo, Tecnico } from './types';
import { tecnicoVuoto } from './catalogo';
import { nuovoId } from './util';

interface RoaDB extends DBSchema {
  sopralluoghi: { key: string; value: Sopralluogo };
  foto: { key: string; value: FotoRecord; indexes: { sopralluogoId: string } };
  impostazioni: { key: string; value: unknown };
  stabili: { key: string; value: Stabile; indexes: { origine: string } };
}

let dbPromise: Promise<IDBPDatabase<RoaDB>> | null = null;

export function db(): Promise<IDBPDatabase<RoaDB>> {
  if (!dbPromise) {
    dbPromise = openDB<RoaDB>('roa-antincendio', 2, {
      upgrade(d, versionePrecedente) {
        if (versionePrecedente < 1) {
          d.createObjectStore('sopralluoghi', { keyPath: 'id' });
          const foto = d.createObjectStore('foto', { keyPath: 'id' });
          foto.createIndex('sopralluogoId', 'sopralluogoId');
          d.createObjectStore('impostazioni');
        }
        if (versionePrecedente < 2) {
          const st = d.createObjectStore('stabili', { keyPath: 'id' });
          st.createIndex('origine', 'origine');
        }
      },
    });
  }
  return dbPromise;
}

/** Chiude la connessione (usato nei test per simulare un altro dispositivo). */
export async function chiudiDb(): Promise<void> {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
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
  copia.condominio.nome = `${orig.condominio.nome || orig.condominio.indirizzo || 'Sopralluogo'} (copia)`;
  copia.voci = copia.voci.map((v) => ({ ...v, fotoIds: v.fotoIds.map((x) => mappa.get(x)).filter((x): x is string => !!x) }));
  copia.fotoCopertinaId = (orig.fotoCopertinaId && mappa.get(orig.fotoCopertinaId)) || null;
  if (copia.provaIdranti) {
    const rimappa = (ids: string[]) => ids.map((x) => mappa.get(x)).filter((x): x is string => !!x);
    copia.provaIdranti.fotoAttaccoIds = rimappa(copia.provaIdranti.fotoAttaccoIds);
    copia.provaIdranti.fotoProvaIds = rimappa(copia.provaIdranti.fotoProvaIds);
    copia.provaIdranti.fotoRapportoIds = rimappa(copia.provaIdranti.fotoRapportoIds);
  }
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

// ---- dati del tecnico (restano solo su questo dispositivo) ----

export async function leggiTecnico(): Promise<Tecnico> {
  const t = (await (await db()).get('impostazioni', 'tecnico')) as Partial<Tecnico> | undefined;
  return { ...tecnicoVuoto, ...(t ?? {}) };
}

export async function salvaTecnico(t: Tecnico): Promise<void> {
  await (await db()).put('impostazioni', t, 'tecnico');
}

// ---- carta intestata (immagine a pagina intera, solo su questo dispositivo) ----

export interface CartaIntestata {
  blob: Blob;
  width: number;
  height: number;
}

export async function leggiCartaIntestata(): Promise<CartaIntestata | undefined> {
  return (await (await db()).get('impostazioni', 'cartaIntestata')) as CartaIntestata | undefined;
}

export async function salvaCartaIntestata(c: CartaIntestata | null): Promise<void> {
  const d = await db();
  if (c) await d.put('impostazioni', c, 'cartaIntestata');
  else await d.delete('impostazioni', 'cartaIntestata');
}

// ---- stabili (anagrafica importata dagli Excel, solo su questo dispositivo) ----

export async function elencaStabili(): Promise<Stabile[]> {
  return (await db()).getAll('stabili');
}

/** Sostituisce gli stabili importati dallo stesso file (reimportare un elenco aggiornato non crea doppioni). */
export async function importaStabiliDb(nuovi: Stabile[], origine: string): Promise<void> {
  const tx = (await db()).transaction('stabili', 'readwrite');
  for await (const cur of tx.store.index('origine').iterate(origine)) await cur.delete();
  for (const s of nuovi) await tx.store.put(s);
  await tx.done;
}

export async function eliminaStabiliDi(origine: string): Promise<void> {
  const tx = (await db()).transaction('stabili', 'readwrite');
  for await (const cur of tx.store.index('origine').iterate(origine)) await cur.delete();
  await tx.done;
}

// ---- rubrica degli amministratori (titolare dei moduli VV.F., solo su questo dispositivo) ----

type Titolare = DatiModuli['titolare'];
const chiaveAmministratore = (nome: string) => nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export async function leggiAmministratore(nome: string): Promise<Titolare | undefined> {
  const k = chiaveAmministratore(nome);
  if (!k) return undefined;
  const r = (await (await db()).get('impostazioni', 'amministratori')) as Record<string, Titolare> | undefined;
  return r?.[k];
}

export async function salvaAmministratore(nome: string, titolare: Titolare): Promise<void> {
  const k = chiaveAmministratore(nome);
  if (!k || !titolare.cognome.trim()) return;
  const d = await db();
  const r = ((await d.get('impostazioni', 'amministratori')) as Record<string, Titolare> | undefined) ?? {};
  await d.put('impostazioni', { ...r, [k]: titolare }, 'amministratori');
}

// ---- elenco lavori importato e file Excel originali degli stabili (solo su questo dispositivo) ----

export interface CommesseImportate {
  righe: Commessa[];
  file: string;
  importato: number;
}

export async function leggiCommesseImportate(): Promise<CommesseImportate | undefined> {
  return (await (await db()).get('impostazioni', 'commesse')) as CommesseImportate | undefined;
}

export async function salvaCommesseImportate(c: CommesseImportate | null): Promise<void> {
  const d = await db();
  if (c) await d.put('impostazioni', c, 'commesse');
  else await d.delete('impostazioni', 'commesse');
}

/** Il file Excel originale di un elenco stabili: serve per produrne la copia aggiornata. */
export async function salvaFileStabili(origine: string, blob: Blob): Promise<void> {
  await (await db()).put('impostazioni', blob, `stabiliFile:${origine}`);
}

export async function leggiFileStabili(origine: string): Promise<Blob | undefined> {
  return (await (await db()).get('impostazioni', `stabiliFile:${origine}`)) as Blob | undefined;
}

export async function eliminaFileStabili(origine: string): Promise<void> {
  await (await db()).delete('impostazioni', `stabiliFile:${origine}`);
}

// ---- cartella dell'archivio (solo computer con File System Access) ----

export async function leggiCartellaArchivio(): Promise<FileSystemDirectoryHandle | undefined> {
  return (await (await db()).get('impostazioni', 'cartellaArchivio')) as FileSystemDirectoryHandle | undefined;
}

export async function salvaCartellaArchivio(h: FileSystemDirectoryHandle | null): Promise<void> {
  const d = await db();
  if (h) await d.put('impostazioni', h, 'cartellaArchivio');
  else await d.delete('impostazioni', 'cartellaArchivio');
}

/** Impostazioni semplici (booleani, testi) del dispositivo. */
export async function leggiImpostazione<T>(chiave: string): Promise<T | undefined> {
  return (await (await db()).get('impostazioni', chiave)) as T | undefined;
}

export async function salvaImpostazione(chiave: string, valore: unknown): Promise<void> {
  await (await db()).put('impostazioni', valore, chiave);
}
