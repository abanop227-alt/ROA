import { describe, expect, it } from 'vitest';
import { nuovoSopralluogo } from '../src/lib/catalogo';
import { anniRinnovo, conStato, giorniAllaScadenza, motivoSciaBloccata, nuovaPraticaDa, praticaDi, puoCreareScia, scadenzaRinnovo, scadenzeDistinte } from '../src/lib/pratiche';
import { sopralluogoCon } from './aiuti';

describe('flusso della pratica', () => {
  it('un sopralluogo senza pratica è una ROA in bozza', () => {
    const p = praticaDi(nuovoSopralluogo());
    expect(p.tipo).toBe('roa');
    expect(p.stato).toBe('bozza');
  });

  it('la SCIA si può creare solo a lavori eseguiti', () => {
    let s = sopralluogoCon(['74.1.A']);
    for (const stato of ['bozza', 'emessa', 'lavori'] as const) {
      s = conStato(s, stato, '2026-05-01');
      expect(puoCreareScia(s)).toBe(false);
      expect(motivoSciaBloccata(s)).toContain('Lavori eseguiti');
    }
    s = conStato(s, 'eseguiti', '2026-06-10');
    expect(puoCreareScia(s)).toBe(true);
    expect(motivoSciaBloccata(s)).toBeNull();
    expect(praticaDi(s).dataStato).toBe('2026-06-10');
  });

  it('stati non previsti per il tipo vengono ignorati', () => {
    const s = sopralluogoCon(['74.1.A']);
    expect(conStato(s, 'presentata')).toBe(s); // una ROA non si "presenta"
  });

  it('la SCIA nata da una ROA copia stabile e attività e la collega', () => {
    let roa = sopralluogoCon(['74.1.A', '77.1.A']);
    roa.condominio.indirizzo = 'Via Linati, 8';
    roa.condominio.commessa = '18/26';
    roa.voci[0].selezionata = true;
    roa = conStato(conStato(roa, 'emessa'), 'eseguiti');
    const scia = nuovaPraticaDa(roa, 'scia');
    expect(scia.id).not.toBe(roa.id);
    expect(scia.pratica).toMatchObject({ tipo: 'scia', stato: 'bozza', origineId: roa.id });
    expect(scia.condominio.indirizzo).toBe('Via Linati, 8');
    expect(scia.attivita.map((a) => a.codice)).toEqual(['74.1.A', '77.1.A']);
    expect(scia.voci).toEqual([]); // le frasi restano nella ROA
    scia.attivita[0].codice = 'X';
    expect(roa.attivita[0].codice).toBe('74.1.A'); // copia indipendente
  });

  it('un rinnovo presentato registra la data di presentazione', () => {
    const r = conStato(nuovaPraticaDa(sopralluogoCon(['77.1.A']), 'rinnovo'), 'presentata', '2026-03-02');
    expect(praticaDi(r)).toMatchObject({ stato: 'presentata', dataPresentazione: '2026-03-02' });
  });
});

describe('scadenza del rinnovo (art. 5 D.P.R. 151/2011)', () => {
  it('5 anni per 74 e 75, 10 per la 77', () => {
    expect(anniRinnovo('74.1.A')).toBe(5);
    expect(anniRinnovo('75.2.B')).toBe(5);
    expect(anniRinnovo('77.1.A')).toBe(10);
    expect(anniRinnovo('64.1.B')).toBe(10);
  });

  it('attività non indipendenti: vale il termine minore', () => {
    expect(scadenzaRinnovo(['74.1.A', '77.1.A'], '2026-05-26')).toBe('2031-05-26');
    expect(scadenzaRinnovo(['77.1.A'], '2026-05-26')).toBe('2036-05-26');
  });

  it('attività indipendenti: scadenze distinte', () => {
    expect(scadenzaRinnovo(['74.1.A', '77.1.A'], '2026-05-26', true)).toBe('2036-05-26');
    expect(scadenzeDistinte(['74.1.A', '77.1.A'], '2026-05-26')).toEqual([
      { codice: '74.1.A', scadenza: '2031-05-26' },
      { codice: '77.1.A', scadenza: '2036-05-26' },
    ]);
  });

  it('senza data valida non c’è scadenza', () => {
    expect(scadenzaRinnovo(['74.1.A'], '')).toBeNull();
    expect(scadenzaRinnovo([], '2026-05-26')).toBeNull();
  });

  it('giorni alla scadenza', () => {
    expect(giorniAllaScadenza('2026-10-29', '2026-09-29')).toBe(30);
    expect(giorniAllaScadenza('2026-09-01', '2026-09-29')).toBe(-28);
  });
});
