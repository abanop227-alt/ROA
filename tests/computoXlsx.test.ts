import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { applicaPrezzi, esportaComputoXlsx, leggiPrezziXlsx, nomeFileComputo } from '../src/lib/computoXlsx';
import { zoneComputo } from '../src/lib/computo';
import { cat, sopralluogoCon, voce } from './aiuti';

function conVoci() {
  const s = sopralluogoCon(['74.1.A']);
  const v = s.voci.find((x) => x.lavorazioni.length > 0)!;
  v.selezionata = true;
  s.condominio.indirizzo = 'Via Linati, 8';
  s.condominio.commessa = '18/26';
  return { s, v };
}

describe('computo in Excel', () => {
  it('esporta le righe del computo con chiave nascosta e senza prezzi', async () => {
    const { s } = conVoci();
    const blob = await esportaComputoXlsx(s, cat);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    const righe = zoneComputo(s, cat).flatMap((z) => z.righe);
    expect(righe.length).toBeGreaterThan(1);
    for (const r of righe) expect(xml).toContain(r.key.replace(/&/g, '&amp;'));
    expect(xml).toContain('IF(E');
    expect(xml).toContain('hidden="1"');
  });

  it('rilegge i prezzi anche da un file salvato da Excel (stringhe condivise)', async () => {
    const zip = new JSZip();
    zip.file('xl/sharedStrings.xml', '<sst><si><t>voce-a</t></si><si><t>voce-b</t></si><si><t>Totale</t></si></sst>');
    zip.file(
      'xl/worksheets/sheet1.xml',
      '<worksheet><sheetData>' +
        '<row r="5"><c r="E5" s="3"><v>12.5</v></c><c r="H5" t="s"><v>0</v></c></row>' +
        '<row r="6"><c r="E6" s="3"/><c r="H6" t="s"><v>1</v></c></row>' +
        '<row r="7"><c r="E7" t="s"><v>2</v></c></row>' +
        '</sheetData></worksheet>',
    );
    const letti = await leggiPrezziXlsx(await zip.generateAsync({ type: 'uint8array' }));
    expect(letti).toEqual([{ chiave: 'voce-a', prezzo: 12.5 }, { chiave: 'voce-b', prezzo: undefined }]);
  });

  it('esporta e reimporta: i prezzi tornano nelle righe giuste', async () => {
    const { s } = conVoci();
    const righe = zoneComputo(s, cat).flatMap((z) => z.righe);
    const blob = await esportaComputoXlsx(s, cat);
    // il collega scrive il prezzo della prima riga
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    let xml = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    const k = righe[0].key.replace(/&/g, '&amp;');
    const posChiave = xml.indexOf(k);
    const nRiga = /<row r="(\d+)"/g;
    let riga = '';
    for (const m of xml.slice(0, posChiave).matchAll(nRiga)) riga = m[1];
    xml = xml.replace(`<c r="E${riga}" s="3"/>`, `<c r="E${riga}" s="3"><v>250,5</v></c>`);
    zip.file('xl/worksheets/sheet1.xml', xml);
    const letti = await leggiPrezziXlsx(await zip.generateAsync({ type: 'uint8array' }));
    const e = applicaPrezzi(s, letti);
    expect(e.applicati).toBe(1);
    expect(e.sconosciute).toBe(0);
    const prima = zoneComputo(e.s, cat).flatMap((z) => z.righe)[0];
    expect(prima.prezzo).toBe(250.5);
  });

  it('segnala le righe del file che non esistono più', () => {
    const { s } = conVoci();
    const e = applicaPrezzi(s, [{ chiave: 'inesistente', prezzo: 10 }]);
    expect(e.applicati).toBe(0);
    expect(e.sconosciute).toBe(1);
  });

  it('nome file', () => {
    const { s } = conVoci();
    expect(nomeFileComputo(s)).toBe('COMPUTO Via Linati, 8 comm 18 26.xlsx');
    voce(s, s.voci.find((x) => x.voceId)!.voceId!);
  });
});
