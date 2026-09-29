// Anagrafica degli stabili, importata dagli Excel "Stabili <amministrazione> 2026.xlsx".
// Le colonne si riconoscono dall'intestazione (riga con "CIV" e "CAP"), quindi resta valido anche se ne cambia l'ordine.
// I dati restano solo sul dispositivo (non si sincronizzano): ogni telefono importa i propri elenchi.
import JSZip from 'jszip';
import { nuovoId } from './util';

export interface Stabile {
  id: string;
  /** nome del condominio (colonna A) o, se manca, la via */
  nome: string;
  tipoVia: string;
  via: string;
  civico: string;
  cap: string;
  comune: string;
  contatto: string;
  telefono: string;
  /** numero pratica VV.F. */
  nop: string;
  kw: string;
  /** codici attività D.P.R. 151/11 (es. 74.1.A, 75.2.B) */
  attivita: string[];
  progetto: string;
  scadenza: string;
  codiceFiscale: string;
  note: string;
  /** amministrazione: dal titolo del foglio ("PASQUALI | ELENCO STABILI") */
  amministrazione: string;
  /** file di provenienza */
  origine: string;
}

type Riga = Map<string, string>;

const decodifica = (t: string) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const testiDi = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodifica(m[1])).join('');

export interface Foglio {
  nome: string;
  righe: Map<number, Riga>;
}

/** Legge tutti i fogli, nell'ordine della cartella di lavoro: numero di riga → colonna → testo. */
export async function leggiFogli(dati: ArrayBuffer | Uint8Array | Blob): Promise<Foglio[]> {
  const zip = await JSZip.loadAsync(dati);
  const wb = zip.file('xl/workbook.xml');
  if (!wb) throw new Error('Il file non sembra un Excel valido.');
  const condivise: string[] = [];
  const ss = zip.file('xl/sharedStrings.xml');
  if (ss) for (const m of (await ss.async('string')).matchAll(/<si>([\s\S]*?)<\/si>/g)) condivise.push(testiDi(m[1]));
  const rels = new Map<string, string>();
  const relsXml = (await zip.file('xl/_rels/workbook.xml.rels')?.async('string')) ?? '';
  for (const m of relsXml.matchAll(/<Relationship\s([^>]*?)\/?>/g)) {
    const id = /Id="([^"]+)"/.exec(m[1])?.[1];
    const target = /Target="([^"]+)"/.exec(m[1])?.[1];
    if (id && target) rels.set(id, target.replace(/^\/?(xl\/)?/, 'xl/'));
  }
  const fogli: Foglio[] = [];
  const elenco = [...(await wb.async('string')).matchAll(/<sheet\s([^>]*?)\/?>/g)];
  for (const [i, m] of elenco.entries()) {
    const nome = decodifica(/name="([^"]*)"/.exec(m[1])?.[1] ?? `Foglio${i + 1}`);
    const rid = /r:id="([^"]+)"/.exec(m[1])?.[1];
    const file = zip.file((rid && rels.get(rid)) || `xl/worksheets/sheet${i + 1}.xml`);
    if (!file) continue;
    const xml = await file.async('string');
    const righe = new Map<number, Riga>();
    for (const c of xml.matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const rif = /r="([A-Z]+)(\d+)"/.exec(c[1]);
      if (!rif) continue;
      const tipo = /t="(\w+)"/.exec(c[1])?.[1];
      const corpo = c[2] ?? '';
      let v: string | undefined;
      if (tipo === 'inlineStr') v = testiDi(corpo);
      else {
        const x = /<v>([\s\S]*?)<\/v>/.exec(corpo)?.[1];
        if (x !== undefined) v = tipo === 's' ? condivise[Number(x)] : decodifica(x);
      }
      if (v === undefined || !v.trim()) continue;
      const n = Number(rif[2]);
      if (!righe.has(n)) righe.set(n, new Map());
      righe.get(n)!.set(rif[1], v.replace(/\s+/g, ' ').trim());
    }
    fogli.push({ nome, righe });
  }
  if (!fogli.length) throw new Error('Il file non sembra un Excel valido.');
  return fogli;
}

const seriale = (t: string): string | null => {
  if (!/^\d{5}(\.\d+)?$/.test(t)) return null;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(t)) * 86_400_000);
  return d.toISOString().slice(0, 10);
};

/** "45797" → "2025-05-20"; "2031" resta anno; il resto invariato. */
function normalizzaData(t: string): string {
  return seriale(t) ?? t;
}

const CODICE = /\b(\d{1,2}\.\d\.[A-C])\b/gi;

/** "PASQUALI | ELENCO STABILI" / "ELENCO STABILI BARZETTI" → "PASQUALI" / "BARZETTI". */
function amministrazioneDa(righe: Map<number, Riga>, intestazione: number, nomeFoglio: string): string {
  for (let n = 1; n < intestazione; n++) {
    const t = [...(righe.get(n)?.values() ?? [])].find((x) => /elenco\s+stabili|\|/i.test(x));
    if (t) {
      const pulito = t.replace(/elenco\s+stabili/i, '').replace(/\|/g, ' ').replace(/\s+(20\d\d|per\s+\w+)\s*$/i, '').replace(/\s+/g, ' ').trim();
      if (pulito) return pulito;
    }
  }
  return /^(foglio|sheet)\d*$/i.test(nomeFoglio) ? '' : nomeFoglio.replace(/stabili|20\d\d/gi, '').replace(/\s+/g, ' ').trim();
}

const REGEX_CIVICO = /^(n\S{0,2}\s*)?civ(ico)?\.?$/;
const REGEX_CAP = /^c\.?a\.?p\.?$/;

/** Trova le colonne dalle intestazioni; restituisce anche la riga in cui si trovano. */
function colonne(righe: Map<number, Riga>): { riga: number; col: Record<string, string> } | null {
  for (const [n, r] of righe) {
    const voci = [...r.entries()].map(([c, t]) => [c, t.toLowerCase()] as const);
    if (!voci.some(([, t]) => REGEX_CIVICO.test(t)) || !voci.some(([, t]) => REGEX_CAP.test(t))) continue;
    const trova = (re: RegExp) => voci.find(([, t]) => re.test(t))?.[0];
    const col: Record<string, string> = {};
    const mappa: Record<string, RegExp> = {
      civico: REGEX_CIVICO,
      cap: REGEX_CAP,
      comune: /^citt/,
      contatto: /^contatto/,
      telefono: /^tel(efono)?\.?$/,
      nop: /^nop$/,
      kw: /^pt\s*kw|^kw$/,
      attivita: /(dlgs|dpr|d\.?\s*p\.?\s*r\.?)\s*151/,
      progetto: /^progetto/,
      scadenza: /^scadenza/,
      cf: /^(cf|codice fiscale)$/,
      note: /^note/,
      condominio: /^condominio$/,
    };
    for (const [k, re] of Object.entries(mappa)) {
      const c = trova(re);
      if (c) col[k] = c;
    }
    if (!col.civico || !col.cap) continue;
    return { riga: n, col };
  }
  return null;
}

const indiceColonna = (c: string) => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

const TIPO_VIA = /^(via|viale|v\.le|piazza|p\.zza|p\.le|piazzale|corso|c\.so|largo|l\.go|vicolo|strada|str\.|alzaia|lungo|circonvallazione)$/i;

function stabiliDaFoglio(f: Foglio, nomeFile: string): Stabile[] {
  const { righe } = f;
  const intest = colonne(righe);
  if (!intest) return [];
  const { col, riga: r0 } = intest;
  const amm = amministrazioneDa(righe, r0, f.nome);
  const cCiv = indiceColonna(col.civico);
  const out: Stabile[] = [];
  for (const [n, r] of [...righe.entries()].sort((a, b) => a[0] - b[0])) {
    if (n <= r0) continue;
    const g = (k: string) => (col[k] ? (r.get(col[k]) ?? '') : '');
    // colonne a sinistra del civico: [numero d'ordine] [nome] [tipo di via] via; i soli numeri sono numeri d'ordine
    const sinistra = [...r.entries()]
      .filter(([c]) => indiceColonna(c) < cCiv)
      .sort((a, b) => indiceColonna(a[0]) - indiceColonna(b[0]))
      .map(([, t]) => t)
      .filter((t) => !/^\d+$/.test(t));
    const civico = g('civico');
    if (!sinistra.length || !civico) continue;
    const via = sinistra[sinistra.length - 1];
    const penultimo = sinistra[sinistra.length - 2] ?? '';
    const tipoVia = TIPO_VIA.test(penultimo) ? penultimo : '';
    const nomi = sinistra.slice(0, sinistra.length - (tipoVia ? 2 : 1));
    const attivita = [...new Set([...g('attivita').matchAll(CODICE)].map((m) => m[1].toUpperCase()))];
    out.push({
      id: nuovoId('st-'),
      nome: nomi[0] || via,
      tipoVia: tipoVia.toUpperCase(),
      via,
      civico,
      cap: g('cap'),
      comune: g('comune'),
      contatto: g('contatto'),
      telefono: g('telefono'),
      nop: g('nop'),
      kw: g('kw'),
      attivita,
      progetto: normalizzaData(g('progetto')),
      scadenza: normalizzaData(g('scadenza')),
      codiceFiscale: g('cf'),
      note: g('note'),
      amministrazione: amm,
      origine: nomeFile,
    });
  }
  return out;
}

/** Legge un elenco stabili (tutti i fogli con intestazione riconoscibile, esclusi quelli "PERSI"). */
export async function leggiStabiliXlsx(dati: ArrayBuffer | Uint8Array | Blob, nomeFile = ''): Promise<Stabile[]> {
  const fogli = (await leggiFogli(dati)).filter((f) => !/persi/i.test(f.nome));
  const conIntestazione = fogli.filter((f) => colonne(f.righe));
  if (!conIntestazione.length) throw new Error('Non riconosco l’elenco: cerco una riga di intestazione con “CIV” e “CAP”.');
  const stabili = conIntestazione.flatMap((f) => stabiliDaFoglio(f, nomeFile));
  // i fogli senza titolo (es. un secondo elenco dello stesso cliente) ereditano l'amministrazione del primo
  const primaAmm = stabili.find((x) => x.amministrazione)?.amministrazione ?? '';
  return stabili.map((x) => (x.amministrazione ? x : { ...x, amministrazione: primaAmm }));
}

// ---------------- uso nel sopralluogo ----------------

/** "VIA DEGLI ODESCALCHI" → "Via Degli Odescalchi" (numeri romani e sigle con punto restano maiuscoli). */
function iniziali(t: string): string {
  return t
    .toLowerCase()
    .split(/(\s+)/)
    .map((p) => (/^[ivxlc]+$/.test(p) ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1)))
    .join('');
}

/** "Via Aosta, 21" */
export function indirizzoStabile(s: Stabile): string {
  return `${s.tipoVia ? iniziali(s.tipoVia) + ' ' : ''}${iniziali(s.via)}, ${s.civico}`;
}

const senzaAccenti = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Ricerca per parti del nome, della via, del comune o dell'amministrazione (tutte le parole devono comparire). */
export function cercaStabili(elenco: Stabile[], testo: string, limite = 8): Stabile[] {
  const parole = senzaAccenti(testo).split(/[\s,]+/).filter(Boolean);
  if (!parole.length) return [];
  return elenco
    .filter((s) => {
      const pagliaio = senzaAccenti([s.nome, s.tipoVia, s.via, s.civico, s.comune, s.amministrazione, s.cap].join(' '));
      return parole.every((p) => pagliaio.includes(p));
    })
    .slice(0, limite);
}
