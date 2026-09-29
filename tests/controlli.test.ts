import { describe, expect, it } from 'vitest';
import { controlliPreGenerazione } from '../src/lib/controlli';
import { sopralluogoCon } from './aiuti';

const testi = (s: ReturnType<typeof sopralluogoCon>) => controlliPreGenerazione(s).map((c) => c.testo);

describe('controlli prima del Word', () => {
  it('segnala tutto in un sopralluogo vuoto', () => {
    const t = testi(sopralluogoCon([]));
    expect(t).toContain('Nessuna attività selezionata.');
    expect(t).toContain('Manca l’indirizzo dell’immobile.');
  });

  it('segnala data di approvazione mancante, [parentesi] e frasi senza foto', () => {
    const s = sopralluogoCon(['74.1.A']);
    s.voci[0].selezionata = true;
    s.voci[0].testo = 'Presenza di [numero] caldaie';
    const c = controlliPreGenerazione(s);
    expect(c.some((x) => x.testo.includes('data di approvazione') && x.livello === 'errore')).toBe(true);
    expect(c.some((x) => x.testo.includes('[parentesi]') && x.livello === 'errore')).toBe(true);
    expect(c.some((x) => x.testo.includes('senza foto') && x.livello === 'avviso')).toBe(true);
  });

  it('data della relazione precedente al sopralluogo = errore', () => {
    const s = sopralluogoCon(['77.1.A']);
    s.condominio.dataSopralluogo = '2026-03-10';
    s.condominio.dataRelazione = '2026-03-01';
    expect(testi(s)).toContain('La data della relazione è precedente a quella del sopralluogo.');
    s.condominio.dataRelazione = '2026-03-10';
    expect(testi(s)).not.toContain('La data della relazione è precedente a quella del sopralluogo.');
  });

  it('con riferimento a regola tecnica non chiede il progetto approvato', () => {
    const s = sopralluogoCon(['75.2.B']);
    s.attivita[0].riferimento = 'regola';
    expect(testi(s).some((x) => x.includes('data di approvazione'))).toBe(false);
  });
});
