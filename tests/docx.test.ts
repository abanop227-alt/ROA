import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { Packer } from 'docx';
import { describe, expect, it } from 'vitest';
import { nuovaVocePersonalizzata } from '../src/lib/catalogo';
import { creaDocumento, nomeFileDocx, tipoImmagine, type FotoDati } from '../src/lib/docx';
import type { Sopralluogo } from '../src/lib/types';
import { sopralluogoCon } from './aiuti';

const jpg = new Uint8Array(readFileSync(new URL('./fixtures/foto.jpg', import.meta.url)));
const png = new Uint8Array(readFileSync(new URL('./fixtures/foto.png', import.meta.url)));
const archivioFoto: Record<string, FotoDati> = {
  f1: { data: jpg, width: 160, height: 120 },
  f2: { data: png, width: 60, height: 90 },
};
const carica = async (id: string) => archivioFoto[id] ?? null;

function esempio(): Sopralluogo {
  const s = sopralluogoCon(['74.1.A', '75.1.A']);
  s.condominio.committente = 'Condominio Via Verdi 12';
  s.condominio.indirizzo = 'Via Verdi 12';
  s.condominio.comune = 'Milano';
  s.condominio.dataSopralluogo = '2026-09-28';
  s.condominio.telefono = '02 1234567';
  s.attivita[0].nProgetto = '12345';
  s.attivita[0].dataApprovazione = '2010-05-04';
  s.attivita[0].datoDimensionale = '250 kW';
  s.attivita[1].nProgetto = '67890';
  s.attivita[1].dataApprovazione = '2012-01-20';
  s.attivita[1].datoDimensionale = '800 mq';
  const cartelli74 = s.voci.find((v) => v.key === 'g11@74.1.A')!;
  cartelli74.selezionata = true;
  cartelli74.note = 'Manca cartello estintore al piano -1';
  cartelli74.fotoIds = ['f1', 'f2', 'mancante'];
  cartelli74.computo.quantita = '4';
  cartelli74.computo.prezzo = '1234,5';
  const filtri = s.voci.find((v) => v.key === 'g0@75.1.A')!;
  filtri.selezionata = true;
  filtri.computo.quantita = '2';
  filtri.computo.prezzo = '800';
  const pers = nuovaVocePersonalizzata(null);
  pers.titolo = 'Pulizia locali comuni';
  pers.testo = 'Si provveda alla pulizia.';
  pers.certificazioni.push({ testo: 'Certificazione porte REI', richiesta: true });
  s.voci.push(pers);
  return s;
}

async function apri(s: Sopralluogo) {
  const buf = await Packer.toBuffer(await creaDocumento(s, carica));
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml')!.async('string');
  // testo "piatto" dei paragrafi
  const testo = [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)]
    .map((p) => [...p[0].matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((t) => t[1]).join(''))
    .join('\n')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
  return { buf, zip, xml, testo };
}

describe('generazione del .docx', () => {
  it('produce un file Word valido (zip OOXML) che contiene tutte le sezioni', async () => {
    const { buf, zip, xml, testo } = await apri(esempio());
    expect(buf.subarray(0, 2).toString()).toBe('PK');
    expect(zip.file('[Content_Types].xml')).toBeTruthy();
    expect(zip.file('word/styles.xml')).toBeTruthy();
    expect(xml).toContain('<w:document');

    expect(testo).toContain("VERIFICA DELLO STATO DEI LUOGHI PER L'ADEGUAMENTO DELLO STABILE");
    expect(testo).toContain('Relativamente al Condominio Via Verdi 12');
    expect(testo).toContain('AI FINI DELLA PREVENZIONE INCENDI');
    for (const sez of [
      '1. Parte generale',
      '2. Esposizione della consulenza',
      '2.1 Attività 74.1.A',
      '2.2 Attività 75.1.A',
      '2.3 Prescrizioni generali',
      '3. Certificazioni e documentazioni da produrre',
      '4. Computo metrico delle opere',
      '5. Conclusioni',
    ]) {
      expect(testo).toContain(sez);
    }
    expect(testo).toContain('2.1.1 Cartelli e segnaletica di sicurezza');
    expect(testo).toContain('2.2.1 Filtri a prova di fumo vani scala / autorimessa');
    expect(testo).toContain('Note dal sopralluogo: Manca cartello estintore al piano -1');
    expect(testo).toContain('Lo scopo del presente elaborato consiste in:');
    expect(testo).toContain('progetto approvato al N° 12345 del 04/05/2010');
    expect(testo).toContain('dato dimensionale: 800 mq');
    expect(testo).toContain('le attività soggette al controllo del Comando dei Vigili del Fuoco');
  });

  it('usa gli stili Heading, A4 e Arial 11', async () => {
    const { zip, xml } = await apri(esempio());
    expect(xml).toContain('w:val="Heading1"');
    expect(xml).toContain('w:val="Heading2"');
    expect(xml).toContain('w:val="Heading3"');
    expect(xml).toMatch(/<w:pgSz[^>]*w:w="11906"[^>]*w:h="16838"/);
    const stili = await zip.file('word/styles.xml')!.async('string');
    expect(stili).toContain('Arial');
    expect(stili).toMatch(/<w:docDefaults>[\s\S]*<w:sz w:val="22"\/>/);
  });

  it('incorpora le foto (jpg e png) a ~8 cm mantenendo le proporzioni', async () => {
    const { zip, xml } = await apri(esempio());
    const media = Object.keys(zip.files).filter((f) => f.startsWith('word/media/'));
    expect(media.some((f) => f.endsWith('.jpg') || f.endsWith('.jpeg'))).toBe(true);
    expect(media.some((f) => f.endsWith('.png'))).toBe(true);
    const ext = [...xml.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"/g)].map((m) => [+m[1], +m[2]]);
    expect(ext).toHaveLength(2); // la foto "mancante" viene ignorata
    const cm = (emu: number) => emu / 360000;
    for (const [cx] of ext) expect(cm(cx)).toBeCloseTo(8, 0);
    expect(ext[0][1] / ext[0][0]).toBeCloseTo(120 / 160, 2);
    expect(ext[1][1] / ext[1][0]).toBeCloseTo(90 / 60, 2);
  });

  it('computo: tabella con DXA, ombreggiatura CLEAR, numeri italiani e totale', async () => {
    const { xml, testo } = await apri(esempio());
    expect(testo).toContain('Descrizione');
    expect(testo).toContain('Importo €');
    expect(testo).toContain('Cartelli e segnaletica di sicurezza (74.1.A)');
    expect(testo).toContain('1.234,50');
    expect(testo).toContain('4.938,00'); // 4 × 1.234,50
    expect(testo).toContain('6.538,00'); // + 2 × 800
    expect(xml).toContain('<w:tblW w:type="dxa" w:w="9638"/>');
    expect(xml).toMatch(/<w:gridCol w:w="4838"\/>/);
    expect(xml).toMatch(/<w:tcW w:type="dxa" w:w="\d+"\/>/);
    expect(xml).not.toMatch(/<w:tcW w:type="(pct|auto)"/);
    expect(xml).toMatch(/<w:shd [^>]*w:val="clear"/);
  });

  it('certificazioni senza duplicati', async () => {
    const { testo } = await apri(esempio());
    const sez3 = testo.split('3. Certificazioni e documentazioni da produrre')[1].split('4. Computo')[0];
    expect(sez3.match(/Certificazione porte REI/g)).toHaveLength(1);
  });

  it('una sola attività: forma singolare; tabella dati solo con i campi compilati', async () => {
    const s = sopralluogoCon(['77.1.A']);
    s.condominio.committente = 'Condominio Alfa';
    s.condominio.dataSopralluogo = '2026-01-02';
    const { testo } = await apri(s);
    expect(testo).toContain("l'attività soggetta al controllo del Comando dei Vigili del Fuoco presente nel Condominio in oggetto è identificata al numero del D.P.R. 151/11:");
    expect(testo).toContain('Committente');
    expect(testo).toContain('02/01/2026');
    expect(testo).not.toContain('Telefono');
    expect(testo).not.toContain('C.F. condominio');
    expect(testo).toContain('Non sono state rilevate prescrizioni');
  });

  it('tipo immagine e nome file', () => {
    expect(tipoImmagine(jpg)).toBe('jpg');
    expect(tipoImmagine(png)).toBe('png');
    expect(tipoImmagine(new Uint8Array([1, 2, 3, 4]))).toBeNull();
    expect(nomeFileDocx(esempio())).toBe('ROA_Condominio_Via_Verdi_12_2026-09-28.docx');
  });
});
