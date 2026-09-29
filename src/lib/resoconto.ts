// Resoconto mensile dei lavori per amministrazione: cosa è stato completato nel mese, cosa è in corso, cosa scade.
// Si calcola da elenco lavori (commesse importate + pratiche dell'app) e dall'anagrafica stabili.
import type { Commessa } from './commesse';
import { indirizzoStabile, type Stabile } from './stabili';
import { dataItaliana } from './util';

export interface RigaResoconto {
  indirizzo: string;
  comune: string;
  pratica: string;
  /** "Completato", "In corso" */
  stato: string;
  referente: string;
  dataConsegna: string;
  dataFine: string;
  note: string;
}

export interface ScadenzaResoconto {
  indirizzo: string;
  attivita: string;
  /** anno o data (yyyy-mm-dd) come indicato nell'elenco stabili */
  scadenza: string;
}

export interface Resoconto {
  amministrazione: string;
  /** yyyy-mm */
  mese: string;
  completati: RigaResoconto[];
  inCorso: RigaResoconto[];
  consegnati: RigaResoconto[];
  scadenze: ScadenzaResoconto[];
  totale: { completati: number; inCorso: number; consegnati: number };
}

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

export function nomeMese(mese: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(mese);
  return m ? `${MESI[Number(m[2]) - 1]} ${m[1]}` : mese;
}

/** Il mese precedente a oggi ("2026-08" se siamo a settembre 2026). */
export function mesePrecedente(oggi = new Date()): string {
  const d = new Date(oggi.getFullYear(), oggi.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const senza = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\b(STUDIO|SRLS?|SRL|AMMINISTRAZIONE|STABILI|SNC|SAS|S\.R\.L\.?)\b/g, ' ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();

/** Stessa amministrazione: uno dei due nomi (ripuliti da STUDIO, SRL…) contiene l'altro. */
export function stessaAmministrazione(a: string, b: string): boolean {
  const x = senza(a);
  const y = senza(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

/** Amministrazioni note: clienti dell'elenco lavori e amministrazioni degli elenchi stabili, senza doppioni. */
export function amministrazioni(commesse: Commessa[], stabili: Stabile[]): string[] {
  const nomi = [...commesse.map((c) => c.cliente), ...stabili.map((s) => s.amministrazione)].map((n) => n.trim()).filter(Boolean);
  const out: string[] = [];
  for (const n of nomi.sort((a, b) => a.length - b.length)) if (!out.some((o) => stessaAmministrazione(o, n))) out.push(n);
  return out.sort((a, b) => a.localeCompare(b));
}

const inMese = (data: string, mese: string) => data.startsWith(mese);

function indirizzoDi(c: Commessa): string {
  const tipo = c.tipoVia ? c.tipoVia.charAt(0) + c.tipoVia.slice(1).toLowerCase() + ' ' : '';
  const via = c.via.toLowerCase().replace(/(^|\s)\S/g, (x) => x.toUpperCase());
  return `${tipo}${via}${c.civico ? `, ${c.civico}` : ''}`.trim();
}

const riga = (c: Commessa, stato: string): RigaResoconto => ({
  indirizzo: indirizzoDi(c),
  comune: c.comune,
  pratica: c.pratica,
  stato,
  referente: c.referente,
  dataConsegna: c.dataConsegna,
  dataFine: c.dataFine,
  note: c.note,
});

/**
 * Stabili con scadenza (anno o data) nei prossimi 12 mesi dalla fine del mese; un anno solo vale per tutto l'anno.
 * Le scadenze già passate non compaiono: sono materia dello scadenziario.
 */
function scadenzeProssime(stabili: Stabile[], mese: string): ScadenzaResoconto[] {
  const [a, m] = mese.split('-').map(Number);
  const dopoMese = new Date(a, m, 1); // primo giorno del mese dopo
  const limite = new Date(a, m + 11, 1); // 12 mesi dopo
  const out: ScadenzaResoconto[] = [];
  for (const s of stabili) {
    const t = s.scadenza.trim();
    let dentro = false;
    if (/^\d{4}$/.test(t)) dentro = Number(t) >= dopoMese.getFullYear() && Number(t) <= limite.getFullYear();
    else if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
      const d = new Date(`${t}T00:00:00`);
      dentro = d >= dopoMese && d <= limite;
    }
    if (dentro) out.push({ indirizzo: indirizzoStabile(s), attivita: s.attivita.join(', '), scadenza: t });
  }
  return out.sort((x, y) => x.scadenza.localeCompare(y.scadenza) || x.indirizzo.localeCompare(y.indirizzo));
}

export function creaResoconto(amministrazione: string, mese: string, commesse: Commessa[], stabili: Stabile[]): Resoconto {
  const sue = commesse.filter((c) => stessaAmministrazione(c.cliente, amministrazione));
  const sueStabili = stabili.filter((s) => stessaAmministrazione(s.amministrazione, amministrazione));
  const completati = sue.filter((c) => c.stato === 'COMPLETO' && inMese(c.dataFine, mese)).map((c) => riga(c, 'Completato'));
  const consegnati = sue.filter((c) => inMese(c.dataConsegna, mese)).map((c) => riga(c, c.stato === 'COMPLETO' ? 'Completato' : 'In corso'));
  // in corso: non completate, già avviate entro la fine del mese
  const inCorso = sue.filter((c) => c.stato !== 'COMPLETO').map((c) => riga(c, 'In corso'));
  const ordina = (l: RigaResoconto[]) => l.sort((x, y) => x.indirizzo.localeCompare(y.indirizzo) || x.pratica.localeCompare(y.pratica));
  return {
    amministrazione,
    mese,
    completati: ordina(completati),
    inCorso: ordina(inCorso),
    consegnati: ordina(consegnati),
    scadenze: scadenzeProssime(sueStabili, mese),
    totale: { completati: completati.length, inCorso: inCorso.length, consegnati: consegnati.length },
  };
}

/** Riga di testo per le tabelle: "Via Aosta, 21 – ROA". */
export const descrizioneRiga = (r: RigaResoconto) => `${r.indirizzo}${r.comune ? ` (${r.comune})` : ''} – ${r.pratica}`;
export const dataRiga = (r: RigaResoconto) => dataItaliana(r.dataFine || r.dataConsegna);
