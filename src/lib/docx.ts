import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from 'docx';
import { certificazioniRichieste, gruppiSelezionati } from './catalogo';
import { righeComputo, totaleComputo } from './computo';
import { formatNumero, formatQuantita } from './numeri';
import type { AttivitaSelezionata, Sopralluogo, VoceIstanza } from './types';
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
const FOTO_LARGHEZZA_PX = Math.round((8 / 2.54) * 96); // ~8 cm
const GRIGIO = 'E7E6E6';

// ---------- utilità ----------

/** Tipo immagine dai "magic bytes". */
export function tipoImmagine(data: Uint8Array): 'jpg' | 'png' | null {
  if (data[0] === 0xff && data[1] === 0xd8) return 'jpg';
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return 'png';
  return null;
}

/** Spezza il testo evidenziando in giallo le parti ancora tra [parentesi quadre]. */
function runsConSegnaposto(testo: string, opz: { italics?: boolean } = {}): TextRun[] {
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

function paragrafi(testo: string, opz: { italics?: boolean } = {}): Paragraph[] {
  return testo
    .split(/\r?\n/)
    .map((r) => r.trimEnd())
    .filter((r) => r.trim() !== '')
    .map(
      (r) =>
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 120 },
          children: runsConSegnaposto(r, opz),
        }),
    );
}

function titolo(testo: string, livello: 1 | 2 | 3): Paragraph {
  const heading = livello === 1 ? HeadingLevel.HEADING_1 : livello === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
  return new Paragraph({ heading, children: [new TextRun(testo)] });
}

function puntato(children: ParagraphChild[]): Paragraph {
  return new Paragraph({ numbering: { reference: 'elenco', level: 0 }, spacing: { after: 60 }, children });
}

function cella(
  testo: string,
  width: number,
  opz: { bold?: boolean; shade?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; columnSpan?: number } = {},
): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    columnSpan: opz.columnSpan,
    shading: opz.shade ? { type: ShadingType.CLEAR, color: 'auto', fill: GRIGIO } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [
      new Paragraph({
        alignment: opz.align ?? AlignmentType.LEFT,
        children: [new TextRun({ text: testo, bold: opz.bold })],
      }),
    ],
  });
}

const bordi = {
  top: { style: BorderStyle.SINGLE, size: 4, color: '808080' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: '808080' },
  left: { style: BorderStyle.SINGLE, size: 4, color: '808080' },
  right: { style: BorderStyle.SINGLE, size: 4, color: '808080' },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: '808080' },
  insideVertical: { style: BorderStyle.SINGLE, size: 4, color: '808080' },
};

// ---------- sezioni ----------

function intestazione(s: Sopralluogo): Paragraph[] {
  const committente = s.condominio.committente.trim() || '[committente]';
  const riga = (text: string, after = 120) =>
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after },
      children: [new TextRun({ text, bold: true, size: 28 })],
    });
  return [
    riga("VERIFICA DELLO STATO DEI LUOGHI PER L'ADEGUAMENTO DELLO STABILE"),
    riga(`Relativamente al ${committente}`),
    riga('AI FINI DELLA PREVENZIONE INCENDI', 360),
  ];
}

function tabellaDati(s: Sopralluogo): Table | null {
  const c = s.condominio;
  const ubicazione = [c.indirizzo.trim(), c.comune.trim()].filter(Boolean).join(' – ');
  const campi: [string, string][] = [
    ['Committente', c.committente],
    ['C.F. condominio', c.codiceFiscale],
    ['c/o', c.pressoAmministrazione],
    ['Indirizzo amministrazione', c.indirizzoAmministrazione],
    ['Telefono', c.telefono],
    ['Ubicazione immobile', ubicazione],
    ['N. commessa', c.commessa],
    ['Data sopralluogo', dataItaliana(c.dataSopralluogo)],
  ];
  const compilati = campi.filter(([, v]) => v && v.trim());
  if (!compilati.length) return null;
  const w1 = 3200;
  const w2 = LARGHEZZA_UTILE - w1;
  return new Table({
    width: { size: LARGHEZZA_UTILE, type: WidthType.DXA },
    columnWidths: [w1, w2],
    borders: bordi,
    rows: compilati.map(
      ([k, v]) => new TableRow({ children: [cella(k, w1, { bold: true, shade: true }), cella(v.trim(), w2)] }),
    ),
  });
}

function descrizioneAttivita(a: AttivitaSelezionata, conProgetto: boolean): ParagraphChild[] {
  const parti: ParagraphChild[] = [new TextRun({ text: a.codice, bold: true })];
  if (a.descrizione.trim()) parti.push(new TextRun(` – ${a.descrizione.trim()}`));
  if (a.datoDimensionale.trim()) parti.push(new TextRun(` – dato dimensionale: ${a.datoDimensionale.trim()}`));
  if (conProgetto) {
    parti.push(new TextRun(' – progetto approvato al N° '));
    parti.push(...runsConSegnaposto(a.nProgetto.trim() || '[N°]'));
    parti.push(new TextRun(' del '));
    parti.push(...runsConSegnaposto(dataItaliana(a.dataApprovazione) || '[data]'));
  }
  return parti;
}

function parteGenerale(s: Sopralluogo): Paragraph[] {
  const out: Paragraph[] = [titolo('1. Parte generale', 1)];
  const att = s.attivita;
  const stessiEstremi =
    att.length <= 1 ||
    att.every((a) => a.nProgetto.trim() === att[0].nProgetto.trim() && a.dataApprovazione === att[0].dataApprovazione);

  out.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun('Lo scopo del presente elaborato consiste in:')] }));

  const primo: ParagraphChild[] = [new TextRun('1) Verificare che lo stato di fatto sia analogo al progetto approvato ')];
  if (stessiEstremi) {
    const a = att[0];
    primo.push(new TextRun('al N° '));
    primo.push(...runsConSegnaposto(a?.nProgetto.trim() || '[N°]'));
    primo.push(new TextRun(' del '));
    primo.push(...runsConSegnaposto((a && dataItaliana(a.dataApprovazione)) || '[data]'));
    primo.push(new TextRun(' '));
  }
  primo.push(new TextRun('per attività:'));
  out.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 60 }, children: primo }));
  if (att.length) att.forEach((a) => out.push(puntato(descrizioneAttivita(a, !stessiEstremi))));
  else out.push(puntato(runsConSegnaposto('[attività]')));

  out.push(
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { before: 120, after: 240 },
      children: [
        new TextRun(
          "2) Elencare le certificazioni e le documentazioni da produrre da parte dell'amministrazione dello stabile, e/o degli installatori.",
        ),
      ],
    }),
  );

  const plurale = att.length > 1;
  const frase = plurale
    ? 'Dal sopralluogo è stato riscontrato che le attività soggette al controllo del Comando dei Vigili del Fuoco presenti nel Condominio in oggetto sono identificate ai numeri del D.P.R. 151/11:'
    : "Dal sopralluogo è stato riscontrato che l'attività soggetta al controllo del Comando dei Vigili del Fuoco presente nel Condominio in oggetto è identificata al numero del D.P.R. 151/11:";
  out.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 60 }, children: [new TextRun(frase)] }));
  if (att.length) att.forEach((a) => out.push(puntato(descrizioneAttivita(a, false))));
  else out.push(puntato(runsConSegnaposto('[attività]')));
  return out;
}

async function paragrafoFoto(v: VoceIstanza, carica: CaricaFoto): Promise<Paragraph | null> {
  const runs: ParagraphChild[] = [];
  for (const id of v.fotoIds) {
    const f = await carica(id);
    if (!f) continue;
    const tipo = tipoImmagine(f.data);
    if (!tipo || !f.width || !f.height) continue;
    if (runs.length) runs.push(new TextRun('  '));
    runs.push(
      new ImageRun({
        type: tipo,
        data: f.data,
        transformation: {
          width: FOTO_LARGHEZZA_PX,
          height: Math.round((FOTO_LARGHEZZA_PX * f.height) / f.width),
        },
      }),
    );
  }
  if (!runs.length) return null;
  return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 200 }, children: runs });
}

async function esposizione(s: Sopralluogo, carica: CaricaFoto): Promise<Paragraph[]> {
  const out: Paragraph[] = [titolo('2. Esposizione della consulenza', 1)];
  const gruppi = gruppiSelezionati(s);
  let n2 = 0;
  for (const g of gruppi) {
    n2++;
    if (g.attivita) {
      out.push(titolo(`2.${n2} Attività ${g.attivita.codice}`, 2));
      if (g.attivita.descrizione.trim()) out.push(...paragrafi(g.attivita.descrizione, { italics: true }));
    } else {
      out.push(titolo(`2.${n2} Prescrizioni generali`, 2));
    }
    if (!g.voci.length) {
      out.push(new Paragraph({ children: [new TextRun('Non sono state rilevate prescrizioni per questa attività.')] }));
      continue;
    }
    let n3 = 0;
    for (const v of g.voci) {
      n3++;
      out.push(titolo(`2.${n2}.${n3} ${v.titolo.trim() || 'Voce'}`, 3));
      if (v.rifNormativo.trim()) {
        out.push(
          new Paragraph({
            spacing: { after: 120 },
            children: [new TextRun({ text: v.rifNormativo.trim(), italics: true, size: 20 })],
          }),
        );
      }
      out.push(...paragrafi(v.testo));
      if (v.note.trim()) {
        const righe = v.note.trim().split(/\r?\n/);
        out.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { after: 120 },
            children: [
              new TextRun({ text: 'Note dal sopralluogo: ', bold: true }),
              ...righe.flatMap((r, i) => [...(i ? [new TextRun({ text: '', break: 1 })] : []), ...runsConSegnaposto(r)]),
            ],
          }),
        );
      }
      const foto = await paragrafoFoto(v, carica);
      if (foto) out.push(foto);
    }
  }
  if (!gruppi.length) out.push(new Paragraph({ children: runsConSegnaposto('[nessuna attività selezionata]') }));
  return out;
}

function certificazioni(s: Sopralluogo): Paragraph[] {
  const out = [titolo('3. Certificazioni e documentazioni da produrre', 1)];
  const elenco = certificazioniRichieste(s);
  if (!elenco.length) out.push(new Paragraph({ children: [new TextRun('Nessuna certificazione richiesta.')] }));
  elenco.forEach((c) => out.push(puntato([new TextRun(c)])));
  return out;
}

function computo(s: Sopralluogo): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [titolo('4. Computo metrico delle opere', 1)];
  const righe = righeComputo(s);
  if (!righe.length) {
    out.push(new Paragraph({ children: [new TextRun('Nessuna lavorazione selezionata.')] }));
    return out;
  }
  const w = [4838, 1000, 1000, 1400, 1400]; // somma = 9638
  const R = AlignmentType.RIGHT;
  const C = AlignmentType.CENTER;
  const intest = new TableRow({
    tableHeader: true,
    children: [
      cella('Descrizione', w[0], { bold: true, shade: true }),
      cella('U.M.', w[1], { bold: true, shade: true, align: C }),
      cella('Q.tà', w[2], { bold: true, shade: true, align: R }),
      cella('Prezzo €', w[3], { bold: true, shade: true, align: R }),
      cella('Importo €', w[4], { bold: true, shade: true, align: R }),
    ],
  });
  const corpo = righe.map(
    (r) =>
      new TableRow({
        children: [
          cella(r.descrizione, w[0]),
          cella(r.um, w[1], { align: C }),
          cella(formatQuantita(r.quantita), w[2], { align: R }),
          cella(formatNumero(r.prezzo), w[3], { align: R }),
          cella(formatNumero(r.importo), w[4], { align: R }),
        ],
      }),
  );
  const totale = new TableRow({
    children: [
      cella('Totale', w[0] + w[1] + w[2] + w[3], { bold: true, shade: true, columnSpan: 4, align: R }),
      cella(formatNumero(totaleComputo(righe)), w[4], { bold: true, shade: true, align: R }),
    ],
  });
  out.push(
    new Table({
      width: { size: LARGHEZZA_UTILE, type: WidthType.DXA },
      columnWidths: w,
      borders: bordi,
      rows: [intest, ...corpo, totale],
    }),
  );
  return out;
}

function conclusioni(s: Sopralluogo): Paragraph[] {
  return [titolo('5. Conclusioni', 1), ...paragrafi(s.conclusioni)];
}

// ---------- documento ----------

export async function creaDocumento(s: Sopralluogo, carica: CaricaFoto): Promise<Document> {
  const tabella = tabellaDati(s);
  const children: (Paragraph | Table)[] = [
    ...intestazione(s),
    ...(tabella ? [tabella, new Paragraph({ spacing: { after: 240 }, children: [] })] : []),
    ...parteGenerale(s),
    ...(await esposizione(s, carica)),
    ...certificazioni(s),
    ...computo(s),
    ...conclusioni(s),
  ];

  const heading = (id: string, name: string, size: number, level: number) => ({
    id,
    name,
    basedOn: 'Normal',
    next: 'Normal',
    quickFormat: true,
    run: { font: FONT, size, bold: true, color: '000000' },
    paragraph: { spacing: { before: level === 0 ? 360 : 240, after: 120 }, keepNext: true, keepLines: true, outlineLevel: level },
  });

  return new Document({
    creator: 'ROA Antincendio',
    title: `ROA ${s.condominio.committente}`.trim(),
    styles: {
      default: {
        document: { run: { font: FONT, size: 22 }, paragraph: { spacing: { line: 276 } } },
      },
      paragraphStyles: [
        heading('Heading1', 'Heading 1', 28, 0),
        heading('Heading2', 'Heading 2', 24, 1),
        heading('Heading3', 'Heading 3', 22, 2),
      ],
    },
    numbering: {
      config: [
        {
          reference: 'elenco',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '•',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
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
            margin: { top: MARGINE, right: MARGINE, bottom: MARGINE, left: MARGINE },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ children: ['Pag. ', PageNumber.CURRENT, ' di ', PageNumber.TOTAL_PAGES], size: 18 })],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
}

export async function generaDocxBlob(s: Sopralluogo, carica: CaricaFoto): Promise<Blob> {
  const doc = await creaDocumento(s, carica);
  return Packer.toBlob(doc);
}

export function nomeFileDocx(s: Sopralluogo): string {
  const committente =
    s.condominio.committente
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60) || 'sopralluogo';
  const data = s.condominio.dataSopralluogo || new Date().toISOString().slice(0, 10);
  return `ROA_${committente}_${data}.docx`;
}
