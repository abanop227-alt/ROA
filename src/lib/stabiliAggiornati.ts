// Aggiorna l'Excel degli stabili di un'amministrazione con lo stato reale delle pratiche (ROA, SCIA, rinnovo, scadenza).
// Il file originale non si tocca: si produce una copia con le sole celle cambiate, e l'elenco delle modifiche.
import JSZip from 'jszip';
import { praticaDi, scadenzaRinnovo } from './pratiche';
import { colonne, indiceColonna, leggiFogli, type Stabile } from './stabili';
import type { Sopralluogo } from './types';
import { dataItaliana } from './util';

export type ColonnaStabili = 'roa' | 'scia' | 'rinnovo' | 'scadenza';

export interface Modifica {
  stabileId: string;
  indirizzo: string;
  foglio: string;
  riga: number;
  colonna: ColonnaStabili;
  prima: string;
  dopo: string;
}

const INTESTAZIONI: Record<ColonnaStabili, RegExp> = {
  roa: /^roa\b/i,
  scia: /^scia\b/i,
  rinnovo: /^rinnovo\b/i,
  scadenza: /^scadenza\b/i,
};

const senzaAccenti = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '');
const parole = (t: string) => senzaAccenti(t).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

/** Chiave di confronto tra uno stabile e l'indirizzo di una pratica: via e civico, senza "via/viale…". */
export function chiaveIndirizzo(via: string, civico: string): string {
  const v = parole(via).replace(/^(VIA|VIALE|V LE|PIAZZA|P ZZA|PIAZZALE|CORSO|C SO|LARGO|L GO|VICOLO|STRADA)\s+/, '');
  return `${v}|${parole(civico).replace(/\s/g, '')}`;
}

function chiaveDaIndirizzoTesto(indirizzo: string): string {
  const m = /^(.*?)[,\s]+(\d+[\w/\-.]*)$/.exec(indirizzo.trim());
  return m ? chiaveIndirizzo(m[1], m[2]) : chiaveIndirizzo(indirizzo, '');
}

const dataBreve = (iso: string) => dataItaliana(iso);

/** Modifiche da fare agli stabili in base alle pratiche: solo dove l'app sa qualcosa di più (o di diverso) dell'elenco. */
export function calcolaModifiche(stabili: Stabile[], sopralluoghi: Sopralluogo[], valoriAttuali: (s: Stabile, c: ColonnaStabili) => string = () => ''): Modifica[] {
  const perIndirizzo = new Map<string, Sopralluogo[]>();
  for (const s of sopralluoghi) {
    const k = chiaveDaIndirizzoTesto(s.condominio.indirizzo);
    perIndirizzo.set(k, [...(perIndirizzo.get(k) ?? []), s]);
  }
  const out: Modifica[] = [];
  for (const st of stabili) {
    if (!st.foglio || !st.riga) continue;
    const pratiche = perIndirizzo.get(chiaveIndirizzo(st.via, st.civico));
    if (!pratiche?.length) continue;
    const recente = (tipo: string) =>
      pratiche
        .filter((p) => praticaDi(p).tipo === tipo)
        .sort((a, b) => praticaDi(b).dataStato.localeCompare(praticaDi(a).dataStato))[0];
    const aggiungi = (colonna: ColonnaStabili, dopo: string | null) => {
      if (!dopo) return;
      const prima = valoriAttuali(st, colonna);
      if (prima.trim() === dopo) return;
      out.push({ stabileId: st.id, indirizzo: `${st.via} ${st.civico}`, foglio: st.foglio!, riga: st.riga!, colonna, prima, dopo });
    };
    const roa = recente('roa');
    if (roa) {
      const p = praticaDi(roa);
      aggiungi('roa', p.stato === 'eseguiti' ? `fatta ${dataBreve(p.dataStato)}` : p.stato === 'bozza' ? 'IN CORSO' : p.stato === 'emessa' ? `emessa ${dataBreve(roa.condominio.dataRelazione)}` : 'lavori in corso');
    }
    const scia = recente('scia');
    if (scia && praticaDi(scia).stato === 'presentata') aggiungi('scia', `SCIA ${dataBreve(praticaDi(scia).dataPresentazione)}`);
    const rinnovo = recente('rinnovo');
    if (rinnovo && praticaDi(rinnovo).stato === 'presentata') {
      const p = praticaDi(rinnovo);
      aggiungi('rinnovo', dataBreve(p.dataPresentazione));
      const sc = scadenzaRinnovo(rinnovo.attivita.map((a) => a.codice), p.dataPresentazione, !!p.indipendenti);
      aggiungi('scadenza', sc ? sc.slice(0, 4) : null);
    }
  }
  return out;
}

// ---------------- lettura dei valori attuali e scrittura ----------------

interface Colonne {
  [foglio: string]: Partial<Record<ColonnaStabili, string>>;
}

async function colonneDelFile(dati: ArrayBuffer | Uint8Array | Blob) {
  const fogli = await leggiFogli(dati);
  const col: Colonne = {};
  const valori = new Map<string, string>(); // "foglio|colonna|riga" → testo
  for (const f of fogli) {
    const intest = colonne(f.righe);
    if (!intest) continue;
    const riga = f.righe.get(intest.riga)!;
    col[f.nome] = {};
    for (const [k, re] of Object.entries(INTESTAZIONI) as [ColonnaStabili, RegExp][]) {
      const c = [...riga.entries()].find(([, t]) => re.test(t.trim()))?.[0];
      if (c) col[f.nome][k] = c;
    }
    for (const [n, r] of f.righe) for (const [c, t] of r) valori.set(`${f.nome}|${c}|${n}`, t);
  }
  return { col, valori };
}

/** Modifiche per un file: legge i valori attuali dal file stesso e le colonne dalle intestazioni. */
export async function modifichePerFile(originale: ArrayBuffer | Uint8Array | Blob, stabili: Stabile[], sopralluoghi: Sopralluogo[]): Promise<Modifica[]> {
  const { col, valori } = await colonneDelFile(originale);
  const attuale = (s: Stabile, c: ColonnaStabili) => {
    const lettera = col[s.foglio ?? '']?.[c];
    return lettera ? (valori.get(`${s.foglio}|${lettera}|${s.riga}`) ?? '') : '';
  };
  const conColonna = stabili.filter((s) => s.foglio && col[s.foglio]);
  return calcolaModifiche(conColonna, sopralluoghi, attuale).filter((m) => col[m.foglio]?.[m.colonna]);
}

const escXml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Scrive le celle nel file (stringhe inline, stile della cella conservato) e restituisce la copia aggiornata. */
export async function applicaModifiche(originale: ArrayBuffer | Uint8Array | Blob, modifiche: Modifica[]): Promise<Blob> {
  const { col } = await colonneDelFile(originale);
  const zip = await JSZip.loadAsync(originale);
  const wb = await zip.file('xl/workbook.xml')!.async('string');
  const rels = new Map<string, string>();
  for (const m of ((await zip.file('xl/_rels/workbook.xml.rels')?.async('string')) ?? '').matchAll(/<Relationship\s([^>]*?)\/?>/g)) {
    const id = /Id="([^"]+)"/.exec(m[1])?.[1];
    const t = /Target="([^"]+)"/.exec(m[1])?.[1];
    if (id && t) rels.set(id, t.replace(/^\/?(xl\/)?/, 'xl/'));
  }
  const percorso = new Map<string, string>();
  [...wb.matchAll(/<sheet\s([^>]*?)\/?>/g)].forEach((m, i) => {
    const nome = (/name="([^"]*)"/.exec(m[1])?.[1] ?? '').replace(/&amp;/g, '&');
    const rid = /r:id="([^"]+)"/.exec(m[1])?.[1];
    percorso.set(nome, (rid && rels.get(rid)) || `xl/worksheets/sheet${i + 1}.xml`);
  });
  const perFoglio = new Map<string, Modifica[]>();
  for (const m of modifiche) perFoglio.set(m.foglio, [...(perFoglio.get(m.foglio) ?? []), m]);
  for (const [foglio, lista] of perFoglio) {
    const file = percorso.get(foglio);
    if (!file || !zip.file(file)) continue;
    let xml = await zip.file(file)!.async('string');
    for (const m of lista) {
      const lettera = col[foglio]?.[m.colonna];
      if (!lettera) continue;
      xml = scriviCella(xml, lettera, m.riga, m.dopo);
    }
    zip.file(file, xml);
  }
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** Imposta la cella `lettera+riga` nel foglio XML, mantenendo l'ordine delle celle nella riga. */
export function scriviCella(xml: string, lettera: string, riga: number, testo: string): string {
  const rif = `${lettera}${riga}`;
  const reRiga = new RegExp(`<row\\b([^>]*\\br="${riga}"[^>]*?)(/>|>([\\s\\S]*?)</row>)`);
  const mr = reRiga.exec(xml);
  if (!mr) return xml; // la riga non esiste: non la creiamo
  const attrRiga = mr[1];
  const dentro = mr[3] ?? '';
  const cellaRe = new RegExp(`<c\\b[^>]*\\br="${rif}"[^>]*?(?:/>|>[\\s\\S]*?</c>)`);
  const esistente = cellaRe.exec(dentro);
  const stile = esistente ? /\bs="(\d+)"/.exec(esistente[0])?.[1] : undefined;
  const nuova = `<c r="${rif}"${stile ? ` s="${stile}"` : ''} t="inlineStr"><is><t xml:space="preserve">${escXml(testo)}</t></is></c>`;
  let nuovoDentro: string;
  if (esistente) nuovoDentro = dentro.replace(esistente[0], nuova);
  else {
    const celle = [...dentro.matchAll(/<c\b[^>]*\br="([A-Z]+)\d+"[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g)];
    const dopo = celle.find((c) => indiceColonna(c[1]) > indiceColonna(lettera));
    nuovoDentro = dopo ? dentro.replace(dopo[0], nuova + dopo[0]) : dentro + nuova;
  }
  return xml.replace(mr[0], `<row ${attrRiga.trim()}>${nuovoDentro}</row>`);
}
