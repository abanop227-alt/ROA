import { describe, expect, it } from 'vitest';
import { nuovaRigaExtra } from '../src/lib/catalogo';
import { totaleComplessivo, zoneComputo } from '../src/lib/computo';
import { formatNumero, formatQuantita, parseNumero } from '../src/lib/numeri';
import { cat, sopralluogoCon, voce } from './aiuti';

describe('numeri in formato italiano', () => {
  it('formatta con separatore migliaia e virgola', () => {
    expect(formatNumero(1234.56)).toBe('1.234,56');
    expect(formatNumero(1234567.8)).toBe('1.234.567,80');
    expect(formatNumero(0)).toBe('0,00');
    expect(formatQuantita(2)).toBe('2');
    expect(formatQuantita(2.5)).toBe('2,5');
  });
  it('interpreta i numeri digitati', () => {
    expect(parseNumero('1.234,56')).toBe(1234.56);
    expect(parseNumero('1,5')).toBe(1.5);
    expect(parseNumero('1.234')).toBe(1234);
    expect(parseNumero('')).toBe(0);
  });
});

describe('computo metrico', () => {
  it('nessuna voce spuntata = nessuna tabella (la sola riga "Trasporto" non basta)', () => {
    expect(zoneComputo(sopralluogoCon(['77.1.A']), cat)).toEqual([]);
  });

  it('una tabella per attività con le lavorazioni delle voci spuntate + "Trasporto…"', () => {
    const s = sopralluogoCon(['74.1.A', '77.1.A']);
    voce(s, '74-ct-autochiusura').selezionata = true;
    const porta = voce(s, '77-vs-lma-porta-80');
    porta.selezionata = true;
    const zone = zoneComputo(s, cat);
    expect(zone.map((z) => z.etichetta)).toEqual(['Centrale termica:', 'Edificio di civile abitazione:']);
    expect(zone[0].righe.map((r) => r.descrizione)).toEqual([
      'Ripristino dispositivi di autochiusura.',
      'Trasporto materiali di qualsiasi natura all’esterno del fabbricato e conferimento alle P.P.D.D.',
    ]);
    // la lavorazione alternativa "Tinteggiature" è proposta ma non spuntata
    expect(zone[1].righe).toHaveLength(3);
    expect(porta.lavorazioni.map((l) => l.inclusa)).toEqual([true, true, false]);
  });

  it('prezzi vuoti: importo vuoto; con prezzi: importi, totali e arrotondamenti', () => {
    const s = sopralluogoCon(['75.2.B']);
    const v = voce(s, '75-fv-porta-guaina');
    v.selezionata = true;
    let [z] = zoneComputo(s, cat);
    expect(z.conPrezzi).toBe(false);
    expect(z.righe.every((r) => r.importo === null)).toBe(true);

    v.lavorazioni[0].quantita = '7';
    v.lavorazioni[0].prezzo = '150';
    v.lavorazioni[1].quantita = '10';
    v.lavorazioni[1].prezzo = '1.234,5';
    s.righeExtra.push({ ...nuovaRigaExtra('75.2.B', { descrizione: 'Rimozione posacenere.', um: 'cad' }), quantita: '3', prezzo: '0,335' });
    [z] = zoneComputo(s, cat);
    expect(z.righe.map((r) => r.importo)).toEqual([1050, 12345, null, 1.01]);
    expect(z.totale).toBe(13396.01);
    expect(formatNumero(totaleComplessivo([z]))).toBe('13.396,01');
  });

  it('le righe escluse non entrano nel computo', () => {
    const s = sopralluogoCon(['77.1.A']);
    voce(s, '77-cs-vie').selezionata = true;
    s.righeExtra[0].inclusa = false;
    const [z] = zoneComputo(s, cat);
    expect(z.righe.map((r) => r.descrizione)).toEqual(['Fornitura e posa nuova cartellonistica.']);
  });
});
