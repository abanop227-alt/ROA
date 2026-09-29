import { readFileSync } from 'node:fs';
import { Packer } from 'docx';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { tecnicoVuoto } from '../src/lib/catalogo';
import type { FotoDati } from '../src/lib/docx';
import { creaDocumentoIdranti, nomeFileIdranti } from '../src/lib/docxIdranti';
import { nuovaProvaIdranti } from '../src/lib/idranti';
import type { Sopralluogo, Tecnico } from '../src/lib/types';
import { cat, sopralluogoCon } from './aiuti';

const jpg = new Uint8Array(readFileSync(new URL('./fixtures/foto.jpg', import.meta.url)));
const archivio: Record<string, FotoDati> = {
  a1: { data: jpg, width: 160, height: 120 },
  a2: { data: jpg, width: 160, height: 120 },
  p1: { data: jpg, width: 160, height: 120 },
  p2: { data: jpg, width: 160, height: 120 },
  r1: { data: jpg, width: 160, height: 120 },
};
const carica = async (id: string) => archivio[id] ?? null;
const tecnico: Tecnico = { ...tecnicoVuoto, intestazione: 'Tecnico: Geom. Mario Rossi', firma: 'Geom. Mario Rossi', societa: 'STUDIO SRL', iniziali: 'M.R.' };

/** Le stesse cifre del documento "NAGO, 22_PROVA IDRANTI". */
function nago(): Sopralluogo {
  const s = sopralluogoCon(['75.2.B']);
  Object.assign(s.condominio, { indirizzo: 'Via Nago, 22', cap: '20142', comune: 'Milano', commessa: '283/26', dataRelazione: '2026-04-29' });
  const p = nuovaProvaIdranti('75.2.B');
  Object.assign(p, {
    dataProva: '2026-04-29',
    circostanza: 'al momento del collaudo del gruppo di pompaggio',
    descrizioneImpianto: 'L’impianto idrico antincendio a servizio dell’autorimessa si sviluppa nei due piani interrati ed è composto da un totale di n°4 idranti UNI 45.',
    idrantiTotali: '4',
    idrantiAperti: '2',
    strumento: 'un misuratore modello F.M. 12 STREAM mtr. n° 743, prodotto dalla SAPIN.',
    fotoAttaccoIds: ['a1', 'a2'],
    fotoProvaIds: ['p1', 'p2'],
    misure: [{ pStatica: '3,00', pEfflusso: '2,3', portataMisurata: '' }],
  });
  s.provaIdranti = p;
  return s;
}

async function apri(s: Sopralluogo) {
  const zip = await JSZip.loadAsync(await Packer.toBuffer(await creaDocumentoIdranti(s, cat, tecnico, carica)));
  const xml = await zip.file('word/document.xml')!.async('string');
  const testo = [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)]
    .map((p) => [...p[0].matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>|<w:tab\/>/g)].map((t) => t[1] ?? ' ').join(''))
    .join('\n')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"');
  return { zip, xml, testo };
}

describe('Word della prova idranti', () => {
  it('riproduce la struttura e le cifre del documento di Via Nago', async () => {
    const { testo, xml } = await apri(nago());
    const ordine = [
      'VERIFICA FUNZIONALITA’ RETE IDRANTI CONDOMINIO VIA NAGO, 22 – MILANO',
      'INDICE',
      '1 PARTE GENERALE',
      'Tecnico: Geom. Mario Rossi',
      'Lo scopo del presente elaborato consiste in:',
      'Verificare il corretto funzionamento dell’impianto idrico antincendio presente a servizio dell’autorimessa.',
      'La prova di pressione è stata effettuata al momento del collaudo del gruppo di pompaggio in data 29/04/2026.',
      '2 ESPOSIZIONE DELLA CONSULENZA',
      'Verifica del § 6.1.4 del D.M. 01/02/1986 per ATT. 75.2.B.',
      '2.1 ATTIVITA’ “75.2.B”',
      '2.1.1 AUTORIMESSA',
      'idranti UNI 45',
      'Foto 1 – Foto 2 – Attacco di mandata VV.F.',
      'con la contemporanea apertura di n° 2 presidi tra i più svantaggiati per distanza dal punto di consegna (foto 3 – 4).',
      'Foto 3 – Foto 4 – Prova di pressione.',
      'Strumentazione',
      'Lo strumento utilizzato è un misuratore modello F.M. 12 STREAM mtr. n° 743',
      'Misurazioni',
      'Prova – con 2 idranti aperti',
      'con l’apertura contemporanea di n° 2 idranti sui n° 4 totali:',
      '1° misura pressione statica          P(st) = 3,00 Bar',
      '1° misura pressione di efflusso    P(ef) = 2,3 Bar',
      'Q = K x √(10 x P)',
      'K = 80,82 – coefficiente indicato dalla tabella dello strumento in uso',
      'Si ottiene:',
      'Q= 80,82 x √(10 x 0,23 Mpa)= 122,57 l/min.',
      'Q= 122,57 l/min. Portata idrica all’ idrante più sfavorito',
      '3 CONCLUSIONI',
      'deve essere almeno di 120 l/min. la prova effettuata ha dato esito positivo, in quanto:',
      'Portata minima richiesta = 120 l/min.',
      'Portata riscontrata = 122,57 l/min.',
      'Ritenendo pertanto concluso il nostro incarico',
    ];
    let da = 0;
    for (const t of ordine) {
      const i = testo.indexOf(t, da);
      expect(i, `manca o fuori posto: ${t}`).toBeGreaterThanOrEqual(0);
      da = i;
    }
    expect(xml.match(/<w:drawing>/g)).toHaveLength(4);
    expect(testo).not.toContain('[');
  });

  it('esito negativo: propone la verifica dell’impiantista', async () => {
    const s = nago();
    s.provaIdranti!.misure[0].pEfflusso = '1,8';
    const { testo } = await apri(s);
    expect(testo).toContain('ha dato esito negativo');
    expect(testo).toContain('inferiore al minimo richiesto');
    expect(testo).toContain('verificare l’impianto idrico antincendio da parte di un impiantista');
  });

  it('prova eseguita da una ditta: usa la portata misurata e allega il rapporto', async () => {
    const s = nago();
    Object.assign(s.provaIdranti!, {
      eseguitaDa: 'D & D Service and consulting (rapporto n° 26947)',
      misure: [{ pStatica: '5,94', pEfflusso: '4,46', portataMisurata: '194' }],
      fotoRapportoIds: ['r1'],
    });
    const { testo, xml } = await apri(s);
    expect(testo).toContain('La prova è stata eseguita da D & D Service and consulting (rapporto n° 26947): i rilievi sono riportati nel rapporto in allegato.');
    expect(testo).not.toContain('Strumentazione');
    expect(testo).toContain('Portata misurata dallo strumento = 194,00 l/min.');
    expect(testo).toContain('4 ALLEGATO – RAPPORTO DELLA DITTA');
    expect(xml.match(/<w:drawing>/g)).toHaveLength(5);
  });

  it('senza pressioni lascia l’esito da completare, evidenziato', async () => {
    const s = nago();
    s.provaIdranti!.misure = [{ pStatica: '', pEfflusso: '', portataMisurata: '' }];
    const { testo, xml } = await apri(s);
    expect(testo).toContain('[Esito della prova da completare');
    expect(xml).toContain('w:highlight');
  });

  it('nome file', () => {
    expect(nomeFileIdranti(nago())).toBe('PROVA_IDRANTI_Via_Nago_22_Milano_2026-04-29.docx');
  });
});
