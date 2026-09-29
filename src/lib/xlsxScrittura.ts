// Scrittura di file .xlsx semplici (nessuna dipendenza oltre a JSZip): un foglio o più, intestazione in grassetto,
// larghezze di colonna, testo a capo. Usato per l'elenco lavori e per i resoconti.
import JSZip from 'jszip';

export type Valore = string | number | null | undefined;

export interface FoglioXlsx {
  nome: string;
  /** righe di valori; le date vanno passate come testo (gg/mm/aaaa) */
  righe: Valore[][];
  larghezze?: number[];
  /** indici (0-based) delle righe da mostrare come titolo (grande) */
  titoli?: number[];
  /** indici (0-based) delle righe di intestazione (grassetto su sfondo grigio) */
  intestazioni?: number[];
  /** indici (0-based) delle righe in grassetto (totali, sezioni) */
  grassetto?: number[];
}

const esc = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

export const colonna = (i: number): string => {
  let n = i + 1;
  let out = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
};

// stili: 0 normale · 1 intestazione · 2 titolo · 3 grassetto · 4 testo a capo
const STILI = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7E6E6"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
</cellXfs>
</styleSheet>`;

function xmlFoglio(f: FoglioXlsx): string {
  const titoli = new Set(f.titoli ?? []);
  const intest = new Set(f.intestazioni ?? []);
  const grass = new Set(f.grassetto ?? []);
  const righe = f.righe
    .map((r, i) => {
      const conDati = r.some((v) => v !== null && v !== undefined && v !== '');
      const stile = titoli.has(i) ? 2 : intest.has(i) ? 1 : grass.has(i) ? 3 : conDati ? 4 : 0;
      const celle = r
        .map((v, j) => {
          if (v === null || v === undefined || v === '') return intest.has(i) ? `<c r="${colonna(j)}${i + 1}" s="1"/>` : '';
          const rif = `${colonna(j)}${i + 1}`;
          return typeof v === 'number' ? `<c r="${rif}" s="${stile}"><v>${v}</v></c>` : `<c r="${rif}" t="inlineStr" s="${stile}"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
        })
        .join('');
      return `<row r="${i + 1}"${titoli.has(i) ? ' ht="22" customHeight="1"' : ''}>${celle}</row>`;
    })
    .join('');
  const cols = f.larghezze?.length
    ? `<cols>${f.larghezze.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews>${cols}<sheetData>${righe}</sheetData><pageSetup orientation="landscape" fitToHeight="0"/></worksheet>`;
}

/** Nome del foglio valido per Excel (max 31 caratteri, senza \ / ? * [ ] :). */
export const nomeFoglio = (t: string) => t.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim() || 'Foglio';

export async function creaXlsx(fogli: FoglioXlsx[]): Promise<Blob> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${fogli
      .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
      .join('')}</Types>`,
  );
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${fogli
      .map((f, i) => `<sheet name="${esc(nomeFoglio(f.nome))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join('')}</sheets></workbook>`,
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${fogli
      .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
      .join('')}<Relationship Id="rId${fogli.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  );
  zip.file('xl/styles.xml', STILI);
  fogli.forEach((f, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, xmlFoglio(f)));
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
