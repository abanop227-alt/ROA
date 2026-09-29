// Elenco lavori (commesse): importato da "ELENCO LAVORI 2026.xlsx" e aggiornato in automatico dalle pratiche dell'app.
// Le righe delle pratiche si calcolano ogni volta dai sopralluoghi (stato, date, referente): non c'è nulla da
// ricopiare a mano. Se una pratica ha lo stesso numero di commessa e lo stesso tipo di una riga importata, la sostituisce.
import { praticaDi, TIPI } from './pratiche';
import { leggiFogli, seriale } from './stabili';
import type { Sopralluogo } from './types';
import { dataItaliana } from './util';
import { creaXlsx, type Valore } from './xlsxScrittura';

export interface Commessa {
  /** numero della commessa (parte intera: "18/26" → 18) */
  numero: number | null;
  numeroTesto: string;
  cliente: string;
  tipoVia: string;
  via: string;
  civico: string;
  cap: string;
  comune: string;
  /** ROA, SCIA, RINNOVO, IPA, RGSA, VISURA… */
  pratica: string;
  referente: string;
  /** "COMPLETO" oppure vuoto (in corso) */
  stato: string;
  /** yyyy-mm-dd */
  dataFine: string;
  dataConsegna: string;
  note: string;
  origine: 'excel' | 'app';
}

const norm = (t: string) => t.replace(/\s+/g, ' ').trim();

export function numeroDa(testo: string): number | null {
  const m = /^\s*(\d+)/.exec(testo);
  return m ? Number(m[1]) : null;
}

/** Legge il foglio delle commesse (quello con le colonne COMM. e PRATICA). */
export async function leggiCommesseXlsx(dati: ArrayBuffer | Uint8Array | Blob): Promise<Commessa[]> {
  const fogli = await leggiFogli(dati);
  for (const f of fogli) {
    const intest = [...f.righe.entries()].find(([, r]) => [...r.values()].some((t) => /^comm\.?$/i.test(t)) && [...r.values()].some((t) => /^pratica$/i.test(t)));
    if (!intest) continue;
    const [r0, riga] = intest;
    const col = (re: RegExp) => [...riga.entries()].find(([, t]) => re.test(t))?.[0];
    const c = {
      numero: col(/^comm/i),
      tipoVia: col(/^via/i),
      via: col(/^indirizzo$/i),
      civico: col(/^civ/i),
      cap: col(/^cap$/i),
      comune: col(/^citt/i),
      pratica: col(/^pratica$/i),
      referente: col(/^referente/i),
      stato: col(/^stato$/i),
      dataFine: col(/^data fine/i),
      dataConsegna: col(/^data consegna/i),
      note: col(/^note/i),
    };
    if (!c.numero || !c.pratica) continue;
    // il cliente sta nella colonna senza intestazione tra il numero e il tipo di via
    const idx = (l: string) => [...l].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
    const colCliente = c.tipoVia
      ? [...new Set([...f.righe.values()].flatMap((r) => [...r.keys()]))].find((k) => idx(k) > idx(c.numero!) && idx(k) < idx(c.tipoVia!))
      : undefined;
    const out: Commessa[] = [];
    for (const [n, r] of [...f.righe.entries()].sort((a, b) => a[0] - b[0])) {
      if (n <= r0) continue;
      const g = (k: string | undefined) => (k ? (r.get(k) ?? '') : '');
      const numTesto = g(c.numero);
      if (!/^\d+/.test(numTesto)) continue;
      const data = (k: string | undefined) => {
        const v = g(k);
        return seriale(v) ?? v;
      };
      out.push({
        numero: numeroDa(numTesto),
        numeroTesto: numTesto,
        cliente: norm(g(colCliente)).toUpperCase(),
        tipoVia: norm(g(c.tipoVia)).toUpperCase(),
        via: norm(g(c.via)).toUpperCase(),
        civico: g(c.civico),
        cap: g(c.cap),
        comune: norm(g(c.comune)).toUpperCase(),
        pratica: norm(g(c.pratica)).toUpperCase(),
        referente: norm(g(c.referente)).toUpperCase(),
        stato: /^compl/i.test(g(c.stato)) || /^compe?l/i.test(g(c.stato)) ? 'COMPLETO' : norm(g(c.stato)).toUpperCase(),
        dataFine: data(c.dataFine),
        dataConsegna: data(c.dataConsegna),
        note: g(c.note),
        origine: 'excel',
      });
    }
    return out;
  }
  throw new Error('Non riconosco l’elenco lavori: cerco le colonne “COMM.” e “PRATICA”.');
}

// ---------------- righe generate dalle pratiche ----------------

const PREFISSI_AMM = /\b(amministrazione|amministrazioni|amministratore|studio|stabili|amm\.?ne|dott\.?|geom\.?|rag\.?|immobiliare|amministrativo)\b/gi;

/** "Amministrazione PASQUALI" → "PASQUALI". */
export function clienteDa(pressoAmministrazione: string): string {
  const t = norm(pressoAmministrazione.replace(PREFISSI_AMM, ' '));
  return (t.split(' ')[0] ?? '').toUpperCase();
}

function daSopralluogo(s: Sopralluogo): Commessa | null {
  const c = s.condominio;
  const numero = numeroDa(c.commessa);
  if (!c.commessa.trim()) return null;
  const p = praticaDi(s);
  const via = /^(.*?)[,\s]+(\d+[\w/\-.]*)$/.exec(c.indirizzo.trim());
  const completo = p.stato === 'eseguiti' || p.stato === 'presentata';
  const emessa = p.stato !== 'bozza';
  return {
    numero,
    numeroTesto: c.commessa.trim(),
    cliente: clienteDa(c.pressoAmministrazione),
    tipoVia: '',
    via: (via ? via[1] : c.indirizzo).trim().toUpperCase(),
    civico: via ? via[2] : '',
    cap: c.cap,
    comune: c.comune.toUpperCase(),
    pratica: TIPI[p.tipo].toUpperCase(),
    referente: p.referente.toUpperCase(),
    stato: completo ? 'COMPLETO' : '',
    dataFine: completo ? p.dataStato : '',
    dataConsegna: emessa ? (p.tipo === 'roa' ? c.dataRelazione : p.dataPresentazione || p.dataStato) : '',
    note: '',
    origine: 'app',
  };
}

/** Elenco lavori completo: righe importate aggiornate con lo stato reale delle pratiche, più le nuove commesse dell'app. */
export function elencoLavori(importate: Commessa[], sopralluoghi: Sopralluogo[]): Commessa[] {
  const chiave = (c: Commessa) => `${c.numero ?? c.numeroTesto}|${c.pratica}`;
  const dalleApp = new Map<string, Commessa>();
  for (const s of sopralluoghi) {
    const c = daSopralluogo(s);
    if (c) dalleApp.set(chiave(c), c);
  }
  const out: Commessa[] = importate.map((i) => {
    const a = dalleApp.get(chiave(i));
    if (!a) return i;
    dalleApp.delete(chiave(i));
    return {
      ...i,
      stato: a.stato || i.stato,
      dataFine: a.dataFine || i.dataFine,
      dataConsegna: a.dataConsegna || i.dataConsegna,
      referente: a.referente || i.referente,
      origine: 'app' as const,
    };
  });
  return [...out, ...dalleApp.values()].sort((x, y) => (x.numero ?? 1e9) - (y.numero ?? 1e9) || x.pratica.localeCompare(y.pratica));
}

// ---------------- esportazione ----------------

const INTESTAZIONE = ['COMM.', '', 'VIA - V.LE - P.ZZA  P.LE -  C.SO - L.GO', 'INDIRIZZO', 'CIV', 'CAP', "CITTA'", 'PRATICA', 'REFERENTE INTERNO', 'STATO', 'DATA FINE', 'DATA CONSEGNA', 'NOTE'];

/** Excel nel formato di "ELENCO LAVORI 2026.xlsx" (foglio STEMA). */
export async function esportaElencoLavoriXlsx(righe: Commessa[], anno = new Date().getFullYear()): Promise<Blob> {
  const dati: Valore[][] = [
    [`STEMA - COMMESSE ${anno}`],
    INTESTAZIONE,
    ...righe.map((c) => [
      c.numero ?? c.numeroTesto,
      c.cliente,
      c.tipoVia,
      c.via,
      c.civico,
      c.cap,
      c.comune,
      c.pratica,
      c.referente,
      c.stato,
      dataItaliana(c.dataFine),
      dataItaliana(c.dataConsegna),
      c.note,
    ]),
  ];
  return creaXlsx([{ nome: 'STEMA', righe: dati, titoli: [0], intestazioni: [1], larghezze: [7, 20, 10, 32, 7, 8, 18, 18, 14, 12, 13, 14, 40] }]);
}
