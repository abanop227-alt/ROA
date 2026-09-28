import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { Packer } from 'docx';
import { describe, expect, it } from 'vitest';
import { duplicaSezione, sezioniDiAttivita, tecnicoVuoto } from '../src/lib/catalogo';
import { creaDocumento, didascaliaFoto, nomeFileDocx, testoConRiferimentoFoto, tipoImmagine, type FotoDati } from '../src/lib/docx';
import type { Sopralluogo, Tecnico } from '../src/lib/types';
import { cat, sopralluogoCon, voce } from './aiuti';

const jpg = new Uint8Array(readFileSync(new URL('./fixtures/foto.jpg', import.meta.url)));
const png = new Uint8Array(readFileSync(new URL('./fixtures/foto.png', import.meta.url)));
const archivio: Record<string, FotoDati> = {
  f1: { data: jpg, width: 160, height: 120 },
  f2: { data: png, width: 60, height: 90 },
  f3: { data: jpg, width: 160, height: 120 },
  cop: { data: jpg, width: 160, height: 120 },
};
const carica = async (id: string) => archivio[id] ?? null;
const tecnico: Tecnico = {
  ...tecnicoVuoto,
  intestazione: 'Tecnico: Geom. Mario Rossi\nIscritto all’albo n° 0000',
  firma: 'Geom. Mario Rossi',
  societa: 'STUDIO SRL',
  iniziali: 'M.R.',
};

function esempio(): Sopralluogo {
  let s = sopralluogoCon(['74.1.A', '77.1.A']);
  Object.assign(s.condominio, {
    nome: 'Alfa',
    indirizzo: 'Via Verdi, 12',
    cap: '20100',
    comune: 'Milano',
    codiceFiscale: '80000000000',
    telefono: '02 1234567',
    commessa: '123/26',
    dataRelazione: '2026-09-28',
  });
  s.fotoCopertinaId = 'cop';
  Object.assign(s.attivita[0], { nProgetto: '342224', dataApprovazione: '2001-06-08', datoDimensionale: '127,90' });
  Object.assign(s.attivita[1], { riferimento: 'regola', datoDimensionale: '25,20' });

  const pot = voce(s, '74-ct-pot-ok');
  pot.selezionata = true;
  pot.testo = pot.testo.replace('[valore]', '127,90');
  pot.fotoIds = ['f1'];
  pot.note = 'APPUNTO PRIVATO';
  const aer = voce(s, '77-vs-aer-no');
  aer.selezionata = true;
  aer.fotoIds = ['f2', 'f3', 'mancante'];
  aer.lavorazioni[0].quantita = '2';
  aer.lavorazioni[0].prezzo = '1234,5';
  voce(s, '77-me-uni10779').selezionata = true;
  s = duplicaSezione(s, cat, sezioniDiAttivita(s, '77.1.A')[0].key, 'Vano scala B');
  const b = s.voci.find((v) => v.voceId === '77-vs-aer-ok' && v.sezioneKey.includes('#'))!;
  b.selezionata = true;
  s.cartelli.push({ key: 'c1', quantita: '8', descrizione: 'cartelli da applicare in tutti i piani' });
  s.notaBene = 'Nota di prova.';
  return s;
}

async function apri(s: Sopralluogo) {
  const buf = await Packer.toBuffer(await creaDocumento(s, cat, tecnico, carica));
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml')!.async('string');
  const testo = [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)]
    .map((p) => [...p[0].matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>|<w:tab\/>/g)].map((t) => t[1] ?? ' ').join(''))
    .join('\n')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"');
  return { buf, zip, xml, testo };
}

describe('generazione del .docx', () => {
  it('è un file Word valido con frontespizio, indice e tutte le sezioni nell’ordine delle ROA', async () => {
    const { buf, zip, testo } = await apri(esempio());
    expect(buf.subarray(0, 2).toString()).toBe('PK');
    expect(zip.file('word/styles.xml')).toBeTruthy();
    const ordine = [
      'VERIFICA DELLO STATO DEI LUOGHI',
      'PER L’ADEGUAMENTO DELLO STABILE',
      'AL PROGETTO APPROVATO IL 08/06/2001 AL N°342224 PER ATT. 74.1.A',
      'E AL D.M. 16/05/1987 N° 246 PER ATT. 77.1.A',
      'RELATIVAMENTE AL CONDOMINIO ALFA',
      'VIA VERDI, 12 – MILANO',
      'AI FINI DELLA PREVENZIONE INCENDI',
      'INDICE',
      '1 PARTE GENERALE',
      'Tecnico: Geom. Mario Rossi',
      'Committente:',
      'Lo scopo del presente elaborato consiste in:',
      '1) Verificare che lo stato di fatto sia conforme al progetto approvato il 08/06/2001 al N° 342224 per attività:',
      '74.1.A: Impianti per la produzione di calore alimentati a combustibile solido, liquido o gassoso con potenzialità pari a 127,90 kW.',
      'Verificare che lo stato di fatto sia conforme al D.M. 16/05/1987 n° 246 per attività:',
      '77.1.A: Edifici destinati ad uso civile con altezza antincendio pari a 25,20 m.',
      '2) Elencare le certificazioni',
      'le attività soggette al controllo del Comando dei Vigili del Fuoco presente nel Condominio in oggetto sono identificate al numero del D.P.R. 151/11:',
      '2 ESPOSIZIONE DELLA CONSULENZA',
      'Regolamento recante disciplina',
      '2.1 ADEGUAMENTI',
      '2.1.1 ATTIVITA’ “74.1.A”',
      'D.M. 12 aprile 1996.',
      '2.1.1.1 Locale centrale termica',
      'pari a 127,90 kW, rispetto al progetto approvato dal Comando dei VV.F. (foto 1).',
      'Foto 1 – Portata termica riscontrata.',
      '2.1.2 ATTIVITA’ “77.1.A”',
      '2.1.2.1 Vano scala',
      'Foto 2 – Foto 3 – Apertura di aerazione del vano scala.',
      '2.1.2.2 Vano scala B',
      '2.1.2.3 Mezzi di estinzione',
      'UNI 10779-2014',
      '2.2 ORDINE CARTELLI E SEGNALETICA DI SICUREZZA',
      'n° 8 cartelli da applicare in tutti i piani',
      '3 CERTIFICAZIONI',
      '3.1 ATTIVITA’ “74.1.A”',
      '3.2 ATTIVITA’ “77.1.A”',
      'Per impianti non ricadenti nel campo di applicazione del D.M. 37/08',
      '¹Nei casi in cui la dichiarazione di conformità',
      '4 CONCLUSIONI',
      'Lo stato attuale dei luoghi non risulta dunque conforme',
      'Si precisa che la mancata e/o omessa presentazione della SCIA',
      '5 COMPUTO METRICO DELLE OPERE',
      'Edificio di civile abitazione:',
      'Nota bene:',
      'Ritenendo pertanto concluso il nostro incarico',
      'Geom. Mario Rossi',
    ];
    let da = 0;
    for (const t of ordine) {
      const i = testo.indexOf(t, da);
      expect(i, `manca o fuori ordine: "${t}"`).toBeGreaterThanOrEqual(0);
      da = i + t.length;
    }
    // le frasi di aerazione hanno il riferimento alle foto
    expect(testo).toContain('n°[4] vetri presenti (foto 2 – 3).');
    // appunti privati e parti non spuntate esclusi
    expect(testo).not.toContain('APPUNTO PRIVATO');
    expect(testo).not.toContain('Canna fumaria');
    // 74 senza voci nel computo → nessuna tabella "Centrale termica"
    expect(testo).not.toContain('Centrale termica:');
  });

  it('formato del modello: A4 con i suoi margini, Arial 12, titoli, indice, piè di pagina Arial 8', async () => {
    const { zip, xml } = await apri(esempio());
    for (const h of ['Heading1', 'Heading2', 'Heading3', 'Heading4']) expect(xml).toContain(`w:val="${h}"`);
    expect(xml).toMatch(/TOC \\h \\o &quot;1-4&quot;/);
    expect(xml).toMatch(/<w:pgSz[^>]*w:w="11906"[^>]*w:h="16838"/);
    for (const [k, v] of Object.entries({ top: 1560, right: 849, bottom: 1134, left: 1134, header: 0, footer: 708 })) {
      expect(xml).toMatch(new RegExp(`<w:pgMar[^>]*w:${k}="${v}"`));
    }
    // frontespizio: un paragrafo Arial 20 grassetto
    expect(xml).toMatch(/<w:b\/><w:bCs\/><w:sz w:val="40"\/>[\s\S]*?VERIFICA DELLO STATO DEI LUOGHI PER L’ADEGUAMENTO DELLO STABILE AL PROGETTO/);
    const stili = await zip.file('word/styles.xml')!.async('string');
    expect(stili).toContain('Arial');
    expect(stili).toMatch(/<w:docDefaults>[\s\S]*<w:sz w:val="24"\/>/);
    // Titolo 1 grassetto sottolineato, Titolo 4 corsivo, indice con puntini
    expect(stili).toMatch(/w:styleId="Heading1"[\s\S]*?<w:b\/>[\s\S]*?<w:u w:val="single"\/>[\s\S]*?<\/w:style>/);
    expect(stili).toMatch(/w:styleId="Heading4"[\s\S]*?<w:i\/>[\s\S]*?<\/w:style>/);
    expect(stili).toMatch(/w:styleId="TOC1"[\s\S]*?w:leader="dot"[\s\S]*?<w:caps\/>[\s\S]*?<\/w:style>/);
    // frasi a) b) c) e certificazioni 1) 2) 3), sottopunti con freccia Wingdings
    const num = await zip.file('word/numbering.xml')!.async('string');
    expect(num).toContain('w:val="lowerLetter"');
    expect(num).toMatch(/w:val="decimal"[\s\S]*?w:val="%1\)"/);
    expect(num).toContain('Wingdings');
    const settings = await zip.file('word/settings.xml')!.async('string');
    expect(settings).toContain('updateFields');
    const piede = Object.keys(zip.files).find((f) => /word\/footer\d*\.xml/.test(f))!;
    const xmlPiede = await zip.file(piede)!.async('string');
    expect(xmlPiede).toContain('STUDIO SRL n°123/26');
    expect(xmlPiede).toContain('Pagina ');
    expect(xmlPiede).toContain('M.R.');
    expect(xmlPiede).toContain('28/09/2026');
    expect(xmlPiede).toContain('<w:sz w:val="16"/>');
  });

  it('foto: copertina fino a 14 cm, singola alta 7 cm, in coppia larghe 7 cm, proporzioni mantenute', async () => {
    const { zip, xml } = await apri(esempio());
    const media = Object.keys(zip.files).filter((f) => f.startsWith('word/media/'));
    expect(media.some((f) => /\.jpe?g$/.test(f))).toBe(true);
    expect(media.some((f) => f.endsWith('.png'))).toBe(true);
    const ext = [...xml.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"/g)].map((m) => [+m[1] / 360000, +m[2] / 360000]);
    expect(ext).toHaveLength(4);
    const [cop, uno, due, tre] = ext;
    expect(cop[0]).toBeCloseTo(14, 0);
    expect(uno[1]).toBeCloseTo(7, 1);
    expect(due[0]).toBeCloseTo(6.33, 1); // verticale 60×90: limitata a 9,5 cm di altezza
    expect(due[1]).toBeCloseTo(9.5, 1);
    expect(tre[0]).toBeCloseTo(7, 1);
    expect(uno[1] / uno[0]).toBeCloseTo(120 / 160, 2);
    expect(due[1] / due[0]).toBeCloseTo(90 / 60, 2);
  });

  it('indice già compilato come le ROA: una riga per titolo con numero, puntini e pagina', async () => {
    const { xml } = await apri(esempio());
    const sdt = /<w:sdt>[\s\S]*?<\/w:sdt>/.exec(xml)![0];
    expect(sdt).toContain('TOC \\h \\o &quot;1-4&quot;');
    const righe = [...sdt.matchAll(/<w:p>[\s\S]*?<\/w:p>/g)]
      .map((p) => p[0])
      .filter((p) => /w:pStyle w:val="TOC\d"/.test(p))
      .map((p) => [...p.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((t) => t[1]));
    expect(righe[0]).toEqual(['1', 'PARTE GENERALE', '3']);
    const titoli = righe.map((r) => `${r[0]} ${r[1]}`);
    for (const t of ['2 ESPOSIZIONE DELLA CONSULENZA', '2.1.2.2 Vano scala B', '3.2 ATTIVITA’ “77.1.A”', '5 COMPUTO METRICO DELLE OPERE']) {
      expect(titoli).toContain(t);
    }
    // pagine non decrescenti, l'esposizione su una pagina nuova
    const pagine = righe.map((r) => Number(r[2]));
    expect(pagine.every((p, i) => i === 0 || p >= pagine[i - 1])).toBe(true);
    expect(pagine[titoli.indexOf('2 ESPOSIZIONE DELLA CONSULENZA')]).toBeGreaterThan(3);
  });

  it('carta intestata: immagine a pagina intera dietro al testo nell’intestazione', async () => {
    const buf = await Packer.toBuffer(
      await creaDocumento(esempio(), cat, tecnico, carica, { cartaIntestata: { data: jpg, width: 160, height: 226 } }),
    );
    const zip = await JSZip.loadAsync(buf);
    const nome = Object.keys(zip.files).find((f) => /word\/header\d*\.xml/.test(f))!;
    const h = await zip.file(nome)!.async('string');
    expect(h).toContain('behindDoc="1"');
    expect(h).toMatch(/<wp:positionH relativeFrom="page">/);
    const [cx, cy] = [...h.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"/g)].map((m) => [+m[1] / 360000, +m[2] / 360000])[0];
    expect(cx).toBeCloseTo(21, 0);
    expect(cy).toBeCloseTo(29.7, 0);
    // senza carta intestata nessuna intestazione
    const { zip: z2 } = await apri(esempio());
    expect(Object.keys(z2.files).some((f) => /word\/header\d*\.xml/.test(f))).toBe(false);
  });

  it('computo: griglia come il modello (colonne DXA), numeri italiani, prezzi vuoti lasciati vuoti', async () => {
    const { xml, testo } = await apri(esempio());
    expect(xml).toContain('<w:tblW w:type="dxa" w:w="9923"/>');
    for (const c of [436, 5234, 1044, 683, 1190, 1336]) expect(xml).toMatch(new RegExp(`<w:gridCol w:w="${c}"/>`));
    expect(xml).not.toMatch(/<w:tcW w:type="(pct|auto)"/);
    expect(xml).not.toMatch(/<w:shd /);
    expect(testo).toContain('Rimozione vetrata vani scala.');
    expect(testo).toContain('1.234,50');
    expect(testo).toContain('2.469,00');
    expect(testo).toContain('Fornitura e posa “alette in lamiera” per aerazione vano scala.');
  });

  it('una sola attività: forma singolare', async () => {
    const s = sopralluogoCon(['75.2.B']);
    const { testo } = await apri(s);
    expect(testo).toContain('l’attività soggetta al controllo del Comando dei Vigili del Fuoco presente nel Condominio in oggetto è identificata al numero del D.P.R. 151/11:');
    expect(testo).toContain('Non sono state rilevate prescrizioni per questa attività.');
    expect(testo).toContain('L’autorimessa oggetto di relazione');
    expect(testo).toContain('Nessuna lavorazione prevista.');
  });

  it('utilità: riferimento foto, didascalia, tipo immagine, nome file', () => {
    expect(testoConRiferimentoFoto('Testo.', [7, 8])).toBe('Testo (foto 7 – 8).');
    expect(testoConRiferimentoFoto('Testo', [1])).toBe('Testo (foto 1).');
    expect(testoConRiferimentoFoto('Comando dei VV.F.', [2])).toBe('Comando dei VV.F. (foto 2).');
    expect(testoConRiferimentoFoto('Già (foto 3).', [1])).toBe('Già (foto 3).');
    expect(didascaliaFoto([7, 8], 'Aperture')).toBe('Foto 7 – Foto 8 – Aperture.');
    expect(tipoImmagine(jpg)).toBe('jpg');
    expect(tipoImmagine(png)).toBe('png');
    expect(nomeFileDocx(esempio())).toBe('ROA_Alfa_2026-09-28.docx');
  });
});
