// Computo metrico in Excel: esportazione senza prezzi (per il collega che li inserisce) e reimportazione.
//
// Il file esportato ha una colonna nascosta con la chiave di ogni riga: è quella che permette di
// riportare i prezzi nel sopralluogo anche se il collega cambia l'ordine o aggiunge righe.
import JSZip from 'jszip';
import { zoneComputo } from './computo';
import { parseNumero } from './numeri';
import type { Catalogo, Sopralluogo } from './types';
import { dataItaliana } from './util';

const COL_CHIAVE = 'H';

const esc = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

const testoCella = (rif: string, t: string, stile = 0) =>
  `<c r="${rif}" t="inlineStr" s="${stile}"><is><t xml:space="preserve">${esc(t)}</t></is></c>`;
const numeroCella = (rif: string, n: number, stile = 0) => `<c r="${rif}" s="${stile}"><v>${n}</v></c>`;

// stili: 0 normale · 1 intestazione · 2 titolo zona · 3 prezzo (da compilare) · 4 importo · 5 testo a capo · 6 totale
const STILI = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="13"/><name val="Calibri"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7E6E6"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="7">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="164" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyNumberFormat="1" applyFill="1" applyBorder="1"/>
</cellXfs>
</styleSheet>`;

/** Excel con il computo di ogni zona, prezzi vuoti (giallo) e importi calcolati con formula. */
export async function esportaComputoXlsx(s: Sopralluogo, catalogo: Catalogo): Promise<Blob> {
  const zone = zoneComputo(s, catalogo);
  const c = s.condominio;
  const righe: string[] = [];
  let n = 0;
  const riga = (celle: string[], altezza?: number) => {
    n++;
    righe.push(`<row r="${n}"${altezza ? ` ht="${altezza}" customHeight="1"` : ''}>${celle.join('')}</row>`);
    return n;
  };

  riga([testoCella(`A${n + 1}`, `COMPUTO METRICO – ${[c.nome && `Condominio ${c.nome}`, c.indirizzo, c.comune].filter(Boolean).join(' – ')}`, 2)], 22);
  riga([testoCella(`A${n + 1}`, `Commessa ${c.commessa || '—'} · relazione del ${dataItaliana(c.dataRelazione)} · compilare solo la colonna “Prezzo € (unitario)”`)]);
  n++; // riga vuota

  for (const z of zone) {
    riga([testoCella(`A${n + 1}`, z.etichetta, 2)], 20);
    riga(
      ['N.', 'Descrizione', 'U.M.', 'Q.tà', 'Prezzo € (unitario)', 'Importo €'].map((t, i) =>
        testoCella(`${'ABCDEF'[i]}${n + 1}`, t, 1),
      ),
    );
    const primo = n + 1;
    z.righe.forEach((r, i) => {
      const k = n + 1;
      riga([
        numeroCella(`A${k}`, i + 1, 5),
        testoCella(`B${k}`, r.descrizione, 5),
        testoCella(`C${k}`, r.um, 5),
        numeroCella(`D${k}`, r.quantita, 5),
        `<c r="E${k}" s="3"/>`,
        `<c r="F${k}" s="4"><f>IF(E${k}="","",D${k}*E${k})</f></c>`,
        // la colonna G è vuota: la chiave sta in H, nascosta
        testoCella(`${COL_CHIAVE}${k}`, r.key),
      ]);
    });
    const ultimo = n;
    riga([
      testoCella(`E${n + 1}`, 'Totale', 1),
      `<c r="F${n + 1}" s="6"><f>SUM(F${primo}:F${Math.max(primo, ultimo)})</f></c>`,
    ]);
    n++; // riga vuota
  }

  const foglio = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"/></sheetViews>
<cols><col min="1" max="1" width="5" customWidth="1"/><col min="2" max="2" width="70" customWidth="1"/><col min="3" max="3" width="9" customWidth="1"/><col min="4" max="4" width="9" customWidth="1"/><col min="5" max="5" width="20" customWidth="1"/><col min="6" max="6" width="14" customWidth="1"/><col min="8" max="8" width="20" hidden="1" customWidth="1"/></cols>
<sheetData>${righe.join('')}</sheetData>
<pageSetup orientation="landscape" fitToHeight="0"/>
</worksheet>`;

  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
  );
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Computo" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file('xl/styles.xml', STILI);
  zip.file('xl/worksheets/sheet1.xml', foglio);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function nomeFileComputo(s: Sopralluogo): string {
  const c = s.condominio;
  const base = [c.indirizzo, c.commessa && `comm ${c.commessa}`].filter(Boolean).join(' ') || 'sopralluogo';
  return `COMPUTO ${base}`.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() + '.xlsx';
}

// ---------------------------- lettura ----------------------------

/** "E12" → indice di colonna 0-based e numero di riga. */
function posizione(rif: string): { col: string; riga: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(rif);
  return { col: m?.[1] ?? '', riga: Number(m?.[2] ?? 0) };
}

const decodifica = (t: string) =>
  t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

const testiDi = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodifica(m[1])).join('');

export interface PrezzoLetto {
  chiave: string;
  /** undefined = cella vuota */
  prezzo?: number;
}

/**
 * Legge da un .xlsx (anche salvato da Excel, che usa le stringhe condivise) le coppie chiave → prezzo.
 * Il prezzo è nella colonna E, la chiave nella H (nascosta).
 */
export async function leggiPrezziXlsx(dati: ArrayBuffer | Uint8Array | Blob): Promise<PrezzoLetto[]> {
  const zip = await JSZip.loadAsync(dati);
  const nomeFoglio = Object.keys(zip.files).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f)).sort()[0];
  if (!nomeFoglio) throw new Error('Il file non sembra un Excel valido.');
  const condivise: string[] = [];
  const ss = zip.file('xl/sharedStrings.xml');
  if (ss) for (const m of (await ss.async('string')).matchAll(/<si>([\s\S]*?)<\/si>/g)) condivise.push(testiDi(m[1]));

  const xml = await zip.file(nomeFoglio)!.async('string');
  const perRiga = new Map<number, { chiave?: string; prezzo?: number }>();
  for (const m of xml.matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attr = m[1];
    const rif = /r="([A-Z]+\d+)"/.exec(attr)?.[1];
    if (!rif) continue;
    const { col, riga } = posizione(rif);
    if (col !== COL_CHIAVE && col !== 'E') continue;
    const tipo = /t="(\w+)"/.exec(attr)?.[1];
    const corpo = m[2] ?? '';
    let valore: string | undefined;
    if (tipo === 'inlineStr') valore = testiDi(corpo);
    else {
      const v = /<v>([\s\S]*?)<\/v>/.exec(corpo)?.[1];
      if (v !== undefined) valore = tipo === 's' ? condivise[Number(v)] : decodifica(v);
    }
    if (valore === undefined || valore === '') continue;
    const r = perRiga.get(riga) ?? {};
    if (col === COL_CHIAVE) r.chiave = valore;
    else r.prezzo = parseNumero(valore);
    perRiga.set(riga, r);
  }
  return [...perRiga.entries()]
    .sort((a, b) => a[0] - b[0])
    .filter(([, r]) => r.chiave)
    .map(([, r]) => ({ chiave: r.chiave!, prezzo: r.prezzo }));
}

export interface EsitoImportPrezzi {
  s: Sopralluogo;
  applicati: number;
  /** righe del file che non corrispondono a nessuna riga del computo */
  sconosciute: number;
}

const comePrezzo = (n: number) => String(n).replace('.', ',');

/** Porta nel sopralluogo i prezzi letti dal file: le righe senza prezzo non cambiano. */
export function applicaPrezzi(s: Sopralluogo, letti: PrezzoLetto[]): EsitoImportPrezzi {
  const prezzi = new Map(letti.filter((l) => l.prezzo !== undefined).map((l) => [l.chiave, l.prezzo!]));
  const note = new Set<string>();
  let applicati = 0;
  const applica = <T extends { key: string; prezzo: string }>(r: T): T => {
    note.add(r.key);
    const p = prezzi.get(r.key);
    if (p === undefined) return r;
    applicati++;
    return { ...r, prezzo: comePrezzo(p) };
  };
  const nuovo: Sopralluogo = {
    ...s,
    voci: s.voci.map((v) => ({ ...v, lavorazioni: v.lavorazioni.map(applica) })),
    righeExtra: s.righeExtra.map(applica),
  };
  const sconosciute = letti.filter((l) => !note.has(l.chiave)).length;
  return { s: nuovo, applicati, sconosciute };
}
