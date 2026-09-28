import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Tab,
  TabStopType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
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

// A4, margini 2 cm
const PAGINA_W = 11906;
const PAGINA_H = 16838;
const MARGINE = 1134;
const LARGHEZZA_UTILE = PAGINA_W - 2 * MARGINE; // 9638 DXA
const FONT = 'Arial';
const PX_CM = 96 / 2.54;
const GRIGIO = 'E7E6E6';

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

function par(testo: string, opz: OpzRun & { after?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) {
  const { after = 120, align = AlignmentType.JUSTIFIED, ...r } = opz;
  return new Paragraph({ alignment: align, spacing: { after }, children: runs(testo, r) });
}

function paragrafi(testo: string, opz: OpzRun = {}): Paragraph[] {
  return righe(testo).map((r) => par(r, opz));
}

function titolo(numero: string, testo: string, livello: 1 | 2 | 3 | 4): Paragraph {
  const heading = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4][livello - 1];
  return new Paragraph({ heading, children: [new TextRun({ children: [numero, new Tab(), testo] })] });
}

function puntato(children: ParagraphChild[], livello = 0): Paragraph {
  return new Paragraph({
    numbering: { reference: 'elenco', level: livello },
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 60 },
    children,
  });
}

const nessunBordo = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const bordiNessuno = {
  top: nessunBordo,
  bottom: nessunBordo,
  left: nessunBordo,
  right: nessunBordo,
  insideHorizontal: nessunBordo,
  insideVertical: nessunBordo,
};
const linea = { style: BorderStyle.SINGLE, size: 4, color: '808080' };
const bordi = { top: linea, bottom: linea, left: linea, right: linea, insideHorizontal: linea, insideVertical: linea };

function cella(
  contenuto: string | Paragraph[],
  width: number,
  opz: { bold?: boolean; shade?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; columnSpan?: number } = {},
): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    columnSpan: opz.columnSpan,
    shading: opz.shade ? { type: ShadingType.CLEAR, color: 'auto', fill: GRIGIO } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children:
      typeof contenuto === 'string'
        ? [new Paragraph({ alignment: opz.align ?? AlignmentType.LEFT, children: runs(contenuto, { bold: opz.bold }) })]
        : contenuto,
  });
}

function bloccoFirma(tecnico: Tecnico, data: string): Table {
  const w = LARGHEZZA_UTILE / 2;
  const luogoData = `${tecnico.luogo.trim() || '[luogo]'}, ${dataItaliana(data) || '[data]'}`;
  return new Table({
    width: { size: LARGHEZZA_UTILE, type: WidthType.DXA },
    columnWidths: [w, w],
    borders: bordiNessuno,
    rows: [
      new TableRow({
        children: [
          cella(luogoData, w),
          cella(
            [
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun('Il Tecnico')] }),
              new Paragraph({ children: [] }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: runs(tecnico.firma.trim() || '[firma del tecnico]', { bold: true }),
              }),
            ],
            w,
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

interface Immagine {
  f: FotoDati;
  tipo: 'jpg' | 'png';
}

async function caricaImmagini(ids: string[], carica: CaricaFoto): Promise<Immagine[]> {
  const out: Immagine[] = [];
  for (const id of ids) {
    const f = await carica(id);
    const tipo = f && tipoImmagine(f.data);
    if (f && tipo && f.width && f.height) out.push({ f, tipo });
  }
  return out;
}

function bloccoFoto(immagini: Immagine[], numeri: number[], didascalia: string): Paragraph[] {
  const larghezza = Math.round((immagini.length === 1 ? 10 : 8) * PX_CM);
  const out: Paragraph[] = [];
  for (let i = 0; i < immagini.length; i += 2) {
    const children: ParagraphChild[] = [];
    immagini.slice(i, i + 2).forEach(({ f, tipo }, j) => {
      if (j) children.push(new TextRun('   '));
      children.push(
        new ImageRun({
          type: tipo,
          data: f.data,
          transformation: { width: larghezza, height: Math.round((larghezza * f.height) / f.width) },
        }),
      );
    });
    out.push(new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 120, after: 60 }, children }));
  }
  out.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: runs(didascaliaFoto(numeri, didascalia), { bold: true, italics: true, size: 20 }),
    }),
  );
  return out;
}

// ---------- sezioni del documento ----------

function frontespizio(s: Sopralluogo): Paragraph[] {
  const c = s.condominio;
  const riga = (text: string) =>
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: runs(text, { bold: true, size: 28 }) });
  const indirizzo = [c.indirizzo.trim(), c.comune.trim()].filter(Boolean).join(' – ').toUpperCase() || '[INDIRIZZO – COMUNE]';
  const attivita = s.attivita.length
    ? s.attivita.map((a, i) => (i ? 'E ' : '') + righeTitolo(a))
    : ['[ATTIVITÀ]'];
  return [
    riga('VERIFICA DELLO STATO DEI LUOGHI'),
    riga('PER L’ADEGUAMENTO DELLO STABILE'),
    ...attivita.map(riga),
    riga(`RELATIVAMENTE AL CONDOMINIO${c.nome.trim() ? ' ' + c.nome.trim().toUpperCase() : ''}`),
    riga(indirizzo),
    riga('AI FINI DELLA PREVENZIONE INCENDI'),
  ];
}

async function copertina(s: Sopralluogo, carica: CaricaFoto): Promise<Paragraph[]> {
  if (!s.fotoCopertinaId) return [];
  const f = await carica(s.fotoCopertinaId);
  const tipo = f && tipoImmagine(f.data);
  if (!f || !tipo) return [];
  const w = Math.round(12 * PX_CM);
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 480 },
      children: [new ImageRun({ type: tipo, data: f.data, transformation: { width: w, height: Math.round((w * f.height) / f.width) } })],
    }),
  ];
}

function indice(): (Paragraph | TableOfContents)[] {
  return [
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: 'INDICE', bold: true, size: 24 })] }),
    new TableOfContents('Indice', { hyperlink: true, headingStyleRange: '1-4' }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

function parteGenerale(s: Sopralluogo, tecnico: Tecnico): (Paragraph | Table)[] {
  const c = s.condominio;
  const out: (Paragraph | Table)[] = [titolo('1', 'PARTE GENERALE', 1)];

  const intest = righe(tecnico.intestazione);
  if (intest.length) intest.forEach((r) => out.push(par(r, { after: 0, align: AlignmentType.LEFT })));
  else out.push(par('[Dati del tecnico: compilali in Impostazioni tecnico nella schermata iniziale]', { after: 0 }));
  out.push(new Paragraph({ spacing: { after: 120 }, children: [] }));

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
    const w1 = 2400;
    const w2 = LARGHEZZA_UTILE - w1;
    out.push(
      new Table({
        width: { size: LARGHEZZA_UTILE, type: WidthType.DXA },
        columnWidths: [w1, w2],
        borders: bordi,
        rows: compilati.map(([k, v]) => new TableRow({ children: [cella(k, w1, { bold: true, shade: true }), cella(v.trim(), w2)] })),
      }),
      new Paragraph({ spacing: { after: 120 }, children: [] }),
    );
  }

  out.push(par('Lo scopo del presente elaborato consiste in:'));
  if (!s.attivita.length) out.push(par('1) Verificare che lo stato di fatto sia conforme [riferimento] per attività: [attività]'));
  s.attivita.forEach((a, i) => {
    out.push(par(`${i === 0 ? '1) ' : ''}Verificare che lo stato di fatto sia conforme ${riferimentoVerifica(a)} per attività:`, { after: 60 }));
    out.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        indent: { left: 709 },
        spacing: { after: 120 },
        children: [new TextRun({ text: `${a.codice}: `, bold: true }), ...runs(descrizioneScopo(a).replace(/\.?$/, '.'))],
      }),
    );
  });
  out.push(par('2) Elencare le certificazioni e le documentazioni da produrre da parte dell’amministrazione dello stabile, e/o degli installatori.', { after: 240 }));

  const plurale = s.attivita.length > 1;
  out.push(
    par(
      plurale
        ? 'Dal sopralluogo è stato riscontrato che le attività soggette al controllo del Comando dei Vigili del Fuoco presente nel Condominio in oggetto sono identificate al numero del D.P.R. 151/11:'
        : 'Dal sopralluogo è stato riscontrato che l’attività soggetta al controllo del Comando dei Vigili del Fuoco presente nel Condominio in oggetto è identificata al numero del D.P.R. 151/11:',
      { after: 60 },
    ),
  );
  s.attivita.forEach((a, i) => {
    const fine = i === s.attivita.length - 1 ? '.' : ';';
    out.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        indent: { left: 709 },
        spacing: { after: 60 },
        children: [new TextRun({ text: `${a.codice}: `, bold: true }), ...runs((a.descrizione.trim() || '[classificazione]').replace(/[.;]?$/, fine))],
      }),
    );
  });
  out.push(new Paragraph({ spacing: { after: 360 }, children: [] }), bloccoFirma(tecnico, c.dataRelazione));
  return out;
}

async function esposizione(s: Sopralluogo, catalogo: Catalogo, carica: CaricaFoto): Promise<Paragraph[]> {
  const out: Paragraph[] = [
    new Paragraph({ children: [new PageBreak()] }),
    titolo('2', 'ESPOSIZIONE DELLA CONSULENZA', 1),
    ...paragrafi(catalogo.testi.esposizione),
    titolo('2.1', 'ADEGUAMENTI', 2),
  ];
  let contaFoto = 0;
  const gruppi = gruppiDocumento(s);
  for (const [i, g] of gruppi.entries()) {
    const n3 = `2.1.${i + 1}`;
    out.push(titolo(n3, `ATTIVITA’ “${g.attivita.codice}”`, 3));
    if (g.attivita.regolaTecnicaTesto.trim()) out.push(...paragrafi(g.attivita.regolaTecnicaTesto, { italics: true }));
    if (g.attivita.introduzione.trim()) out.push(...paragrafi(g.attivita.introduzione));
    if (!g.sezioni.length) out.push(par('Non sono state rilevate prescrizioni per questa attività.'));
    for (const [j, { sezione, voci }] of g.sezioni.entries()) {
      out.push(titolo(`${n3}.${j + 1}`, sezione.titolo.trim() || 'Sezione', 4));
      for (const v of voci) {
        const immagini = await caricaImmagini(v.fotoIds, carica);
        const nf = immagini.map(() => ++contaFoto);
        righe(testoConRiferimentoFoto(v.testo.trim() || '[testo]', nf)).forEach((riga) => out.push(par(riga)));
        if (immagini.length) out.push(...bloccoFoto(immagini, nf, v.didascalia));
      }
    }
  }
  if (!gruppi.length) out.push(par('[Nessuna attività selezionata]'));

  const cartelli = s.cartelli.filter((c) => c.descrizione.trim());
  if (cartelli.length) {
    out.push(titolo('2.2', 'ORDINE CARTELLI E SEGNALETICA DI SICUREZZA', 2));
    for (const c of cartelli) out.push(puntato(runs(`n° ${c.quantita.trim() || '[quantità]'} ${c.descrizione.trim()}`)));
  }
  return out;
}

function certificazioni(s: Sopralluogo, catalogo: Catalogo): Paragraph[] {
  const out: Paragraph[] = [titolo('3', 'CERTIFICAZIONI', 1)];
  const conCert = s.attivita.filter((a) => a.certificazioni.some((c) => c.richiesta));
  let testoUsato = '';
  conCert.forEach((a, i) => {
    out.push(titolo(`3.${i + 1}`, `ATTIVITA’ “${a.codice}”`, 2));
    for (const c of a.certificazioni.filter((x) => x.richiesta)) {
      out.push(puntato(runs(c.testo)));
      c.sotto.forEach((x) => out.push(puntato(runs(x), 1)));
      testoUsato += c.testo + c.sotto.join('');
    }
  });
  if (!conCert.length) out.push(par('Nessuna certificazione richiesta.'));
  if (conCert.length && catalogo.testi.notaCertificazioni) out.push(par(catalogo.testi.notaCertificazioni, { italics: true }));
  // note ¹ ² ³ solo se richiamate nell'elenco
  for (const nota of catalogo.testi.noteCertificazioni) {
    const segno = nota.trim()[0];
    if (segno && testoUsato.includes(segno)) out.push(par(nota, { size: 18 }));
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
  const w = [600, 4638, 900, 900, 1300, 1300]; // somma = 9638
  const R = AlignmentType.RIGHT;
  const C = AlignmentType.CENTER;
  const qta = (t: string) => (t.trim() ? (/^[\d.,\s]+$/.test(t.trim()) ? formatQuantita(parseNumero(t)) : t.trim()) : '');
  for (const z of zone) {
    out.push(new Paragraph({ spacing: { before: 200, after: 80 }, keepNext: true, children: [new TextRun({ text: z.etichetta, bold: true })] }));
    out.push(
      new Table({
        width: { size: LARGHEZZA_UTILE, type: WidthType.DXA },
        columnWidths: w,
        borders: bordi,
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              cella('', w[0], { shade: true }),
              cella('', w[1], { shade: true }),
              cella('U.M.', w[2], { bold: true, shade: true, align: C }),
              cella('Q.tà', w[3], { bold: true, shade: true, align: C }),
              cella('PREZZO', w[4], { bold: true, shade: true, align: C }),
              cella('IMPORTO', w[5], { bold: true, shade: true, align: C }),
            ],
          }),
          ...z.righe.map(
            (r, i) =>
              new TableRow({
                children: [
                  cella(String(i + 1), w[0], { align: C }),
                  cella(r.descrizione, w[1]),
                  cella(r.um, w[2], { align: C }),
                  cella(qta(r.quantitaTesto), w[3], { align: C }),
                  cella(r.prezzoTesto.trim() ? formatNumero(r.prezzo) : '', w[4], { align: R }),
                  cella(r.importo === null ? '' : formatNumero(r.importo), w[5], { align: R }),
                ],
              }),
          ),
          new TableRow({
            children: [
              cella('TOTALE', w[0] + w[1] + w[2] + w[3] + w[4], { bold: true, shade: true, columnSpan: 5, align: R }),
              cella(z.conPrezzi ? formatNumero(z.totale) : '', w[5], { bold: true, shade: true, align: R }),
            ],
          }),
        ],
      }),
    );
  }
  if (!zone.length) out.push(par('Nessuna lavorazione prevista.'));
  if (zone.length > 1 && zone.some((z) => z.conPrezzi)) {
    out.push(par(`TOTALE COMPLESSIVO: € ${formatNumero(totaleComplessivo(zone))}`, { bold: true, align: R, after: 240 }));
  }
  if (s.notaBene.trim()) {
    out.push(par('Nota bene:', { bold: true, after: 60 }), ...paragrafi(s.notaBene));
  }
  out.push(new Paragraph({ spacing: { after: 240 }, children: [] }), ...paragrafi(catalogo.testi.chiusura));
  out.push(new Paragraph({ spacing: { after: 240 }, children: [] }), bloccoFirma(tecnico, s.condominio.dataRelazione));
  return out;
}

function piede(s: Sopralluogo, tecnico: Tecnico): Footer {
  const sx = [tecnico.societa.trim(), s.condominio.commessa.trim() && `n°${s.condominio.commessa.trim()}`].filter(Boolean).join(' ');
  const dx = [tecnico.iniziali.trim(), tecnico.revisione.trim(), dataItaliana(s.condominio.dataRelazione)].filter(Boolean).join('    ');
  return new Footer({
    children: [
      new Paragraph({
        tabStops: [
          { type: TabStopType.CENTER, position: LARGHEZZA_UTILE / 2 },
          { type: TabStopType.RIGHT, position: LARGHEZZA_UTILE },
        ],
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: '808080', space: 4 } },
        children: [
          new TextRun({ children: [sx, new Tab(), 'Pagina ', PageNumber.CURRENT, ' di ', PageNumber.TOTAL_PAGES, new Tab(), dx], size: 16 }),
        ],
      }),
    ],
  });
}

// ---------- documento ----------

export async function creaDocumento(s: Sopralluogo, catalogo: Catalogo, tecnico: Tecnico, carica: CaricaFoto): Promise<Document> {
  const children = [
    ...frontespizio(s),
    ...(await copertina(s, carica)),
    ...indice(),
    ...parteGenerale(s, tecnico),
    ...(await esposizione(s, catalogo, carica)),
    ...certificazioni(s, catalogo),
    ...conclusioni(s, catalogo),
    ...computo(s, catalogo, tecnico),
  ];

  const heading = (id: string, name: string, size: number, level: number, italics = false) => ({
    id,
    name,
    basedOn: 'Normal',
    next: 'Normal',
    quickFormat: true,
    run: { font: FONT, size, bold: !italics, italics, color: '000000' },
    paragraph: { spacing: { before: level === 0 ? 360 : 240, after: 120 }, keepNext: true, keepLines: true, outlineLevel: level },
  });

  return new Document({
    creator: tecnico.firma || 'ROA Antincendio',
    title: `ROA ${committente(s)}`.trim(),
    features: { updateFields: true },
    styles: {
      default: { document: { run: { font: FONT, size: 22 }, paragraph: { spacing: { line: 276 } } } },
      paragraphStyles: [
        heading('Heading1', 'Heading 1', 24, 0),
        heading('Heading2', 'Heading 2', 22, 1),
        heading('Heading3', 'Heading 3', 22, 2),
        heading('Heading4', 'Heading 4', 22, 3, true),
      ],
    },
    numbering: {
      config: [
        {
          reference: 'elenco',
          levels: [
            { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
            { level: 1, format: LevelFormat.BULLET, text: '–', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGINA_W, height: PAGINA_H },
            margin: { top: MARGINE, right: MARGINE, bottom: MARGINE, left: MARGINE },
          },
        },
        footers: { default: piede(s, tecnico) },
        children,
      },
    ],
  });
}

export async function generaDocxBlob(s: Sopralluogo, catalogo: Catalogo, tecnico: Tecnico, carica: CaricaFoto): Promise<Blob> {
  return Packer.toBlob(await creaDocumento(s, catalogo, tecnico, carica));
}

export function nomeFileDocx(s: Sopralluogo): string {
  const base = (s.condominio.nome || [s.condominio.indirizzo, s.condominio.comune].filter(Boolean).join(' ') || committente(s))
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  const data = s.condominio.dataRelazione || s.condominio.dataSopralluogo || new Date().toISOString().slice(0, 10);
  return `ROA_${base || 'sopralluogo'}_${data}.docx`;
}
