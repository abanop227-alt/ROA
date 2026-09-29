import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { clienteDa, elencoLavori, esportaElencoLavoriXlsx, leggiCommesseXlsx, numeroDa } from '../src/lib/commesse';
import { leggiFogli } from '../src/lib/stabili';
import { conStato } from '../src/lib/pratiche';
import { sopralluogoCon } from './aiuti';

type Cella = [string, string | number];

async function xlsx(righe: Record<number, Cella[]>): Promise<Uint8Array> {
  const cond: string[] = [];
  const idx = (t: string) => (cond.includes(t) ? cond.indexOf(t) : cond.push(t) - 1);
  const sheet = Object.entries(righe)
    .map(([n, celle]) => `<row r="${n}">${celle.map(([c, v]) => (typeof v === 'number' ? `<c r="${c}${n}"><v>${v}</v></c>` : `<c r="${c}${n}" t="s"><v>${idx(v)}</v></c>`)).join('')}</row>`)
    .join('');
  const zip = new JSZip();
  zip.file('xl/worksheets/sheet1.xml', `<worksheet><sheetData>${sheet}</sheetData></worksheet>`);
  zip.file('xl/sharedStrings.xml', `<sst>${cond.map((t) => `<si><t>${t}</t></si>`).join('')}</sst>`);
  zip.file('xl/workbook.xml', '<workbook><sheets><sheet name="STEMA" sheetId="1" r:id="rId1"/></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>');
  return zip.generateAsync({ type: 'uint8array' });
}

const INTESTAZIONE: Cella[] = [['A', 'COMM.'], ['C', 'VIA - V.LE - P.ZZA  P.LE -  C.SO - L.GO'], ['D', 'INDIRIZZO'], ['E', 'CIV'], ['F', 'CAP'], ['G', "CITTA'"], ['H', 'PRATICA'], ['I', 'REFERENTE INTERNO'], ['J', 'STATO'], ['K', 'DATA FINE'], ['L', 'DATA CONSEGNA'], ['M', 'NOTE']];

const esempio = () =>
  xlsx({
    1: [['A', 'STEMA - COMMESSE 2026']],
    2: INTESTAZIONE,
    3: [['A', '1'], ['B', 'IMPELLIZZERI'], ['C', 'VIA'], ['D', 'MILLELIRE'], ['E', '18'], ['F', '20149'], ['G', 'MILANO'], ['H', 'RINNOVO'], ['I', 'ZAHRA'], ['J', 'COMPLETO']],
    4: [['A', '18'], ['B', 'PASQUALI'], ['C', 'VIA'], ['D', 'LINATI'], ['E', '8'], ['F', '20128'], ['G', 'MILANO'], ['H', 'ROA'], ['I', 'ABA'], ['J', 'COMPLETA'], ['K', 46073]],
    5: [['A', '19'], ['B', 'PASQUALI'], ['C', 'VIA'], ['D', 'EUROPA'], ['E', '5'], ['H', 'IPA'], ['I', 'ABA']],
    6: [['B', 'nota senza numero']],
  });

describe('elenco lavori', () => {
  it('legge le commesse con cliente, stato e date', async () => {
    const c = await leggiCommesseXlsx(await esempio());
    expect(c).toHaveLength(3);
    expect(c[0]).toMatchObject({ numero: 1, cliente: 'IMPELLIZZERI', via: 'MILLELIRE', civico: '18', pratica: 'RINNOVO', referente: 'ZAHRA', stato: 'COMPLETO', origine: 'excel' });
    expect(c[1]).toMatchObject({ numero: 18, cliente: 'PASQUALI', stato: 'COMPLETO', dataFine: '2026-02-20' }); // "COMPLETA" normalizzato, 46073 = 20/02/2026
    expect(c[2]).toMatchObject({ numero: 19, pratica: 'IPA', stato: '' });
  });

  it('un file senza le colonne giuste dà un errore chiaro', async () => {
    await expect(leggiCommesseXlsx(await xlsx({ 1: [['A', 'niente']] }))).rejects.toThrow('COMM.');
  });

  it('la pratica dell’app aggiorna la riga importata e aggiunge le nuove commesse', async () => {
    const importate = await leggiCommesseXlsx(await esempio());
    const roa = sopralluogoCon(['74.1.A']);
    Object.assign(roa.condominio, { commessa: '19/26', indirizzo: 'Via Europa, 5', comune: 'San Donato', pressoAmministrazione: 'Amministrazione PASQUALI' });
    const nuova = sopralluogoCon(['75.2.B']);
    Object.assign(nuova.condominio, { commessa: '400/26', indirizzo: 'Via Nago, 22', comune: 'Milano', pressoAmministrazione: 'Amministrazione SIBOLDI', dataRelazione: '2026-09-01' });
    nuova.pratica = { tipo: 'roa', stato: 'emessa', referente: 'Federico', origineId: null, dataStato: '2026-09-02', dataPresentazione: '', protocolloPec: '', nPraticaVvf: '' };
    const elenco = elencoLavori(importate, [conStato(roa, 'emessa', '2026-09-10'), nuova]);
    // la 19 era una IPA: la ROA con lo stesso numero è un'altra pratica → resta separata
    expect(elenco.map((c) => `${c.numero}|${c.pratica}`)).toEqual(['1|RINNOVO', '18|ROA', '19|IPA', '19|ROA', '400|ROA']);
    const n = elenco.find((c) => c.numero === 400)!;
    expect(n).toMatchObject({ cliente: 'SIBOLDI', via: 'VIA NAGO', civico: '22', referente: 'FEDERICO', stato: '', dataConsegna: '2026-09-01', origine: 'app' });
  });

  it('una ROA con lo stesso numero e tipo sostituisce lo stato importato', async () => {
    const importate = await leggiCommesseXlsx(await esempio());
    const s = sopralluogoCon(['74.1.A']);
    Object.assign(s.condominio, { commessa: '18/26', indirizzo: 'Via Linati, 8', pressoAmministrazione: 'Amministrazione PASQUALI' });
    const lavori = conStato(conStato(s, 'emessa', '2026-03-01'), 'eseguiti', '2026-06-15');
    const c = elencoLavori(importate, [lavori]).find((x) => x.numero === 18)!;
    expect(c).toMatchObject({ stato: 'COMPLETO', dataFine: '2026-06-15', origine: 'app', cliente: 'PASQUALI' });
  });

  it('cliente dal campo amministrazione', () => {
    expect(clienteDa('Amministrazione PASQUALI')).toBe('PASQUALI');
    expect(clienteDa('Studio Amministrativo Immobiliare Forlano')).toBe('FORLANO');
    expect(numeroDa('324/2026')).toBe(324);
  });

  it('esporta nel formato dell’elenco lavori (foglio STEMA)', async () => {
    const importate = await leggiCommesseXlsx(await esempio());
    const blob = await esportaElencoLavoriXlsx(importate, 2026);
    const fogli = await leggiFogli(await blob.arrayBuffer());
    expect(fogli[0].nome).toBe('STEMA');
    expect(fogli[0].righe.get(1)!.get('A')).toBe('STEMA - COMMESSE 2026');
    expect(fogli[0].righe.get(2)!.get('H')).toBe('PRATICA');
    expect(fogli[0].righe.get(4)!.get('B')).toBe('PASQUALI');
    expect(fogli[0].righe.get(4)!.get('K')).toBe('20/02/2026');
    // si rilegge con lo stesso lettore
    const ancora = await leggiCommesseXlsx(await blob.arrayBuffer());
    expect(ancora.map((c) => c.numero)).toEqual([1, 18, 19]);
  });
});
