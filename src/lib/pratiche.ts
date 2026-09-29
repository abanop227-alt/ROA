// Pratiche: una ROA nasce come bozza, viene emessa, i lavori si eseguono e solo allora si compila la SCIA.
// Il rinnovo periodico (art. 5 D.P.R. 151/2011) ha una scadenza che dipende dalle attività.
import { nuovoSopralluogo } from './catalogo';
import type { Pratica, Sopralluogo, StatoPratica, TipoPratica } from './types';
import { nuovoId, oggiISO } from './util';

export const TIPI: Record<TipoPratica, string> = { roa: 'ROA', scia: 'SCIA', rinnovo: 'Rinnovo' };

/** Stati possibili per tipo, nell'ordine del flusso di lavoro. */
export const STATI: Record<TipoPratica, StatoPratica[]> = {
  roa: ['bozza', 'emessa', 'lavori', 'eseguiti'],
  scia: ['bozza', 'presentata'],
  rinnovo: ['bozza', 'presentata'],
};

export const NOME_STATO: Record<TipoPratica, Partial<Record<StatoPratica, string>>> = {
  roa: { bozza: 'In compilazione', emessa: 'ROA emessa', lavori: 'Lavori in corso', eseguiti: 'Lavori eseguiti' },
  scia: { bozza: 'In compilazione', presentata: 'SCIA presentata' },
  rinnovo: { bozza: 'In compilazione', presentata: 'Rinnovo presentato' },
};

export function praticaVuota(tipo: TipoPratica = 'roa'): Pratica {
  return { tipo, stato: 'bozza', referente: '', origineId: null, dataStato: oggiISO(), dataPresentazione: '', protocolloPec: '', nPraticaVvf: '' };
}

/** La pratica del sopralluogo; quelli creati prima dell'introduzione delle pratiche sono ROA in bozza. */
export function praticaDi(s: Sopralluogo): Pratica {
  return s.pratica ? { ...praticaVuota(s.pratica.tipo), ...s.pratica } : praticaVuota('roa');
}

export function nomeStato(p: Pratica): string {
  return NOME_STATO[p.tipo][p.stato] ?? p.stato;
}

/** Cambia lo stato (con la data di oggi); stati non previsti per il tipo vengono ignorati. */
export function conStato(s: Sopralluogo, stato: StatoPratica, oggi = oggiISO()): Sopralluogo {
  const p = praticaDi(s);
  if (!STATI[p.tipo].includes(stato) || p.stato === stato) return s;
  return { ...s, pratica: { ...p, stato, dataStato: oggi, ...(stato === 'presentata' && !p.dataPresentazione ? { dataPresentazione: oggi } : {}) } };
}

/** La SCIA si compila solo dopo l'esecuzione dei lavori indicati nella ROA. */
export function puoCreareScia(s: Sopralluogo): boolean {
  const p = praticaDi(s);
  return p.tipo === 'roa' && p.stato === 'eseguiti';
}

export function motivoSciaBloccata(s: Sopralluogo): string | null {
  const p = praticaDi(s);
  if (p.tipo !== 'roa') return 'La SCIA si crea da una ROA.';
  if (p.stato === 'eseguiti') return null;
  return p.stato === 'bozza' || p.stato === 'emessa'
    ? 'La SCIA si compila solo dopo l’esecuzione dei lavori: porta la ROA a “Lavori eseguiti” quando le certificazioni sono arrivate.'
    : 'Porta la ROA a “Lavori eseguiti” per compilare la SCIA.';
}

/**
 * Nuova pratica (SCIA o rinnovo) sullo stesso stabile: copia condominio e attività;
 * frasi e foto della ROA restano nella ROA.
 */
export function nuovaPraticaDa(origine: Sopralluogo, tipo: Exclude<TipoPratica, 'roa'>): Sopralluogo {
  const nuovo = nuovoSopralluogo();
  const p = praticaDi(origine);
  return {
    ...nuovo,
    id: nuovoId(),
    attivita: structuredClone(origine.attivita),
    condominio: { ...structuredClone(origine.condominio), dataSopralluogo: oggiISO(), dataRelazione: oggiISO() },
    pratica: { ...praticaVuota(tipo), referente: p.referente, origineId: origine.id, nPraticaVvf: p.nPraticaVvf },
  };
}

// ---------------- scadenza del rinnovo ----------------

/**
 * Anni di validità per attività (art. 5 D.P.R. 151/2011): cinque, dieci per le attività 6, 7, 8, 64, 71, 72 e 77.
 */
export function anniRinnovo(codice: string): number {
  const numero = codice.trim().split(/[.\s]/)[0];
  return ['6', '7', '8', '64', '71', '72', '77'].includes(numero) ? 10 : 5;
}

/**
 * Scadenza del rinnovo. Attività indipendenti possono avere scadenze distinte; se non lo sono vale il termine minore
 * (chiarimento DCPREV del 19/09/2017). Il nuovo termine decorre dalla data di presentazione, anche se anticipata.
 */
export function scadenzaRinnovo(codici: string[], dataPresentazione: string, indipendenti = false): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataPresentazione) || !codici.length) return null;
  const anni = codici.map(anniRinnovo);
  const n = indipendenti ? Math.max(...anni) : Math.min(...anni);
  const d = new Date(`${dataPresentazione}T00:00:00`);
  d.setFullYear(d.getFullYear() + n);
  return oggiISO(d);
}

/** Scadenze per attività quando sono indipendenti: codice → data. */
export function scadenzeDistinte(codici: string[], dataPresentazione: string): { codice: string; scadenza: string }[] {
  return codici.flatMap((codice) => {
    const s = scadenzaRinnovo([codice], dataPresentazione);
    return s ? [{ codice, scadenza: s }] : [];
  });
}

/** Giorni da oggi alla scadenza (negativo = scaduta). */
export function giorniAllaScadenza(scadenza: string, oggi = oggiISO()): number {
  const g = (t: string) => Date.parse(`${t}T00:00:00Z`);
  return Math.round((g(scadenza) - g(oggi)) / 86_400_000);
}

// ---------------- documenti da allegare ----------------

export interface DocumentoPratica {
  chiave: string;
  testo: string;
  /** chi lo prepara: lo studio o soggetti esterni (installatori, amministratore, banca…) */
  origine: 'studio' | 'esterno';
}

/** Documenti della pratica: quelli dello studio e quelli che arrivano da fuori (certificazioni, bollettino…). */
export function documentiPratica(s: Sopralluogo): DocumentoPratica[] {
  const p = praticaDi(s);
  const idranti = s.attivita.some((a) => /^(75|77)/.test(a.codice));
  if (p.tipo === 'rinnovo') {
    return [
      { chiave: 'pin3', testo: 'MOD. PIN 3 – attestazione di rinnovo periodico', origine: 'studio' },
      { chiave: 'pin31', testo: 'MOD. PIN 3.1 – asseverazione per rinnovo', origine: 'studio' },
      ...(idranti ? [{ chiave: 'idranti', testo: 'Prova idranti / prova di pressione', origine: 'studio' as const }] : []),
      { chiave: 'documenti-tecnico', testo: 'Documenti del tecnico', origine: 'studio' },
      { chiave: 'identita', testo: 'Carta d’identità dell’amministratore', origine: 'esterno' },
      { chiave: 'bollettino', testo: 'Bollettino del rinnovo pagato', origine: 'esterno' },
      { chiave: 'pec', testo: 'Protocollo PEC', origine: 'studio' },
    ];
  }
  if (p.tipo === 'scia') {
    const cert = s.attivita.flatMap((a) =>
      a.certificazioni.filter((c) => c.richiesta).map((c, i) => ({ chiave: `cert:${a.codice}:${i}`, testo: `${a.codice} – ${c.testo}`, origine: 'esterno' as const })),
    );
    return [
      { chiave: 'pin2', testo: 'MOD. PIN 2 – SCIA', origine: 'studio' },
      { chiave: 'pin21', testo: 'MOD. PIN 2.1 – asseverazione', origine: 'studio' },
      { chiave: 'pin22', testo: 'MOD. PIN 2.2 – certificazione REI (se ci sono compartimentazioni)', origine: 'studio' },
      ...(idranti ? [{ chiave: 'idranti', testo: 'Prova idranti / prova di pressione', origine: 'studio' as const }] : []),
      { chiave: 'documenti-tecnico', testo: 'Documenti del tecnico', origine: 'studio' },
      { chiave: 'identita', testo: 'Carta d’identità dell’amministratore', origine: 'esterno' },
      { chiave: 'bollettino', testo: 'Bollettino della SCIA pagato', origine: 'esterno' },
      ...cert,
      { chiave: 'pec', testo: 'Protocollo PEC', origine: 'studio' },
    ];
  }
  return [];
}
