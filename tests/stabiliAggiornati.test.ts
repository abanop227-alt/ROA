import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { applicaModifiche, calcolaModifiche, chiaveIndirizzo, modifichePerFile, scriviCella } from '../src/lib/stabiliAggiornati';
import { conStato } from '../src/lib/pratiche';
import { leggiFogli, leggiStabiliXlsx } from '../src/lib/stabili';
import { sopralluogoCon } from './aiuti';

type Cella = [string, string | number, number?];

async function xlsx(righe: Record<number, Cella[]>): Promise<Uint8Array> {
  const cond: string[] = [];
  const idx = (t: string) => (cond.includes(t) ? cond.indexOf(t) : cond.push(t) - 1);
  const sheet = Object.entries(righe)
    .map(([n, celle]) => `<row r="${n}" spans="1:32">${celle.map(([c, v, st]) => `<c r="${c}${n}"${st ? ` s="${st}"` : ''}${typeof v === 'number' ? '' : ' t="s"'}><v>${typeof v === 'number' ? v : idx(v)}</v></c>`).join('')}</row>`)
    .join('');
  const zip = new JSZip();
  zip.file('xl/worksheets/sheet1.xml', `<worksheet><sheetData>${sheet}</sheetData></worksheet>`);
  zip.file('xl/sharedStrings.xml', `<sst>${cond.map((t) => `<si><t>${t}</t></si>`).join('')}</sst>`);
  zip.file('xl/workbook.xml', '<workbook><sheets><sheet name="PASQUALI 2026" sheetId="1" r:id="rId1"/></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>');
  return zip.generateAsync({ type: 'uint8array' });
}

const INTESTAZIONE: Cella[] = [['A', 'RAG. SOCIALE'], ['C', 'CONDOMINIO'], ['D', 'CIV'], ['E', 'CAP'], ['F', "CITTA'"], ['S', 'nuove att. Dlgs151/11'], ['U', 'ROA'], ['X', 'SCIA CPI'], ['Y', 'RINNOVO'], ['Z', 'SCADENZA'], ['AF', 'CF']];

const file = () =>
  xlsx({
    1: [['C', 'PASQUALI | ELENCO STABILI']],
    2: INTESTAZIONE,
    3: [['A', 'CONDOMINIO LINATI'], ['B', 'VIA'], ['C', 'LINATI'], ['D', '8'], ['E', '20128'], ['F', 'MILANO'], ['S', '74.1.A'], ['U', 'fatta 2025', 7], ['Z', '2030', 9], ['AF', '80146960150']],
    4: [['B', 'VIA'], ['C', 'EUROPA'], ['D', '5'], ['E', '20097'], ['F', 'SAN DONATO'], ['S', '77.1.A'], ['AF', '95710710153']],
    5: [['B', 'VIA'], ['C', 'ALTRA'], ['D', '1'], ['F', 'MILANO']],
  });

function pratiche() {
  const roa = sopralluogoCon(['74.1.A']);
  roa.condominio.indirizzo = 'Via Linati, 8';
  const eseguita = conStato(conStato(roa, 'emessa', '2026-03-01'), 'eseguiti', '2026-06-15');
  const rinnovo = sopralluogoCon(['77.1.A', '74.1.A']);
  rinnovo.condominio.indirizzo = 'Via Europa, 5';
  rinnovo.pratica = { tipo: 'rinnovo', stato: 'presentata', referente: '', origineId: null, dataStato: '2026-05-26', dataPresentazione: '2026-05-26', protocolloPec: '', nPraticaVvf: '' };
  return [eseguita, rinnovo];
}

describe('aggiornamento degli elenchi stabili', () => {
  it('chiave di confronto ignora via/viale e maiuscole', () => {
    expect(chiaveIndirizzo('VIA LINATI', '8')).toBe(chiaveIndirizzo('Linati', '8'));
    expect(chiaveIndirizzo('Viale Coni Zugna', '21/A')).toBe('CONI ZUGNA|21A');
  });

  it('calcola le modifiche dallo stato delle pratiche', async () => {
    const stabili = await leggiStabiliXlsx(await file(), 'Stabili PASQUALI.xlsx');
    const m = calcolaModifiche(stabili, pratiche());
    const perStabile = (via: string) => m.filter((x) => x.indirizzo.includes(via)).map((x) => `${x.colonna}=${x.dopo}`);
    expect(perStabile('LINATI')).toEqual(['roa=fatta 15/06/2026']);
    expect(perStabile('EUROPA')).toEqual(['rinnovo=26/05/2026', 'scadenza=2031']); // 74 e 77 non indipendenti: termine minore
    expect(perStabile('ALTRA')).toEqual([]);
  });

  it('non propone nulla se il valore è già quello', async () => {
    const stabili = await leggiStabiliXlsx(await file());
    const m = calcolaModifiche(stabili, pratiche(), (_s, c) => (c === 'roa' ? 'fatta 15/06/2026' : ''));
    expect(m.filter((x) => x.colonna === 'roa')).toEqual([]);
  });

  it('modifichePerFile legge i valori attuali dal file', async () => {
    const originale = await file();
    const stabili = await leggiStabiliXlsx(originale);
    const m = await modifichePerFile(originale, stabili, pratiche());
    const roa = m.find((x) => x.colonna === 'roa')!;
    expect(roa.prima).toBe('fatta 2025');
    expect(roa.dopo).toBe('fatta 15/06/2026');
  });

  it('scrive nel file mantenendo stile e ordine delle celle, senza toccare il resto', async () => {
    const originale = await file();
    const stabili = await leggiStabiliXlsx(originale);
    const m = await modifichePerFile(originale, stabili, pratiche());
    const blob = await applicaModifiche(originale, m);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    // U3 sostituita con lo stile 7; Y4 e Z4 inserite prima di AF4
    expect(xml).toContain('<c r="U3" s="7" t="inlineStr"><is><t xml:space="preserve">fatta 15/06/2026</t></is></c>');
    const riga4 = /<row r="4"[\s\S]*?<\/row>/.exec(xml)![0];
    expect(riga4.indexOf('r="Y4"')).toBeGreaterThan(riga4.indexOf('r="S4"'));
    expect(riga4.indexOf('r="Z4"')).toBeLessThan(riga4.indexOf('r="AF4"'));
    // il file si rilegge e i dati non toccati sono intatti
    const rilette = await leggiStabiliXlsx(await blob.arrayBuffer());
    expect(rilette).toHaveLength(3);
    expect(rilette[0].codiceFiscale).toBe('80146960150');
    expect(rilette[1].scadenza).toBe('2031');
    const fogli = await leggiFogli(await blob.arrayBuffer());
    expect(fogli[0].righe.get(4)!.get('Y')).toBe('26/05/2026');
  });

  it('scriviCella non crea righe inesistenti e gestisce le righe vuote', () => {
    const xml = '<sheetData><row r="2" spans="1:3"><c r="A2"><v>1</v></c></row><row r="3"/></sheetData>';
    expect(scriviCella(xml, 'B', 9, 'x')).toBe(xml);
    expect(scriviCella(xml, 'C', 3, 'a & b')).toContain('<row r="3"><c r="C3" t="inlineStr"><is><t xml:space="preserve">a &amp; b</t></is></c></row>');
  });
});
