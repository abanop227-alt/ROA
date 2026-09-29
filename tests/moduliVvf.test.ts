import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { tecnicoVuoto } from '../src/lib/catalogo';
import { compilaModello, dividiIndirizzo, moduliPredefiniti, nomeFileModulo, professionistaVuoto, valoriPin3, valoriPin31 } from '../src/lib/moduliVvf';
import type { Tecnico } from '../src/lib/types';
import { sopralluogoCon } from './aiuti';

const modello = (f: string) => new Uint8Array(readFileSync(new URL(`../public/moduli/${f}`, import.meta.url)));

async function testi(blob: Blob) {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file('word/document.xml')!.async('string');
  const testo = [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)]
    .map((p) => [...p[0].matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((t) => t[1]).join(''))
    .join('\n')
    .replace(/&amp;/g, '&');
  return { xml, testo };
}

const tecnico: Tecnico = {
  ...tecnicoVuoto,
  vvf: {
    ...professionistaVuoto(),
    titolo: 'Geom.',
    cognome: 'Rossi',
    nome: 'Mario',
    collegio: 'Collegio Geometri',
    alboProvincia: 'Milano',
    alboNumero: '1234',
    codiceMI: 'MI01234',
    ufficio: { indirizzo: 'Via Roma', civico: '7', cap: '20100', comune: 'Milano', provincia: 'MI', telefono: '02 000000' },
    email: 'studio@example.it',
    pec: 'studio@pec.example.it',
  },
};

function esempio() {
  const s = sopralluogoCon(['77.1.A', '74.1.A']);
  Object.assign(s.condominio, { nome: 'Alfa', indirizzo: 'Via Aosta, 21', cap: '20155', comune: 'Milano', codiceFiscale: '80000000000', telefono: '02 111111', indirizzoAmministrazione: 'Via Verdi, 5' });
  s.pratica = { tipo: 'rinnovo', stato: 'bozza', referente: '', origineId: null, dataStato: '2026-01-01', dataPresentazione: '', protocolloPec: '', nPraticaVvf: '309845' };
  const d = moduliPredefiniti(s);
  d.titolare.cognome = 'Bianchi';
  d.titolare.nome = 'Luca';
  d.titolare.codiceFiscale = 'BNCLCU70A01F205X';
  d.sciaPrecedente = 'RINNOVO CPI DEL 28/04/2021';
  d.versamentoTotale = '250,00';
  d.versamento[0].importo = '€ 50,00'.replace('€ ', '');
  return { s, d };
}

describe('dati predefiniti dei moduli', () => {
  it('divide indirizzo e civico', () => {
    expect(dividiIndirizzo('Via Aosta, 21')).toEqual({ indirizzo: 'VIA AOSTA', civico: '21' });
    expect(dividiIndirizzo('Viale Coni Zugna 21/A')).toEqual({ indirizzo: 'VIALE CONI ZUGNA', civico: '21/A' });
    expect(dividiIndirizzo('Piazza Duomo')).toEqual({ indirizzo: 'PIAZZA DUOMO', civico: '' });
  });

  it('ricava sede, attività e versamento da condominio e attività', () => {
    const { d } = esempio();
    expect(d.sede).toMatchObject({ indirizzo: 'VIA AOSTA', civico: '21', cap: '20155', comune: 'MILANO', provincia: 'MI' });
    expect(d.attivita).toMatchObject({ tipo: 'EDIFICIO DI CIVILE ABITAZIONE', classe: '77.1.A', altre: '74.1.A' });
    expect(d.ragione).toBe('CONDOMINIO Alfa – Via Aosta, 21 – C.F: 80000000000');
    expect(d.versamento).toEqual([{ n: '77', sotto: '1.A', importo: '50,00' }, { n: '74', sotto: '1.A', importo: '' }]);
    expect(d.titolare).toMatchObject({ indirizzo: 'VIA VERDI', civico: '5', qualifica: 'AMMINISTRATORE PRO TEMPORE' });
  });
});

describe('MOD. PIN 3 – rinnovo', () => {
  it('riempie i riquadri e non lascia segnaposto', async () => {
    const { s, d } = esempio();
    const { testo, xml } = await testi(await compilaModello(modello('pin3-rinnovo.docx'), valoriPin3(s, d, tecnico)));
    for (const atteso of ['309845', 'MILANO', 'BIANCHI', 'LUCA', 'VIA VERDI', 'AMMINISTRATORE PRO TEMPORE', 'CONDOMINIO Alfa – Via Aosta, 21 – C.F: 80000000000', 'VIA AOSTA', 'EDIFICIO DI CIVILE ABITAZIONE', '77.1.A', 'RINNOVO CPI DEL 28/04/2021', '250,00', 'ROSSI', 'MARIO', 'VIA ROMA', 'studio@example.it']) {
      expect(testo, atteso).toContain(atteso);
    }
    expect(xml).not.toContain('{{');
    // XML valido: ogni <w:default> ha l'attributo w:val
    expect(xml.match(/<w:default(?! w:val="[01]")/g)).toBeNull();
    // codice fiscale: una lettera per casella
    expect(testo).toContain('\nB\nN\nC\nL\nC\nU\n7\n0\nA\n0\n1\nF\n2\n0\n5\nX');
  });

  it('la casella dell’asseverazione segue la scelta', async () => {
    const { s, d } = esempio();
    const con = await testi(await compilaModello(modello('pin3-rinnovo.docx'), valoriPin3(s, d, tecnico)));
    const caselle = (x: string) => (x.match(/<w:checkBox>[\s\S]*?<\/w:checkBox>/g) ?? []).map((c) => /w:val="(\d)"/.exec(c)?.[1]);
    expect(caselle(con.xml).slice(0, 2)).toEqual(['1', '0']);
    d.allegaAsseverazione = false;
    const senza = await testi(await compilaModello(modello('pin3-rinnovo.docx'), valoriPin3(s, d, tecnico)));
    expect(caselle(senza.xml).slice(0, 2)).toEqual(['0', '1']);
  });

  it('escapa i caratteri speciali', async () => {
    const { s, d } = esempio();
    d.titolare.cognome = "D'Angelo & <Figli>";
    const { xml } = await testi(await compilaModello(modello('pin3-rinnovo.docx'), valoriPin3(s, d, tecnico)));
    expect(xml).toContain("D'ANGELO &amp; &lt;FIGLI&gt;");
  });
});

describe('MOD. PIN 3.1 – asseverazione per rinnovo', () => {
  it('riempie professionista, attività e impianti verificati', async () => {
    const { s, d } = esempio();
    d.sciaFirma = 'BIANCHI LUCA';
    d.dataSopralluogo = '2026-05-25';
    d.impianti[0] = { attivo: true, testo: 'N° 12 idranti UNI 45' };
    const { testo, xml } = await testi(await compilaModello(modello('pin31-asseverazione-rinnovo.docx'), valoriPin31(s, d, tecnico)));
    for (const atteso of ['309845', 'GEOM.', 'ROSSI', 'MARIO', 'COLLEGIO GEOMETRI', 'MILANO', '1234', 'MI01234', 'VIA ROMA', '77.1.A'.length ? 'EDIFICIO DI CIVILE ABITAZIONE' : '', 'VIA AOSTA', 'RINNOVO CPI DEL 28/04/2021', 'BIANCHI LUCA', '25/05/2026', 'N° 12 idranti UNI 45']) {
      expect(testo, atteso).toContain(atteso);
    }
    expect(xml).not.toContain('{{');
  });
});

describe('nome del file', () => {
  it('segue la convenzione dell’archivio', () => {
    const { s } = esempio();
    expect(nomeFileModulo('pin3', s)).toBe('01_Via Aosta, 21_MOD. PIN 3 - 2023_RINNOVO PERIODICO.docx');
    expect(nomeFileModulo('pin31', s)).toBe('02_Via Aosta, 21_MOD. PIN 3.1 - 2014_ASSEVERAZIONE PER RINNOVO.docx');
  });
});
