// Sincronizzazione automatica: all'avvio, al ritorno della rete, quando l'app torna in primo piano
// e qualche secondo dopo ogni modifica. Lo stato viene annunciato con l'evento "roa-sync".
import { ErroreSync, leggiConfigSync, sincronizzaOra, type EsitoSync } from './sync';

export type StatoAutoSync =
  | { stato: 'spenta' }
  | { stato: 'in-corso' }
  | { stato: 'ok'; esito: EsitoSync; quando: number }
  | { stato: 'errore'; messaggio: string; quando: number };

let ultimo: StatoAutoSync = { stato: 'spenta' };
let timer: number | undefined;
let aperto: string | null = null;
let avviata = false;

function annuncia(s: StatoAutoSync) {
  ultimo = s;
  window.dispatchEvent(new CustomEvent<StatoAutoSync>('roa-sync', { detail: s }));
}

export function statoSync(): StatoAutoSync {
  return ultimo;
}

/** Sopralluogo aperto nell'editor: non viene sostituito da versioni arrivate da altri dispositivi. */
export function impostaAperto(id: string | null): void {
  aperto = id;
}

export function programmaSync(ritardo = 4000): void {
  window.clearTimeout(timer);
  timer = window.setTimeout(esegui, ritardo);
}

async function esegui() {
  if (!(await leggiConfigSync().catch(() => undefined))) {
    annuncia({ stato: 'spenta' });
    return;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    annuncia({ stato: 'errore', messaggio: 'Offline: sincronizzerò appena torna la rete.', quando: Date.now() });
    return;
  }
  annuncia({ stato: 'in-corso' });
  try {
    const esito = await sincronizzaOra({ aperto });
    annuncia({ stato: 'ok', esito, quando: Date.now() });
  } catch (e) {
    annuncia({
      stato: 'errore',
      messaggio: e instanceof ErroreSync ? e.message : `Sincronizzazione non riuscita: ${(e as Error).message}`,
      quando: Date.now(),
    });
  }
}

export function avviaSyncAutomatica(): void {
  if (avviata) return;
  avviata = true;
  window.addEventListener('online', () => programmaSync(500));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') programmaSync(500);
  });
  programmaSync(300);
}
