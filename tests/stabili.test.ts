import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { applicaStabile } from '../src/components/Step2Condominio';
import { cercaStabili, indirizzoStabile, leggiStabiliXlsx } from '../src/lib/stabili';
import { cat, sopralluogoCon } from './aiuti';

type Cella = [string, string | number];
type Righe = Record<number, Cella[]>;

/** Costruisce un .xlsx minimo (stringhe condivise, come lo salva Excel) con i fogli indicati. */
async function xlsx(fogli: { nome: string; righe: Righe }[]): Promise<Uint8Array> {
  const cond: string[] = [];
  const idx = (t: string) => {
    const i = cond.indexOf(t);
    if (i >= 0) return i;
    cond.push(t);
    return cond.length - 1;
  };
  const zip = new JSZip();
  fogli.forEach((f, k) => {
    const sheet = Object.entries(f.righe)
      .map(([n, celle]) => `<row r="${n}">${celle.map(([c, v]) => (typeof v === 'number' ? `<c r="${c}${n}"><v>${v}</v></c>` : `<c r="${c}${n}" t="s"><v>${idx(v)}</v></c>`)).join('')}</row>`)
      .join('');
    zip.file(`xl/worksheets/sheet${k + 1}.xml`, `<worksheet><sheetData>${sheet}</sheetData></worksheet>`);
  });
  zip.file('xl/sharedStrings.xml', `<sst>${cond.map((t) => `<si><t>${t.replace(/&/g, '&amp;')}</t></si>`).join('')}</sst>`);
  zip.file('xl/workbook.xml', `<workbook><sheets>${fogli.map((f, k) => `<sheet name="${f.nome}" sheetId="${k + 1}" r:id="rId${k + 1}"/>`).join('')}</sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<Relationships>${fogli.map((_, k) => `<Relationship Id="rId${k + 1}" Type="x" Target="worksheets/sheet${k + 1}.xml"/>`).join('')}</Relationships>`);
  return zip.generateAsync({ type: 'uint8array' });
}

const INTESTAZIONE: Cella[] = [
  ['A', 'RAG. SOCIALE'], ['C', 'CONDOMINIO'], ['D', 'CIV'], ['E', 'CAP'], ['F', "CITTA'"], ['G', 'Contatto'], ['H', 'Telefono'],
  ['L', 'NOP'], ['O', 'pt kW'], ['S', 'nuove att. Dlgs151/11'], ['T', 'PROGETTO ANTINCENDIO'], ['Z', 'SCADENZA'], ['AB', 'NOTE'], ['AF', 'CF'],
];

const semplice: Righe = {
  1: [['C', 'ROSSI | ELENCO STABILI']],
  2: INTESTAZIONE,
  3: [['A', 'CONDOMINIO CARAVAGGIO'], ['B', 'VIA'], ['C', 'AOSTA'], ['D', '21'], ['E', '20155'], ['F', 'MILANO'], ['G', 'custode Bianchi'], ['H', '3400000000'], ['L', '331847'], ['S', '75.2.B'], ['T', 45797], ['AF', '95710710153']],
  4: [['B', 'via'], ['C', 'BELLINI'], ['D', '11'], ['E', '20019'], ['F', 'SETTIMO M.SE'], ['S', '74.1.A 77.1.A'], ['Z', '2030'], ['AB', 'nota & prova']],
  5: [['C', 'nota senza indirizzo']],
  6: [['A', 'BIANCOSPINI, 8'], ['B', 'via'], ['C', 'BIANCOSPINI'], ['D', '8'], ['F', 'MILANO'], ['S', '77.1.A (2)'], ['O', '163']],
};

const esempio = () => xlsx([{ nome: 'ROSSI 2026', righe: semplice }]);

describe('importazione stabili da Excel', () => {
  it('legge le righe con indirizzo e salta note e righe vuote', async () => {
    const s = await leggiStabiliXlsx(await esempio(), 'Stabili ROSSI 2026.xlsx');
    expect(s).toHaveLength(3);
    expect(s[0]).toMatchObject({ nome: 'CONDOMINIO CARAVAGGIO', tipoVia: 'VIA', via: 'AOSTA', civico: '21', cap: '20155', comune: 'MILANO', nop: '331847', codiceFiscale: '95710710153', amministrazione: 'ROSSI', origine: 'Stabili ROSSI 2026.xlsx', attivita: ['75.2.B'] });
    expect(s[0].contatto).toBe('custode Bianchi');
  });

  it('senza nome usa la via; riconosce più attività e le date seriali', async () => {
    const s = await leggiStabiliXlsx(await esempio());
    expect(s[1].nome).toBe('BELLINI');
    expect(s[1].attivita).toEqual(['74.1.A', '77.1.A']);
    expect(s[1].scadenza).toBe('2030');
    expect(s[1].note).toBe('nota & prova');
    expect(s[0].progetto).toBe('2025-05-20'); // 45797
    expect(s[2].attivita).toEqual(['77.1.A']);
    expect(s[2].kw).toBe('163');
  });

  it('un file senza intestazione riconoscibile dà un errore chiaro', async () => {
    await expect(leggiStabiliXlsx(await xlsx([{ nome: 'Foglio1', righe: { 1: [['A', 'niente']] } }]))).rejects.toThrow('CIV');
  });

  it('varianti delle intestazioni, numero d’ordine e fogli multipli (salta “PERSI”)', async () => {
    const variante: Righe = {
      1: [['D', 'ELENCO STABILI BARZETTI']],
      2: [['B', 'RAGIONE SOCIALE'], ['E', 'N° CIV'], ['F', 'C.A.P.'], ['G', "CITTA'"], ['I', 'TEL'], ['U', 'nuove att. Dlgs151/11'], ['AJ', 'CF']],
      3: [['A', 1], ['B', 'CONDOMINIO “LE RESIDENZE”'], ['C', 'VIA'], ['D', 'ALAMANNI'], ['E', '8'], ['F', '20141'], ['G', 'MILANO'], ['I', '0212345'], ['U', '74.3.C'], ['AJ', '97397620150']],
      4: [['A', 2], ['C', 'VIA'], ['D', 'BREDA'], ['E', '20'], ['F', '20126'], ['G', 'MILANO']],
    };
    const persi: Righe = { 2: [['E', 'CIV'], ['F', 'CAP']], 3: [['C', 'VIA'], ['D', 'PERDUTO'], ['E', '1'], ['F', '20100']] };
    const secondo: Righe = { 1: [['C', 'DOMUS 3.0 | ELENCO STABILI']], 2: [['D', 'CIVICO'], ['E', 'CAP'], ['F', "CITTA'"]], 3: [['C', 'ALTRA'], ['D', '3'], ['E', '20100'], ['F', 'MILANO']] };
    const s = await leggiStabiliXlsx(await xlsx([{ nome: 'BARZETTI', righe: variante }, { nome: 'PERSI', righe: persi }, { nome: 'DOMUS', righe: secondo }]));
    expect(s.map((x) => `${x.via} ${x.civico}`)).toEqual(['ALAMANNI 8', 'BREDA 20', 'ALTRA 3']);
    expect(s[0]).toMatchObject({ nome: 'CONDOMINIO “LE RESIDENZE”', tipoVia: 'VIA', telefono: '0212345', attivita: ['74.3.C'], amministrazione: 'BARZETTI', codiceFiscale: '97397620150' });
    expect(s[1].nome).toBe('BREDA'); // il numero d'ordine non è il nome
    expect(s[2].amministrazione).toBe('DOMUS 3.0');
  });

  it('ricerca per parole in qualsiasi ordine, senza accenti', async () => {
    const s = await leggiStabiliXlsx(await esempio());
    expect(cercaStabili(s, 'aosta 21').map((x) => x.nome)).toEqual(['CONDOMINIO CARAVAGGIO']);
    expect(cercaStabili(s, 'settimo bellini')).toHaveLength(1);
    expect(cercaStabili(s, 'rossi')).toHaveLength(3); // amministrazione
    expect(cercaStabili(s, '')).toEqual([]);
    expect(indirizzoStabile(s[0])).toBe('Via Aosta, 21');
  });
});

describe('precompilazione da uno stabile', () => {
  it('compila indirizzo, CAP, comune, CF, amministrazione e attività senza duplicare quelle già presenti', async () => {
    const [caravaggio] = await leggiStabiliXlsx(await esempio());
    const s = sopralluogoCon(['77.1.A']);
    s.condominio.cap = '99999';
    const x = applicaStabile(s, caravaggio, cat);
    expect(x.condominio).toMatchObject({ nome: 'CARAVAGGIO', indirizzo: 'Via Aosta, 21', cap: '20155', comune: 'MILANO', codiceFiscale: '95710710153', pressoAmministrazione: 'Amministrazione ROSSI' });
    expect(x.attivita.map((a) => a.codice)).toEqual(['77.1.A', '75.2.B']);
    // una seconda applicazione non duplica le attività
    expect(applicaStabile(x, caravaggio, cat).attivita).toHaveLength(2);
  });
});
