import { describe, expect, it } from 'vitest';
import {
  catalogoPredefinito,
  certificazioniRichieste,
  gruppiSelezionati,
  nuovaAttivita,
  nuovaVocePersonalizzata,
  sincronizzaVoci,
  validaCatalogo,
  vociDiAttivita,
  vociVisibili,
} from '../src/lib/catalogo';
import { sopralluogoCon } from './aiuti';

describe('istanziazione delle voci per attività', () => {
  it('la libreria predefinita contiene 6 attività e 13 voci', () => {
    expect(catalogoPredefinito.attivita).toHaveLength(6);
    expect(catalogoPredefinito.voci).toHaveLength(13);
  });

  it('nessuna attività selezionata = nessuna voce', () => {
    expect(sopralluogoCon([]).voci).toHaveLength(0);
  });

  it('"Cartelli" con 74.1.A e 75.1.A diventa due voci indipendenti', () => {
    const s = sopralluogoCon(['74.1.A', '75.1.A']);
    const cartelli = s.voci.filter((v) => v.voceId === 'g11');
    expect(cartelli.map((v) => v.key).sort()).toEqual(['g11@74.1.A', 'g11@75.1.A']);
    cartelli[0].note = 'solo nella prima';
    cartelli[0].certificazioni.push({ testo: 'x', richiesta: true });
    expect(cartelli[1].note).toBe('');
    expect(cartelli[1].certificazioni).toHaveLength(0);
  });

  it('ogni voce è istanziata per ciascuna attività selezionata a cui si applica', () => {
    const codici = ['74.1.A', '75.1.A', '77.1.A'];
    const s = sopralluogoCon(codici);
    const attese = catalogoPredefinito.voci.reduce(
      (n, v) => n + v.attivita.filter((c) => codici.includes(c)).length,
      0,
    );
    expect(s.voci).toHaveLength(attese);
    for (const c of codici) {
      const ids = vociDiAttivita(s, c).map((v) => v.voceId);
      const attesi = catalogoPredefinito.voci.filter((v) => v.attivita.includes(c)).map((v) => v.id);
      expect(ids).toEqual(attesi);
    }
    // 77.1.A: vano scala, locali macchine, idranti, cartelli
    expect(vociDiAttivita(s, '77.1.A').map((v) => v.voceId)).toEqual(['g1', 'g6', 'g10', 'g11']);
  });

  it('le voci sono istanziate con testo, certificazioni (tutte spuntate) e U.M. della libreria', () => {
    const s = sopralluogoCon(['74.2.B']);
    const v = s.voci.find((x) => x.voceId === 'g2')!;
    const lib = catalogoPredefinito.voci.find((x) => x.id === 'g2')!;
    expect(v.testo).toBe(lib.testo);
    expect(v.rifNormativo).toBe(lib.rifNormativo);
    expect(v.certificazioni.every((c) => c.richiesta)).toBe(true);
    expect(v.certificazioni.map((c) => c.testo)).toEqual(lib.certificazioni);
    expect(v.computo.um).toBe('a corpo');
    expect(v.selezionata).toBe(false);
  });

  it('la sincronizzazione è idempotente e non sovrascrive le modifiche', () => {
    const s = sopralluogoCon(['75.1.A']);
    s.voci[0].testo = 'modificato';
    const s2 = sincronizzaVoci(s, catalogoPredefinito);
    expect(s2).toBe(s);
    expect(s2.voci[0].testo).toBe('modificato');
  });

  it('deselezionare un\'attività nasconde le sue voci senza perderle', () => {
    const s = sopralluogoCon(['74.1.A', '75.1.A']);
    s.voci.find((v) => v.key === 'g11@75.1.A')!.note = 'da tenere';
    const senza = { ...s, attivita: s.attivita.filter((a) => a.codice !== '75.1.A') };
    expect(vociVisibili(senza).some((v) => v.attivita === '75.1.A')).toBe(false);
    const di_nuovo = sincronizzaVoci({ ...senza, attivita: s.attivita }, catalogoPredefinito);
    expect(di_nuovo.voci.find((v) => v.key === 'g11@75.1.A')!.note).toBe('da tenere');
  });

  it('voci personalizzate: nell\'attività del tab o nelle prescrizioni generali', () => {
    const s = sopralluogoCon(['77.1.A']);
    s.voci.push(nuovaVocePersonalizzata('77.1.A'), nuovaVocePersonalizzata(null));
    const gruppi = gruppiSelezionati(s);
    expect(gruppi.map((g) => g.attivita?.codice ?? null)).toEqual(['77.1.A', null]);
    expect(gruppi[0].voci).toHaveLength(1);
    expect(gruppi[1].voci).toHaveLength(1);
  });

  it('attività personalizzata: nessuna voce di libreria', () => {
    const s = sopralluogoCon([]);
    s.attivita.push(nuovaAttivita('99.9.X', 'Attività di prova', true));
    expect(sincronizzaVoci(s, catalogoPredefinito).voci).toHaveLength(0);
  });

  it('certificazioni senza duplicati e solo se spuntate', () => {
    const s = sopralluogoCon(['75.1.A', '77.1.A']);
    for (const v of s.voci) v.selezionata = true;
    s.voci.find((v) => v.key === 'g9@75.1.A')!.certificazioni[1].richiesta = false;
    const elenco = certificazioniRichieste(s);
    expect(new Set(elenco).size).toBe(elenco.length);
    expect(elenco.filter((c) => c === 'Certificazione porte REI')).toHaveLength(1);
    expect(elenco).not.toContain('Contratto di manutenzione presidi mobili');
  });

  it('la libreria accetta nuove voci e attività senza modificare il codice', () => {
    const cat = validaCatalogo({
      attivita: [{ codice: '49.1.A', descrizione: 'Gruppi elettrogeni' }],
      voci: [{ id: 'n1', titolo: 'Nuova', attivita: ['49.1.A'], testo: 'x', certificazioni: [], umDefault: 'mc' }],
    });
    expect(cat.umOptions).toContain('mc');
    const s = sincronizzaVoci({ ...sopralluogoCon([]), attivita: [nuovaAttivita('49.1.A', '')] }, cat);
    expect(s.voci.map((v) => v.key)).toEqual(['n1@49.1.A']);
    expect(() => validaCatalogo({ attivita: [] })).toThrow(/voci/);
  });
});
