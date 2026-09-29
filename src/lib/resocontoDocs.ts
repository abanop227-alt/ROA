// Resoconto mensile in Word (da discutere con l'amministrazione) e in Excel.
import { AlignmentType, BorderStyle, Document, Footer, HeadingLevel, Packer, PageNumber, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import { STUDIO } from '../config/studio';
import { dataRiga, nomeMese, type Resoconto, type RigaResoconto } from './resoconto';
import type { Tecnico } from './types';
import { dataItaliana, oggiISO } from './util';
import { creaXlsx, type Valore } from './xlsxScrittura';

const FONT = 'Arial';
const linea = { style: BorderStyle.SINGLE, size: 4, color: '999999' };
const bordi = { top: linea, bottom: linea, left: linea, right: linea };

const testo = (t: string, o: { bold?: boolean; size?: number; color?: string } = {}) => new TextRun({ text: t, font: FONT, size: o.size ?? 20, bold: o.bold, color: o.color });

function cella(t: string, larghezza: number, intestazione = false) {
  return new TableCell({
    width: { size: larghezza, type: WidthType.DXA },
    borders: bordi,
    shading: intestazione ? { fill: 'E7E6E6' } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ children: [testo(t, { bold: intestazione })] })],
  });
}

function tabella(intest: string[], larghezze: number[], righe: string[][]): Table {
  return new Table({
    width: { size: larghezze.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: larghezze,
    rows: [
      new TableRow({ tableHeader: true, children: intest.map((t, i) => cella(t, larghezze[i], true)) }),
      ...righe.map((r) => new TableRow({ cantSplit: true, children: r.map((t, i) => cella(t, larghezze[i])) })),
    ],
  });
}

const titolo = (t: string) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 320, after: 120 }, children: [testo(t, { bold: true, size: 24 })] });
const vuota = () => new Paragraph({ spacing: { after: 80 }, children: [] });

const righeLavori = (l: RigaResoconto[]) => l.map((r) => [`${r.indirizzo}${r.comune ? ` – ${r.comune}` : ''}`, r.pratica, r.stato, dataRiga(r), r.note]);

export async function resocontoDocx(r: Resoconto, tecnico: Tecnico): Promise<Blob> {
  const W = [3700, 1400, 1200, 1300, 2300];
  const sezione = (nome: string, l: RigaResoconto[], vuoto: string) => [
    titolo(`${nome} (${l.length})`),
    l.length ? tabella(['Condominio', 'Pratica', 'Stato', 'Data', 'Note'], W, righeLavori(l)) : new Paragraph({ children: [testo(vuoto, { color: '666666' })] }),
    vuota(),
  ];
  const doc = new Document({
    creator: tecnico.firma || STUDIO.prodotto,
    title: `Resoconto lavori ${r.amministrazione} ${nomeMese(r.mese)}`,
    styles: { default: { document: { run: { font: FONT, size: 20 } } } },
    sections: [
      {
        properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
        footers: {
          default: new Footer({
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [testo(`${tecnico.societa || STUDIO.prodotto} – pagina `, { size: 16, color: '666666' }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: '666666' })] })],
          }),
        },
        children: [
          new Paragraph({ children: [testo('RESOCONTO LAVORI', { bold: true, size: 32 })] }),
          new Paragraph({ spacing: { after: 60 }, children: [testo(`Amministrazione ${r.amministrazione}`, { bold: true, size: 24 })] }),
          new Paragraph({ spacing: { after: 200 }, children: [testo(`${nomeMese(r.mese)} · redatto il ${dataItaliana(oggiISO())}`, { color: '666666' })] }),
          new Paragraph({
            spacing: { after: 120 },
            children: [testo(`Nel mese: ${r.totale.completati} lavori completati, ${r.totale.consegnati} consegnati; ad oggi ${r.totale.inCorso} lavori in corso.`)],
          }),
          ...sezione('Lavori completati nel mese', r.completati, 'Nessun lavoro completato nel mese.'),
          ...sezione('Lavori consegnati nel mese', r.consegnati, 'Nessun lavoro consegnato nel mese.'),
          ...sezione('Lavori in corso', r.inCorso, 'Nessun lavoro in corso.'),
          titolo(`Scadenze dei prossimi 12 mesi (${r.scadenze.length})`),
          r.scadenze.length
            ? tabella(['Condominio', 'Attività', 'Scadenza'], [4600, 2600, 2700], r.scadenze.map((s) => [s.indirizzo, s.attivita, /^\d{4}-\d{2}-\d{2}$/.test(s.scadenza) ? dataItaliana(s.scadenza) : s.scadenza]))
            : new Paragraph({ children: [testo('Nessuna scadenza indicata.', { color: '666666' })] }),
        ],
      },
    ],
  });
  return Packer.toBlob(doc);
}

export async function resocontoXlsx(r: Resoconto): Promise<Blob> {
  const righe: Valore[][] = [[`Resoconto lavori – ${r.amministrazione} – ${nomeMese(r.mese)}`], []];
  const titoli: number[] = [0];
  const intest: number[] = [];
  const grass: number[] = [];
  const blocco = (nome: string, l: RigaResoconto[]) => {
    grass.push(righe.length);
    righe.push([`${nome} (${l.length})`]);
    intest.push(righe.length);
    righe.push(['Condominio', 'Comune', 'Pratica', 'Stato', 'Referente', 'Data consegna', 'Data fine', 'Note']);
    for (const x of l) righe.push([x.indirizzo, x.comune, x.pratica, x.stato, x.referente, dataItaliana(x.dataConsegna), dataItaliana(x.dataFine), x.note]);
    righe.push([]);
  };
  blocco('Lavori completati nel mese', r.completati);
  blocco('Lavori consegnati nel mese', r.consegnati);
  blocco('Lavori in corso', r.inCorso);
  grass.push(righe.length);
  righe.push([`Scadenze dei prossimi 12 mesi (${r.scadenze.length})`]);
  intest.push(righe.length);
  righe.push(['Condominio', 'Attività', 'Scadenza']);
  for (const s of r.scadenze) righe.push([s.indirizzo, s.attivita, /^\d{4}-\d{2}-\d{2}$/.test(s.scadenza) ? dataItaliana(s.scadenza) : s.scadenza]);
  return creaXlsx([{ nome: 'Resoconto', righe, titoli, intestazioni: intest, grassetto: grass, larghezze: [36, 18, 12, 12, 12, 14, 12, 36] }]);
}

export function nomeFileResoconto(r: Resoconto, estensione: 'docx' | 'xlsx'): string {
  return `RESOCONTO ${r.amministrazione} ${r.mese}.${estensione}`.replace(/[\\/:*?"<>|]+/g, ' ');
}
