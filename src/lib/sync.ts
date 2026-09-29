// Sincronizzazione dei sopralluoghi tra dispositivi tramite un repository GitHub PRIVATO.
//
// Nel repository:
//   sopralluoghi/<id>.json   { formato, sopralluogo, foto: [{id,type,width,height}], autore }
//                            oppure { formato, eliminato: true, id, modificato } per quelli cancellati
//   foto/<id>.jpg|png        le foto (immutabili: si caricano una volta sola)
//
// Regola: per ogni sopralluogo vince la versione con "modificato" più recente.
// Tutto avviene dal browser con la chiave di accesso (token) salvata sul dispositivo.
import { base64ToBytes, bytesToBase64 } from './base64';
import { db } from './db';
import type { FotoRecord, Sopralluogo } from './types';

export interface ConfigSync {
  /** "proprietario/nome", es. abanop227-alt/ROA-dati */
  repo: string;
  token: string;
  /** chi usa questo dispositivo (compare nei salvataggi) */
  nome: string;
}

interface StatoSync {
  /** sha dell'ultimo file visto/scritto per ogni percorso */
  sha: Record<string, string>;
  /** "modificato" del sopralluogo all'ultima sincronizzazione riuscita */
  versioni: Record<string, number>;
  /** sopralluoghi cancellati qui, da comunicare agli altri dispositivi */
  eliminati: Record<string, number>;
  ultima?: number;
}

export interface EsitoSync {
  inviati: number;
  ricevuti: number;
  eliminati: number;
  foto: number;
}

interface FileSopralluogo {
  formato: 'roa-sync';
  sopralluogo?: Sopralluogo;
  foto?: { id: string; type: string; width: number; height: number }[];
  autore?: string;
  eliminato?: boolean;
  id?: string;
  modificato?: number;
}

const API = 'https://api.github.com';
const statoVuoto = (): StatoSync => ({ sha: {}, versioni: {}, eliminati: {} });

// ---------------- configurazione e stato (sul dispositivo) ----------------

export async function leggiConfigSync(): Promise<ConfigSync | undefined> {
  return (await (await db()).get('impostazioni', 'sync')) as ConfigSync | undefined;
}

export async function salvaConfigSync(c: ConfigSync | null): Promise<void> {
  const d = await db();
  if (c) await d.put('impostazioni', c, 'sync');
  else {
    await d.delete('impostazioni', 'sync');
    await d.delete('impostazioni', 'syncStato');
  }
}

async function leggiStato(): Promise<StatoSync> {
  const s = (await (await db()).get('impostazioni', 'syncStato')) as StatoSync | undefined;
  return { ...statoVuoto(), ...(s ?? {}) };
}

async function salvaStato(s: StatoSync): Promise<void> {
  await (await db()).put('impostazioni', s, 'syncStato');
}

export async function ultimaSincronizzazione(): Promise<number | undefined> {
  return (await leggiStato()).ultima;
}

/** Da chiamare quando si elimina un sopralluogo: la cancellazione raggiunge gli altri dispositivi. */
export async function registraEliminazione(id: string): Promise<void> {
  const s = await leggiStato();
  s.eliminati[id] = Date.now();
  await salvaStato(s);
}

// ---------------- client GitHub minimale ----------------

export class ErroreSync extends Error {
  constructor(
    message: string,
    readonly stato?: number,
  ) {
    super(message);
  }
}

type Fetch = typeof fetch;

function client(c: ConfigSync, f: Fetch) {
  const repo = c.repo.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/+$/, '');
  async function chiama<T>(metodo: string, percorso: string, corpo?: unknown): Promise<T> {
    let r: Response;
    try {
      r = await f(`${API}/repos/${repo}${percorso}`, {
        method: metodo,
        headers: {
          Authorization: `Bearer ${c.token.trim()}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(corpo ? { 'Content-Type': 'application/json' } : {}),
        },
        body: corpo ? JSON.stringify(corpo) : undefined,
        cache: 'no-store',
      });
    } catch {
      throw new ErroreSync('Nessuna connessione: sincronizzerò appena torna la rete.');
    }
    if (!r.ok) {
      const msg =
        r.status === 401
          ? 'Chiave di accesso non valida o scaduta.'
          : r.status === 403
            ? 'La chiave non ha il permesso di scrivere nel repository (serve "Contents: Read and write").'
            : r.status === 404
              ? `Repository "${repo}" non trovato, oppure la chiave non vi ha accesso.`
              : `Errore GitHub ${r.status}.`;
      throw new ErroreSync(msg, r.status);
    }
    return (r.status === 204 ? undefined : await r.json()) as T;
  }

  return {
    repo,
    async info() {
      return chiama<{ default_branch: string; private: boolean; permissions?: { push?: boolean } }>('GET', '');
    },
    async albero(ramo: string): Promise<Map<string, string>> {
      const mappa = new Map<string, string>();
      try {
        const t = await chiama<{ tree: { path: string; type: string; sha: string }[] }>('GET', `/git/trees/${ramo}?recursive=1`);
        for (const x of t.tree) if (x.type === 'blob') mappa.set(x.path, x.sha);
      } catch (e) {
        // repository appena creato e vuoto
        if ((e as ErroreSync).stato !== 409 && (e as ErroreSync).stato !== 404) throw e;
      }
      return mappa;
    },
    async blob(sha: string): Promise<Uint8Array> {
      const b = await chiama<{ content: string }>('GET', `/git/blobs/${sha}`);
      return base64ToBytes(b.content.replace(/\s/g, ''));
    },
    async scrivi(percorso: string, dati: Uint8Array, messaggio: string, ramo: string, sha?: string): Promise<string> {
      const r = await chiama<{ content: { sha: string } }>('PUT', `/contents/${percorso}`, {
        message: messaggio,
        content: bytesToBase64(dati),
        branch: ramo,
        ...(sha ? { sha } : {}),
      });
      return r.content.sha;
    },
  };
}

// ---------------- sincronizzazione ----------------

const testo = new TextEncoder();
const leggi = new TextDecoder();
const estensione = (type: string) => (type === 'image/png' ? 'png' : 'jpg');
const percorsoSopralluogo = (id: string) => `sopralluoghi/${id}.json`;

/** Verifica repository e chiave. Restituisce un messaggio d'errore leggibile o null se va tutto bene. */
export async function verificaConfig(c: ConfigSync, f: Fetch = fetch): Promise<string | null> {
  try {
    const info = await client(c, f).info();
    if (!info.private) return 'Il repository è pubblico: per i dati dei condomini deve essere privato.';
    if (info.permissions && info.permissions.push === false) return 'La chiave può leggere ma non scrivere nel repository.';
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

let inCorso: Promise<EsitoSync> | null = null;

/** Sincronizza (una alla volta): scarica le novità degli altri dispositivi e invia le proprie. */
export function sincronizzaOra(opz: { fetch?: Fetch; aperto?: string | null } = {}): Promise<EsitoSync> {
  if (!inCorso) {
    inCorso = esegui(opz).finally(() => {
      inCorso = null;
    });
  }
  return inCorso;
}

async function esegui({ fetch: f = fetch, aperto = null }: { fetch?: Fetch; aperto?: string | null }): Promise<EsitoSync> {
  const config = await leggiConfigSync();
  if (!config?.repo || !config.token) throw new ErroreSync('Sincronizzazione non configurata.');
  const gh = client(config, f);
  const d = await db();
  const stato = await leggiStato();
  const esito: EsitoSync = { inviati: 0, ricevuti: 0, eliminati: 0, foto: 0 };

  const ramo = (await gh.info()).default_branch || 'main';
  const remoto = await gh.albero(ramo);
  const firma = config.nome.trim() || 'dispositivo';
  /** sopralluoghi aperti nell'editor con una versione più recente altrove: non si sovrascrivono */
  const rimandati = new Set<string>();

  // 1) novità dagli altri dispositivi
  for (const [percorso, sha] of remoto) {
    const m = /^sopralluoghi\/(.+)\.json$/.exec(percorso);
    if (!m || stato.sha[percorso] === sha) continue;
    const id = m[1];
    const file = JSON.parse(leggi.decode(await gh.blob(sha))) as FileSopralluogo;
    const locale = await d.get('sopralluoghi', id);

    if (file.eliminato) {
      if (locale && locale.modificato <= (file.modificato ?? 0) && id !== aperto) {
        const tx = d.transaction(['sopralluoghi', 'foto'], 'readwrite');
        await tx.objectStore('sopralluoghi').delete(id);
        for await (const cur of tx.objectStore('foto').index('sopralluogoId').iterate(id)) await cur.delete();
        await tx.done;
        esito.eliminati++;
      }
      stato.sha[percorso] = sha;
      delete stato.versioni[id];
      continue;
    }

    const s = file.sopralluogo;
    if (!s) continue;
    if (id === aperto) {
      // aperto nell'editor: lo aggiorno alla chiusura, senza sovrascrivere la versione più recente
      if (!locale || s.modificato > locale.modificato) rimandati.add(id);
      continue;
    }
    if (stato.eliminati[id]) {
      // cancellato qui ma modificato altrove dopo: vince la modifica più recente
      if (s.modificato <= stato.eliminati[id]) continue;
      delete stato.eliminati[id];
    }
    if (!locale || s.modificato > locale.modificato) {
      // foto mancanti prima del sopralluogo, così non restano riferimenti vuoti
      for (const meta of file.foto ?? []) {
        if (await d.get('foto', meta.id)) continue;
        const shaFoto = remoto.get(`foto/${meta.id}.${estensione(meta.type)}`);
        if (!shaFoto) continue;
        const dati = await gh.blob(shaFoto);
        const rec: FotoRecord = {
          ...meta,
          sopralluogoId: id,
          blob: new Blob([dati as BlobPart], { type: meta.type }),
          creato: Date.now(),
        };
        await d.put('foto', rec);
        esito.foto++;
      }
      await d.put('sopralluoghi', s);
      stato.versioni[id] = s.modificato;
      esito.ricevuti++;
    } else if (locale.modificato === s.modificato) {
      stato.versioni[id] = s.modificato;
    }
    stato.sha[percorso] = sha;
  }

  // 2) cancellazioni fatte qui
  for (const [id, quando] of Object.entries(stato.eliminati)) {
    const percorso = percorsoSopralluogo(id);
    const file: FileSopralluogo = { formato: 'roa-sync', eliminato: true, id, modificato: quando };
    stato.sha[percorso] = await gh.scrivi(
      percorso,
      testo.encode(JSON.stringify(file)),
      `Eliminato sopralluogo (${firma})`,
      ramo,
      remoto.get(percorso),
    );
    delete stato.eliminati[id];
    delete stato.versioni[id];
    esito.eliminati++;
  }

  // 3) modifiche fatte qui
  for (const s of await d.getAll('sopralluoghi')) {
    if (stato.versioni[s.id] === s.modificato || rimandati.has(s.id)) continue;
    const percorso = percorsoSopralluogo(s.id);
    const foto = await d.getAllFromIndex('foto', 'sopralluogoId', s.id);
    const usate = new Set([...s.voci.flatMap((v) => v.fotoIds), ...(s.fotoCopertinaId ? [s.fotoCopertinaId] : [])]);
    const meta: FileSopralluogo['foto'] = [];
    for (const ft of foto) {
      if (!usate.has(ft.id)) continue;
      const p = `foto/${ft.id}.${estensione(ft.type)}`;
      if (!remoto.has(p) && !stato.sha[p]) {
        stato.sha[p] = await gh.scrivi(p, new Uint8Array(await ft.blob.arrayBuffer()), `Foto (${firma})`, ramo);
        esito.foto++;
      }
      meta.push({ id: ft.id, type: ft.type, width: ft.width, height: ft.height });
    }
    const file: FileSopralluogo = { formato: 'roa-sync', sopralluogo: s, foto: meta, autore: firma };
    const nome = s.condominio.nome || s.condominio.indirizzo || s.id.slice(0, 8);
    stato.sha[percorso] = await gh.scrivi(
      percorso,
      testo.encode(JSON.stringify(file)),
      `${nome} (${firma})`,
      ramo,
      remoto.get(percorso) ?? stato.sha[percorso],
    );
    stato.versioni[s.id] = s.modificato;
    esito.inviati++;
    await salvaStato(stato); // avanzamento salvato: se cade la rete non si ricomincia da capo
  }

  stato.ultima = Date.now();
  await salvaStato(stato);
  return esito;
}
