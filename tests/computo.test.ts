import { describe, expect, it } from 'vitest';
import { righeComputo, totaleComputo } from '../src/lib/computo';
import { formatNumero, formatQuantita, parseNumero } from '../src/lib/numeri';
import { sopralluogoCon } from './aiuti';

describe('numeri in formato italiano', () => {
  it('formatta con separatore migliaia e virgola', () => {
    expect(formatNumero(1234.56)).toBe('1.234,56');
    expect(formatNumero(1234567.8)).toBe('1.234.567,80');
    expect(formatNumero(0)).toBe('0,00');
    expect(formatNumero(-1500)).toBe('-1.500,00');
    expect(formatQuantita(2)).toBe('2');
    expect(formatQuantita(2.5)).toBe('2,5');
  });
  it('interpreta i numeri digitati', () => {
    expect(parseNumero('1.234,56')).toBe(1234.56);
    expect(parseNumero('1,5')).toBe(1.5);
    expect(parseNumero('1.5')).toBe(1.5);
    expect(parseNumero('1.234')).toBe(1234);
    expect(parseNumero('€ 250')).toBe(250);
    expect(parseNumero('')).toBe(0);
    expect(parseNumero('abc')).toBe(0);
  });
});

describe('calcolo del computo', () => {
  it('genera una riga per ogni voce selezionata, con importo e totale', () => {
    const s = sopralluogoCon(['74.1.A']);
    const [a, b, c] = s.voci;
    a.selezionata = true;
    a.computo.quantita = '3';
    a.computo.prezzo = '1.250,50';
    b.selezionata = true;
    b.computo.quantita = '2,5';
    b.computo.prezzo = '10';
    c.selezionata = false;
    const righe = righeComputo(s);
    expect(righe).toHaveLength(2);
    expect(righe[0].importo).toBe(3751.5);
    expect(righe[1].importo).toBe(25);
    expect(totaleComputo(righe)).toBe(3776.5);
    expect(formatNumero(totaleComputo(righe))).toBe('3.776,50');
  });

  it('arrotonda al centesimo', () => {
    const s = sopralluogoCon(['74.1.A']);
    s.voci[0].selezionata = true;
    s.voci[0].computo.quantita = '3';
    s.voci[0].computo.prezzo = '0,335';
    const righe = righeComputo(s);
    expect(righe[0].importo).toBe(1.01);
  });

  it('descrizione: titolo, + codice attività solo se le attività sono più d\'una', () => {
    const una = sopralluogoCon(['77.1.A']);
    una.voci[0].selezionata = true;
    expect(righeComputo(una)[0].descrizione).toBe(una.voci[0].titolo);

    const due = sopralluogoCon(['74.1.A', '75.1.A']);
    due.voci.filter((v) => v.voceId === 'g11').forEach((v) => (v.selezionata = true));
    expect(righeComputo(due).map((r) => r.descrizione)).toEqual([
      'Cartelli e segnaletica di sicurezza (74.1.A)',
      'Cartelli e segnaletica di sicurezza (75.1.A)',
    ]);
  });

  it('la descrizione modificata a mano prevale; U.M. di default dalla libreria', () => {
    const s = sopralluogoCon(['75.1.A']);
    const v = s.voci.find((x) => x.voceId === 'g0')!;
    v.selezionata = true;
    v.computo.descrizione = 'Porta REI 120 1 anta';
    const [r] = righeComputo(s);
    expect(r.descrizione).toBe('Porta REI 120 1 anta');
    expect(r.um).toBe('cad');
  });

  it('computo vuoto = totale zero', () => {
    expect(totaleComputo(righeComputo(sopralluogoCon(['74.1.A'])))).toBe(0);
  });
});
