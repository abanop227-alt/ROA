import { describe, expect, it } from 'vitest';
import { nuovaProvaIdranti, portataDaPressione, valutaProva } from '../src/lib/idranti';

describe('prova idranti', () => {
  it('riproduce il calcolo del Word di Via Nago: K 80,82, P 2,3 bar → 122,57 l/min', () => {
    expect(portataDaPressione(80.82, 2.3)).toBe(122.57);
  });

  it('esito positivo sopra i 120 l/min, negativo sotto', () => {
    const p = nuovaProvaIdranti('75.2.B');
    p.idrantiTotali = '4';
    p.misure = [{ pStatica: '3,00', pEfflusso: '2,3', portataMisurata: '' }];
    const v = valutaProva(p);
    expect(v.esito).toBe('positivo');
    expect(v.minimoRiscontrato).toBe(122.57);
    expect(v.avvisi).toEqual([]);
    p.misure[0].pEfflusso = '2,0'; // 80,82 × √2 = 114,30
    expect(valutaProva(p).esito).toBe('negativo');
  });

  it('usa la portata misurata dallo strumento se presente (rapporto di una ditta)', () => {
    const p = nuovaProvaIdranti('75.2.B');
    p.misure = [{ pStatica: '5,94', pEfflusso: '4,46', portataMisurata: '194' }];
    const v = valutaProva(p);
    expect(v.misure[0].portata).toBe(194);
    expect(v.misure[0].calcolata).toBe(false);
    expect(v.esito).toBe('positivo');
  });

  it('senza dati la prova è incompleta; le righe vuote non contano', () => {
    const p = nuovaProvaIdranti('75.2.B');
    p.misure = [
      { pStatica: '', pEfflusso: '', portataMisurata: '' },
      { pStatica: '3', pEfflusso: '2,3', portataMisurata: '' },
    ];
    expect(valutaProva(p).misure).toHaveLength(1);
    p.misure = [{ pStatica: '3', pEfflusso: '', portataMisurata: '' }];
    expect(valutaProva(p).esito).toBe('incompleto');
  });

  it('avvisa se gli idranti aperti sono meno del 50%', () => {
    const p = nuovaProvaIdranti('75.2.B');
    p.idrantiTotali = '6';
    p.idrantiAperti = '2';
    p.misure = [{ pStatica: '3', pEfflusso: '2,3', portataMisurata: '' }];
    expect(valutaProva(p).avvisi.join(' ')).toContain('almeno 3');
    p.idrantiAperti = '3';
    expect(valutaProva(p).avvisi).toEqual([]);
  });

  it('avvisa se l’efflusso supera la statica o manca K', () => {
    const p = nuovaProvaIdranti('75.2.B');
    p.misure = [{ pStatica: '2', pEfflusso: '3', portataMisurata: '' }];
    expect(valutaProva(p).avvisi.join(' ')).toContain('supera la statica');
    p.coefficienteK = '';
    expect(valutaProva(p).avvisi.join(' ')).toContain('coefficiente K');
  });
});
