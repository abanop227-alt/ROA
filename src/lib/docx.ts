// Generazione della bozza Word con la formattazione delle ROA dello studio
// (modello: TORRE_11D_ROA.docx): A4, Arial 12, titoli sottolineati, indice con puntini,
// frasi a) b) c) per sezione, foto alte 7 cm, computo con griglia, piè di pagina Arial 8.
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  HorizontalPositionRelativeFrom,
  ImageRun,
  LevelFormat,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  Tab,
  TabStopType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  TextWrappingType,
  UnderlineType,
  VerticalAlign,
  VerticalPositionRelativeFrom,
  WidthType,
  type ParagraphChild,
} from 'docx';
import {
  committente,
  descrizioneScopo,
  gruppiDocumento,
  riferimentoVerifica,
  righeTitolo,
  testoConclusioni,
} from './catalogo';
import { totaleComplessivo, zoneComputo } from './computo';
import { formatNumero, formatQuantita, parseNumero } from './numeri';
import type { Catalogo, Sopralluogo, Tecnico } from './types';
import { dataItaliana } from './util';

export interface FotoDati {
  data: Uint8Array;
  width: number;
  height: number;
}
export type CaricaFoto = (id: string) => Promise<FotoDati | null>;

export interface OpzioniDocumento {
  /** immagine a pagina intera dietro al testo (carta intestata dello studio) */
  cartaIntestata?: FotoDati | null;
}

// ---------- pagina (come il modello) ----------
const PAGINA_W = 11906; // A4
const PAGINA_H = 16838;
const M_SUP = 1560; // 2,75 cm
const M_DX = 849; // 1,5 cm
const M_INF = 1134; // 2 cm
const M_SX = 1134; // 2 cm
export const LARGHEZZA_UTILE = PAGINA_W - M_SX - M_DX; // 9923 DXA
const FONT = 'Arial';
const CORPO = 24; // 12 pt
export const PX_CM = 96 / 2.54;
const TAB_TITOLO = 709;

type Allineamento = (typeof AlignmentType)[keyof typeof AlignmentType];

// ---------- stima dell'impaginazione (numeri di pagina dell'indice già compilato) ----------
const ALTEZZA_UTILE = PAGINA_H - M_SUP - M_INF; // 14144 twip
export const RIGA = 317; // Arial 12, interlinea 1,15
const CARATTERI_RIGA = 86; // media per riga a tutta larghezza, Arial 12

export interface VoceIndice {
  numero: string;
  testo: string;
  livello: number;
  pagina: number;
}

/** Tiene il conto approssimativo di dove cade ogni titolo: serve solo a precompilare l'indice. */
export class Impaginazione {
  pagina = 1;
  y = 0;
  voci: VoceIndice[] = [];
  private scorri() {
    while (this.y > ALTEZZA_UTILE) {
      this.pagina++;
      this.y -= ALTEZZA_UTILE;
    }
  }
  spazio(tw: number) {
    this.y += tw;
    this.scorri();
  }
  testo(t: string, o: { left?: number; size?: number; before?: number; after?: number; line?: number } = {}) {
    const size = o.size ?? CORPO;
    const perRiga = (CARATTERI_RIGA * (LARGHEZZA_UTILE - (o.left ?? 0))) / LARGHEZZA_UTILE * (CORPO / size);
    const n = Math.max(1, Math.ceil(t.length / perRiga));
    this.spazio((o.before ?? 0) + n * (o.line ?? RIGA) * (size / CORPO) + (o.after ?? 0));
  }
  /** blocco che non si spezza (foto): se non ci sta va alla pagina dopo */
  blocco(h: number) {
    if (this.y > 0 && this.y + h > ALTEZZA_UTILE) {
      this.pagina++;
      this.y = 0;
    }
    this.spazio(h);
  }
  salto() {
    if (this.y > 0) {
      this.pagina++;
      this.y = 0;
    }
  }
  titolo(numero: string, testo: string, livello: number) {
    const h = 240 + 346 + 240;
    if (this.y > 0 && this.y + h + 2 * RIGA > ALTEZZA_UTILE) {
      this.pagina++;
      this.y = 0;
    }
    this.voci.push({ numero, testo, livello, pagina: this.pagina });
    this.spazio(h);
  }
}

let imp: Impaginazione | null = null;

/** Costruisce un corpo di documento tenendo il conto dell'impaginazione (serve all'indice già compilato). */
export async function conImpaginazione<T>(costruisci: () => Promise<T> | T): Promise<{ risultato: T; stima: Impaginazione }> {
  const stima = new Impaginazione();
  imp = stima;
  try {
    return { risultato: await costruisci(), stima };
  } finally {
    imp = null;
  }
}

// ---------- utilità ----------

export function tipoImmagine(data: Uint8Array): 'jpg' | 'png' | null {
  if (data[0] === 0xff && data[1] === 0xd8) return 'jpg';
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return 'png';
  return null;
}

interface OpzRun {
  bold?: boolean;
  italics?: boolean;
  size?: number;
}

/** Testo con le parti ancora tra [parentesi quadre] evidenziate in giallo. */
function runs(testo: string, opz: OpzRun = {}): TextRun[] {
  const out: TextRun[] = [];
  const re = /\[[^\]]*\]/g;
  let ultimo = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(testo))) {
    if (m.index > ultimo) out.push(new TextRun({ text: testo.slice(ultimo, m.index), ...opz }));
    out.push(new TextRun({ text: m[0], highlight: 'yellow', ...opz }));
    ultimo = m.index + m[0].length;
  }
  if (ultimo < testo.length) out.push(new TextRun({ text: testo.slice(ultimo), ...opz }));
  return out;
}

function righe(testo: string): string[] {
  return testo
    .split(/\r?\n/)
    .map((r) => r.trimEnd())
    .filter((r) => r.trim() !== '');
}

interface OpzPar extends OpzRun {
  after?: number;
  before?: number;
  align?: Allineamento;
  left?: number;
  keepNext?: boolean;
}

export function par(testo: string, opz: OpzPar = {}): Paragraph {
  const { after = 240, before = 0, align = AlignmentType.JUSTIFIED, left, keepNext, ...r } = opz;
  imp?.testo(testo, { left, size: r.size, before, after });
  return new Paragraph({
    alignment: align,
    spacing: { before, after },
    indent: left ? { left } : undefined,
    keepNext,
    children: runs(testo, r),
  });
}

export function paragrafi(testo: string, opz: OpzPar = {}): Paragraph[] {
  return righe(testo).map((r) => par(r, opz));
}

export function vuoto(after = 0): Paragraph {
  imp?.spazio(RIGA + after);
  return new Paragraph({ spacing: { after }, children: [] });
}

export function saltoPagina(): Paragraph {
  imp?.salto();
  return new Paragraph({ children: [new PageBreak()] });
}

export function titolo(numero: string, testo: string, livello: 1 | 2 | 3 | 4): Paragraph {
  const heading = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4][livello - 1];
  imp?.titolo(numero, testo, livello);
  return new Paragraph({
    heading,
    tabStops: [
      { type: TabStopType.LEFT, position: TAB_TITOLO },
      { type: TabStopType.LEFT, position: 1134 },
    ],
    children: [new TextRun({ children: [numero, new Tab(), testo] })],
  });
}

/** Elenchi del modello (vedi numbering in creaDocumento). */
function elenco(reference: string, testo: string, opz: { level?: number; instance?: number; after?: number; left?: number } = {}): Paragraph {
  imp?.testo(testo, { left: opz.left ?? 720, after: opz.after ?? 0 });
  return new Paragraph({
    numbering: { reference, level: opz.level ?? 0, ...(opz.instance !== undefined ? { instance: opz.instance } : {}) },
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: opz.after ?? 0 },
    children: runs(testo),
  });
}

const nessunBordo = { style: BorderStyle.NONE, size: 0, color: 'auto' };
const bordiNessuno = {
  top: nessunBordo,
  bottom: nessunBordo,
  left: nessunBordo,
  right: nessunBordo,
  insideHorizontal: nessunBordo,
  insideVertical: nessunBordo,
};
// "Griglia tabella" di Word: linea singola 1/2 pt, colore automatico
const linea = { style: BorderStyle.SINGLE, size: 4, color: 'auto' };
const griglia = { top: linea, bottom: linea, left: linea, right: linea, insideHorizontal: linea, insideVertical: linea };

function cella(
  contenuto: string | Paragraph[],
  width: number,
  opz: { bold?: boolean; align?: Allineamento; columnSpan?: number; line?: number } = {},
): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    columnSpan: opz.columnSpan,
    verticalAlign: VerticalAlign.CENTER,
    children:
      typeof contenuto === 'string'
        ? [
            new Paragraph({
              alignment: opz.align ?? AlignmentType.LEFT,
              spacing: { after: 0, ...(opz.line ? { line: opz.line } : {}) },
              children: runs(contenuto, { bold: opz.bold }),
            }),
          ]
        : contenuto,
  });
}

export function bloccoFirma(tecnico: Tecnico, data: string): Table {
  imp?.spazio(4 * RIGA);
  const w = [5462, LARGHEZZA_UTILE - 5462];
  const luogoData = `${tecnico.luogo.trim() || '[luogo]'}, ${dataItaliana(data) || '[data]'}`;
  return new Table({
    width: { size: LARGHEZZA_UTILE, type: WidthType.DXA },
    columnWidths: w,
    borders: bordiNessuno,
    rows: [
      new TableRow({
        children: [
          cella(luogoData, w[0]),
          cella(
            [
              new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [new TextRun('Il Tecnico')] }),
              vuoto(),
              vuoto(),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 0 },
                children: runs(tecnico.firma.trim() || '[firma del tecnico]', { bold: true }),
              }),
            ],
            w[1],
          ),
        ],
      }),
    ],
  });
}

// ---------- foto ----------

function riferimentoFoto(numeri: number[]): string {
  return `(foto ${numeri.join(' – ')})`;
}

/** Aggiunge "(foto 7 – 8)" alla fine del primo paragrafo, prima del punto finale (come nelle ROA). */
export function testoConRiferimentoFoto(testo: string, numeri: number[] | undefined): string {
  if (!numeri?.length || /\(foto/i.test(testo)) return testo;
  const [primo, ...resto] = testo.trim().split(/\r?\n/);
  return [conRiferimento(primo, numeri), ...resto].join('\n');
}

function conRiferimento(riga: string, numeri: number[]): string {
  const t = riga.trimEnd();
  const rif = riferimentoFoto(numeri);
  // "VV.F." o "D.M." finali: il punto è dell'abbreviazione
  if (/[A-Z]\.[A-Z]\.$/.test(t)) return `${t} ${rif}.`;
  const m = /[.;:]$/.exec(t);
  return m ? `${t.slice(0, -1)} ${rif}${m[0]}` : `${t} ${rif}.`;
}

export function didascaliaFoto(numeri: number[], didascalia: string): string {
  const d = didascalia.trim();
  const fine = d && !/[.!?]$/.test(d) ? '.' : '';
  return numeri.map((n) => `Foto ${n}`).join(' – ') + (d ? ` – ${d}${fine}` : '');
}

export interface Immagine {
  f: FotoDati;
  tipo: 'jpg' | 'png';
}

export async function caricaImmagini(ids: string[], carica: CaricaFoto): Promise<Immagine[]> {
  const out: Immagine[] = [];
  for (const id of ids) {
    const f = await carica(id);
    const tipo = f && tipoImmagine(f.data);
    if (f && tipo && f.width && f.height) out.push({ f, tipo });
  }
  return out;
}

/** Dimensioni in px: foto singola alta 7 cm; in coppia larga 7 cm; mai oltre i limiti indicati. */
export function misuraFoto(f: FotoDati, inCoppia: boolean): { width: number; height: number } {
  const r = f.height / f.width;
  let w: number;
  let h: number;
  if (inCoppia) {
    w = 7 * PX_CM;
    h = w * r;
    if (h > 9.5 * PX_CM) {
      h = 9.5 * PX_CM;
      w = h / r;
    }
  } else {
    h = 7 * PX_CM;
    w = h / r;
    if (w > 16 * PX_CM) {
      w = 16 * PX_CM;
      h = w * r;
    }
  }
  return { width: Math.round(w), height: Math.round(h) };
}

export function bloccoFoto(immagini: Immagine[], numeri: number[], didascalia: string): Paragraph[] {
  const out: Paragraph[] = [];
  const inCoppia = immagini.length > 1;
  for (let i = 0; i < immagini.length; i += 2) {
    const children: ParagraphChild[] = [];
    immagini.slice(i, i + 2).forEach(({ f, tipo }, j) => {
      if (j) children.push(new TextRun('      '));
      children.push(new ImageRun({ type: tipo, data: f.data, transformation: misuraFoto(f, inCoppia) }));
    });
    const alta = Math.max(...immagini.slice(i, i + 2).map(({ f }) => misuraFoto(f, inCoppia).height));
    imp?.blocco(alta * 15 + 240 + (i + 2 >= immagini.length ? RIGA + 240 : 0));
    out.push(new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 120, after: 120 }, children }));
  }
  const stima = imp;
  imp = null; // la didascalia è già compresa nel blocco dell'ultima riga di foto
  out.push(par(didascaliaFoto(numeri, didascalia), { bold: true, italics: true, align: AlignmentType.CENTER }));
  imp = stima;
  return out;
}

// ---------- sezioni del documento ----------

function frontespizio(s: Sopralluogo): Paragraph[] {
  const c = s.condominio;
  const indirizzo = [c.indirizzo.trim(), c.comune.trim()].filter(Boolean).join(' – ').toUpperCase() || '[INDIRIZZO – COMUNE]';
  const attivita = s.attivita.length ? s.attivita.map((a, i) => (i ? 'E ' : '') + righeTitolo(a)) : ['[ATTIVITÀ]'];
  const testo = [
    'VERIFICA DELLO STATO DEI LUOGHI PER L’ADEGUAMENTO DELLO STABILE',
    ...attivita,
    `RELATIVAMENTE AL CONDOMINIO${c.nome.trim() ? ' ' + c.nome.trim().toUpperCase() : ''}`,
    indirizzo,
    'AI FINI DELLA PREVENZIONE INCENDI.',
  ].join(' ');
  // un unico paragrafo giustificato, Arial 20 grassetto, rientri 1,25 / 1 cm
  return [
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      indent: { left: 709, right: 567 },
      spacing: { after: 120, line: 240 },
      children: runs(testo, { bold: true, size: 40 }),
    }),
  ];
}

export async function copertina(s: Sopralluogo, carica: CaricaFoto): Promise<Paragraph[]> {
  if (!s.fotoCopertinaId) return [];
  const f = await carica(s.fotoCopertinaId);
  const tipo = f && tipoImmagine(f.data);
  if (!f || !tipo) return [];
  // fino a 14 × 18,6 cm, come nel modello
  let w = 14 * PX_CM;
  let h = (w * f.height) / f.width;
  if (h > 18.6 * PX_CM) {
    h = 18.6 * PX_CM;
    w = (h * f.width) / f.height;
  }
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 360, after: 0 },
      children: [new ImageRun({ type: tipo, data: f.data, transformation: { width: Math.round(w), height: Math.round(h) } })],
    }),
  ];
}

/**
 * Indice come nelle ROA dello studio: una riga per titolo con numero, testo, puntini e pagina,
 * già compilato (si vede anche sul telefono). Aprendo il file, Word propone di aggiornarlo.
 */
function indice(voci: VoceIndice[], primaPagina: number): (Paragraph | TableOfContents)[] {
  const righeIndice = voci.map(
    (v) =>
      new Paragraph({
        style: `TOC${Math.min(v.livello, 4)}`,
        children: [
          new TextRun({ text: v.numero }),
          new TextRun({ children: [new Tab()] }),
          new TextRun({ text: v.testo, italics: v.livello === 4 }),
          new TextRun({ children: [new Tab()] }),
          new TextRun({ text: String(v.pagina + primaPagina - 1) }),
        ],
      }),
  );
  return [
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [new TextRun({ text: 'INDICE', bold: true, size: 40 })],
    }),
    new TableOfContents('Indice', { hyperlink: true, headingStyleRange: '1-4', contentChildren: righeIndice }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

/** Capitolo 1 fino alla tabella dei dati del committente (comune a ROA e prova idranti). */
export function datiGenerali(s: Sopralluogo, tecnico: Tecnico): (Paragraph | Table)[] {
  const c = s.condominio;
  const out: (Paragraph | Table)[] = [titolo('1', 'PARTE GENERALE', 1)];

  const intest = righe(tecnico.intestazione);
  if (intest.length) intest.forEach((r) => out.push(par(r, { after: 0, align: AlignmentType.LEFT })));
  else out.push(par('[Dati del tecnico: compilali in Impostazioni tecnico nella schermata iniziale]', { after: 0 }));
  out.push(vuoto(240));

  const campi: [string, string][] = [
    ['Committente:', committente(s)],
    ['C.F.', c.codiceFiscale],
    ['c/o', c.pressoAmministrazione],
    ['Indirizzo', c.indirizzoAmministrazione],
    ['Telefono', c.telefono],
    ['Commessa', c.commessa],
  ];
  const compilati = campi.filter(([, v]) => v && v.trim());
  if (compilati.length) {
    imp?.spazio(compilati.length * 420);
    // tabella senza bordi, interlinea 1,5
    const w1 = 1767;
    const w2 = LARGHEZZA_UTILE - 218 - w1;
    out.push(
      new Table({
        width: { size: w1 + w2, type: WidthType.DXA },
        indent: { size: 218, type: WidthType.DXA },
        columnWidths: [w1, w2],
        borders: bordiNessuno,
        rows: compilati.map(([k, v]) => new TableRow({ children: [cella(k, w1, { line: 360 }), cella(v.trim(), w2, { line: 360 })] })),
      }),
      vuoto(240),
    );
  }
  return out;
}

function parteGenerale(s: Sopralluogo, tecnico: Tecnico): (Paragraph | Table)[] {
  const c = s.condominio;
  const out = datiGenerali(s, tecnico);

  out.push(par('Lo scopo del presente elaborato consiste in:', { after: 120 }));
  if (!s.attivita.length) out.push(par('1) Verificare che lo stato di fatto sia conforme [riferimento] per attività: [attività]'));
  s.attivita.forEach((a, i) => {
    out.push(par(`${i === 0 ? '1) ' : ''}Verificare che lo stato di fatto sia conforme ${riferimentoVerifica(a)} per attività:`, { after: 0 }));
    out.push(par(`${a.codice}: ${descrizioneScopo(a).replace(/\.?$/, '.')}`, { left: 709, after: 120 }));
  });
  out.push(
    par('2) Elencare le certificazioni e le documentazioni da produrre da parte dell’amministrazione dello stabile, e/o degli installatori.'),
  );

  const plurale = s.attivita.length > 1;
  out.push(
    par(
      plurale
        ? 'Dal sopralluogo è stato riscontrato che le attività soggette al controllo del Comando dei Vigili del Fuoco presente nel Condominio in oggetto sono identificate al numero del D.P.R. 151/11:'
        : 'Dal sopralluogo è stato riscontrato che l’attività soggetta al controllo del Comando dei Vigili del Fuoco presente nel Condominio in oggetto è identificata al numero del D.P.R. 151/11:',
      { after: 0 },
    ),
  );
  s.attivita.forEach((a, i) => {
    const fine = i === s.attivita.length - 1 ? '.' : ';';
    out.push(par(`${a.codice}: ${(a.descrizione.trim() || '[classificazione]').replace(/[.;]?$/, fine)}`, { left: 709, after: 0 }));
  });
  out.push(vuoto(480), bloccoFirma(tecnico, c.dataRelazione));
  return out;
}

async function esposizione(s: Sopralluogo, catalogo: Catalogo, carica: CaricaFoto): Promise<Paragraph[]> {
  const out: Paragraph[] = [
    saltoPagina(),
    titolo('2', 'ESPOSIZIONE DELLA CONSULENZA', 1),
    ...paragrafi(catalogo.testi.esposizione),
    titolo('2.1', 'ADEGUAMENTI', 2),
  ];
  let contaFoto = 0;
  let istanzaLettere = 0;
  const gruppi = gruppiDocumento(s);
  for (const [i, g] of gruppi.entries()) {
    const n3 = `2.1.${i + 1}`;
    out.push(titolo(n3, `ATTIVITA’ “${g.attivita.codice}”`, 3));
    if (g.attivita.regolaTecnicaTesto.trim()) out.push(...paragrafi(g.attivita.regolaTecnicaTesto, { italics: true }));
    if (g.attivita.introduzione.trim()) out.push(...paragrafi(g.attivita.introduzione));
    if (!g.sezioni.length) out.push(par('Non sono state rilevate prescrizioni per questa attività.'));
    for (const [j, { sezione, voci }] of g.sezioni.entries()) {
      out.push(titolo(`${n3}.${j + 1}`, sezione.titolo.trim() || 'Sezione', 4));
      istanzaLettere++; // a), b), c)… ripartono in ogni sezione
      for (const v of voci) {
        const immagini = await caricaImmagini(v.fotoIds, carica);
        const nf = immagini.map(() => ++contaFoto);
        const r = righe(testoConRiferimentoFoto(v.testo.trim() || '[testo]', nf));
        r.forEach((riga, k) => {
          const ultima = k === r.length - 1;
          out.push(
            k === 0
              ? elenco('lettere', riga, { instance: istanzaLettere, after: ultima && !immagini.length ? 240 : 0, left: 360 })
              : par(riga, { left: 360, after: ultima && !immagini.length ? 240 : 0 }),
          );
        });
        if (immagini.length) out.push(...bloccoFoto(immagini, nf, v.didascalia));
      }
    }
  }
  if (!gruppi.length) out.push(par('[Nessuna attività selezionata]'));

  const cartelli = s.cartelli.filter((c) => c.descrizione.trim());
  if (cartelli.length) {
    out.push(titolo('2.2', 'ORDINE CARTELLI E SEGNALETICA DI SICUREZZA', 2));
    for (const c of cartelli) out.push(elenco('puntini', `n° ${c.quantita.trim() || '[quantità]'} ${c.descrizione.trim()}`, { after: 120, left: 501 }));
  }
  return out;
}

function certificazioni(s: Sopralluogo, catalogo: Catalogo): Paragraph[] {
  const out: Paragraph[] = [titolo('3', 'CERTIFICAZIONI', 1)];
  const conCert = s.attivita.filter((a) => a.certificazioni.some((c) => c.richiesta));
  let testoUsato = '';
  conCert.forEach((a, i) => {
    out.push(titolo(`3.${i + 1}`, `ATTIVITA’ “${a.codice}”`, 2));
    // 1), 2), 3)… ripartono per ogni attività; sottopunti con la freccia ➢
    for (const c of a.certificazioni.filter((x) => x.richiesta)) {
      out.push(elenco('numeri', c.testo, { instance: i + 1 }));
      c.sotto.forEach((x) => out.push(elenco('frecce', x, { left: 2149 })));
      testoUsato += c.testo + c.sotto.join('');
    }
    out.push(vuoto(240));
  });
  if (!conCert.length) out.push(par('Nessuna certificazione richiesta.'));
  if (conCert.length && catalogo.testi.notaCertificazioni) out.push(par(catalogo.testi.notaCertificazioni, { italics: true }));
  // note ¹ ² ³ solo se richiamate nell'elenco
  for (const nota of catalogo.testi.noteCertificazioni) {
    const segno = nota.trim()[0];
    if (segno && testoUsato.includes(segno)) out.push(par(nota, { size: 18, after: 120 }));
  }
  return out;
}

function conclusioni(s: Sopralluogo, catalogo: Catalogo): Paragraph[] {
  return [
    titolo('4', 'CONCLUSIONI', 1),
    ...paragrafi(testoConclusioni(s, catalogo)),
    ...paragrafi(catalogo.testi.sanzioni, { bold: true }),
  ];
}

function computo(s: Sopralluogo, catalogo: Catalogo, tecnico: Tecnico): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [titolo('5', 'COMPUTO METRICO DELLE OPERE', 1)];
  const zone = zoneComputo(s, catalogo);
  const w = [436, 5234, 1044, 683, 1190, 1336]; // come il modello, somma = 9923
  const C = AlignmentType.CENTER;
  const J = AlignmentType.JUSTIFIED;
  const qta = (t: string) => (t.trim() ? (/^[\d.,\s]+$/.test(t.trim()) ? formatQuantita(parseNumero(t)) : t.trim()) : '');
  for (const z of zone) {
    imp?.spazio(z.righe.reduce((h, r) => h + Math.max(1, Math.ceil(r.descrizione.length / 44)) * RIGA + 40, 2 * RIGA + 80));
    out.push(par(z.etichetta, { bold: true, after: 120, before: 120, align: AlignmentType.LEFT, keepNext: true }));
    out.push(
      new Table({
        width: { size: LARGHEZZA_UTILE, type: WidthType.DXA },
        columnWidths: w,
        borders: griglia,
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              cella('', w[0]),
              cella('', w[1]),
              cella('U.M.', w[2], { bold: true, align: C }),
              cella('Q.tà', w[3], { bold: true, align: C }),
              cella('PREZZO', w[4], { bold: true, align: C }),
              cella('IMPORTO', w[5], { bold: true, align: C }),
            ],
          }),
          ...z.righe.map(
            (r, i) =>
              new TableRow({
                children: [
                  cella(String(i + 1), w[0], { align: C }),
                  cella(r.descrizione, w[1], { align: J }),
                  cella(r.um, w[2], { align: C }),
                  cella(qta(r.quantitaTesto), w[3], { align: C }),
                  cella(r.prezzoTesto.trim() ? formatNumero(r.prezzo) : '', w[4], { align: C }),
                  cella(r.importo === null ? '' : formatNumero(r.importo), w[5], { align: C }),
                ],
              }),
          ),
          new TableRow({
            children: [
              cella('TOTALE', w[0] + w[1] + w[2] + w[3] + w[4], { bold: true, columnSpan: 5 }),
              cella(z.conPrezzi ? formatNumero(z.totale) : '', w[5], { bold: true, align: C }),
            ],
          }),
        ],
      }),
      vuoto(240),
    );
  }
  if (!zone.length) out.push(par('Nessuna lavorazione prevista.'));
  if (zone.length > 1 && zone.some((z) => z.conPrezzi)) {
    out.push(par(`TOTALE COMPLESSIVO: € ${formatNumero(totaleComplessivo(zone))}`, { bold: true, align: AlignmentType.RIGHT }));
  }
  if (s.notaBene.trim()) {
    out.push(par('Nota bene:', { bold: true, after: 0 }), ...paragrafi(s.notaBene, { bold: true }));
  }
  out.push(...paragrafi(catalogo.testi.chiusura));
  out.push(vuoto(240), bloccoFirma(tecnico, s.condominio.dataRelazione));
  return out;
}

export function piede(s: Sopralluogo, tecnico: Tecnico, data: string = s.condominio.dataRelazione): Footer {
  const sx = [tecnico.societa.trim(), s.condominio.commessa.trim() && `n°${s.condominio.commessa.trim()}`].filter(Boolean).join(' ');
  const dx = [tecnico.iniziali.trim(), tecnico.revisione.trim(), dataItaliana(data)].filter(Boolean).join('      ');
  return new Footer({
    children: [
      new Paragraph({
        tabStops: [
          { type: TabStopType.CENTER, position: Math.round(LARGHEZZA_UTILE / 2) },
          { type: TabStopType.RIGHT, position: LARGHEZZA_UTILE },
        ],
        spacing: { after: 0, line: 240 },
        children: [
          new TextRun({ children: [sx, new Tab(), 'Pagina ', PageNumber.CURRENT, ' di ', PageNumber.TOTAL_PAGES, new Tab(), dx], size: 16 }),
        ],
      }),
    ],
  });
}

/** Carta intestata: immagine a tutta pagina, dietro al testo, ripetuta su ogni pagina. */
function intestazione(carta: FotoDati | null | undefined): Header | undefined {
  const tipo = carta && tipoImmagine(carta.data);
  if (!carta || !tipo) return undefined;
  return new Header({
    children: [
      new Paragraph({
        spacing: { after: 0 },
        children: [
          new ImageRun({
            type: tipo,
            data: carta.data,
            transformation: { width: Math.round(21 * PX_CM), height: Math.round(29.7 * PX_CM) },
            floating: {
              horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 },
              verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 },
              behindDocument: true,
              allowOverlap: true,
              wrap: { type: TextWrappingType.NONE },
            },
          }),
        ],
      }),
    ],
  });
}

// ---------- documento ----------

export async function creaDocumento(
  s: Sopralluogo,
  catalogo: Catalogo,
  tecnico: Tecnico,
  carica: CaricaFoto,
  opz: OpzioniDocumento = {},
): Promise<Document> {
  // il corpo si costruisce per primo, stimando dove cade ogni titolo
  const stima = new Impaginazione();
  imp = stima;
  let corpo: (Paragraph | Table)[];
  try {
    corpo = [
      ...parteGenerale(s, tecnico),
      ...(await esposizione(s, catalogo, carica)),
      ...certificazioni(s, catalogo),
      ...conclusioni(s, catalogo),
      ...computo(s, catalogo, tecnico),
    ];
  } finally {
    imp = null;
  }
  return assemblaDocumento({
    s,
    tecnico,
    titolo: `ROA ${committente(s)}`.trim(),
    frontespizio: frontespizio(s),
    copertina: await copertina(s, carica),
    corpo,
    stima,
    opz,
  });
}


export interface ParametriDocumento {
  s: Sopralluogo;
  tecnico: Tecnico;
  /** titolo nelle proprietà del file */
  titolo: string;
  frontespizio: Paragraph[];
  copertina: Paragraph[];
  corpo: (Paragraph | Table)[];
  /** impaginazione stimata del corpo (per l'indice già compilato) */
  stima: Impaginazione;
  opz?: OpzioniDocumento;
  /** data nel piè di pagina (predefinita: data della relazione) */
  dataPiede?: string;
}

/** Frontespizio, indice, corpo, stili, numerazioni e piè di pagina: uguali per ROA e prova idranti. */
export function assemblaDocumento({ s, tecnico, titolo: titoloFile, frontespizio, copertina, corpo, stima, opz = {}, dataPiede }: ParametriDocumento): Document {
  // pagina 1 frontespizio, poi l'indice (una pagina ogni ~20 righe)
  const pagineIndice = Math.max(1, Math.ceil((stima.voci.length * (360 + RIGA) + 1200) / ALTEZZA_UTILE));
  const children = [...frontespizio, ...copertina, ...indice(stima.voci, 2 + pagineIndice), ...corpo];

  // Titoli come nel modello: Arial 12; capitoli in grassetto sottolineato, attività sottolineate,
  // sezioni in corsivo. Interlinea 1,2.
  const heading = (id: string, name: string, level: number, run: { bold?: boolean; italics?: boolean; underline?: boolean }) => ({
    id,
    name,
    basedOn: 'Normal',
    next: 'Normal',
    quickFormat: true,
    run: {
      font: FONT,
      size: CORPO,
      bold: !!run.bold,
      italics: !!run.italics,
      color: '000000',
      ...(run.underline ? { underline: { type: UnderlineType.SINGLE } } : {}),
    },
    paragraph: { spacing: { before: 240, after: 240, line: 288 }, keepNext: true, keepLines: true, outlineLevel: level },
  });

  // Indice come le ROA: ogni riga Arial 12 grassetto maiuscolo, spaziata di 18 pt, rientro 0,25 cm,
  // numero e titolo separati da tabulazione, puntini fino al numero di pagina; sezioni in corsivo
  const toc = (id: string, name: string, livello: number) => ({
    id,
    name,
    basedOn: 'Normal',
    next: 'Normal',
    run: { font: FONT, size: CORPO, bold: true, allCaps: true, ...(livello === 4 ? { italics: true } : {}) },
    paragraph: {
      spacing: { before: 360, after: 0, line: 240 },
      indent: { left: 142 },
      tabStops: [
        { type: TabStopType.LEFT, position: livello <= 2 ? 851 : 1200 },
        { type: TabStopType.RIGHT, position: 9628, leader: 'dot' as const },
      ],
    },
  });

  const header = intestazione(opz.cartaIntestata);

  return new Document({
    creator: tecnico.firma || 'ROA Antincendio',
    title: titoloFile,
    features: { updateFields: true },
    styles: {
      default: {
        document: { run: { font: FONT, size: CORPO }, paragraph: { spacing: { after: 0, line: 276 } } },
      },
      paragraphStyles: [
        heading('Heading1', 'Heading 1', 0, { bold: true, underline: true }),
        heading('Heading2', 'Heading 2', 1, { bold: true, underline: true }),
        heading('Heading3', 'Heading 3', 2, { underline: true }),
        heading('Heading4', 'Heading 4', 3, { italics: true }),
        toc('TOC1', 'toc 1', 1),
        toc('TOC2', 'toc 2', 2),
        toc('TOC3', 'toc 3', 3),
        toc('TOC4', 'toc 4', 4),
      ],
    },
    numbering: {
      config: [
        {
          // frasi di ogni sezione: a) b) c)
          reference: 'lettere',
          levels: [
            { level: 0, format: LevelFormat.LOWER_LETTER, text: '%1)', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 360 } } } },
          ],
        },
        {
          // certificazioni: 1) 2) 3)
          reference: 'numeri',
          levels: [
            { level: 0, format: LevelFormat.DECIMAL, text: '%1)', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
          ],
        },
        {
          // sottopunti delle certificazioni: freccia ➢ (Wingdings)
          reference: 'frecce',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 2149, hanging: 360 } }, run: { font: 'Wingdings' } },
            },
          ],
        },
        {
          // cartelli
          reference: 'puntini',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 501, hanging: 360 } }, run: { font: 'Wingdings' } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGINA_W, height: PAGINA_H },
            margin: { top: M_SUP, right: M_DX, bottom: M_INF, left: M_SX, header: 0, footer: 708 },
          },
        },
        ...(header ? { headers: { default: header } } : {}),
        footers: { default: piede(s, tecnico, dataPiede) },
        children,
      },
    ],
  });
}


export async function generaDocxBlob(
  s: Sopralluogo,
  catalogo: Catalogo,
  tecnico: Tecnico,
  carica: CaricaFoto,
  opz: OpzioniDocumento = {},
): Promise<Blob> {
  return Packer.toBlob(await creaDocumento(s, catalogo, tecnico, carica, opz));
}

/** Parte comune dei nomi file: "Via_Linati_8_Milano" (senza accenti né simboli). */
export function nomeBase(s: Sopralluogo): string {
  const base = (s.condominio.nome || [s.condominio.indirizzo, s.condominio.comune].filter(Boolean).join(' ') || committente(s))
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return base || 'sopralluogo';
}

export function nomeFileDocx(s: Sopralluogo): string {
  const data = s.condominio.dataRelazione || s.condominio.dataSopralluogo || new Date().toISOString().slice(0, 10);
  return `ROA_${nomeBase(s)}_${data}.docx`;
}
