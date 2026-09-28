import { describe, expect, it } from 'vitest';
import {
  duplicaSezione,
  famigliaDi,
  gruppiDocumento,
  migraSopralluogo,
  nuovaAttivita,
  nuovaVocePersonalizzata,
  numerazioneFoto,
  nonAggravioEffettivo,
  sezioniDiAttivita,
  sincronizza,
  testoConclusioniAutomatico,
  validaCatalogo,
  vociDiSezione,
} from '../src/lib/catalogo';
import { cat, sopralluogoCon, voce } from './aiuti';

describe('libreria', () => {
  it('contiene le famiglie 74, 75 e 77 con sezioni e voci', () => {
    expect(cat.famiglie.map((f) => f.id).sort()).toEqual(['74', '75', '77']);
    for (const f of cat.famiglie) {
      expect(f.sezioni.length).toBeGreaterThanOrEqual(3);
      expect(f.certificazioni.length).toBeGreaterThan(3);
      expect(f.regoleTecniche.length).toBeGreaterThanOrEqual(1);
    }
    expect(cat.famiglie.find((f) => f.id === '77')!.sezioni.map((s) => s.titolo)).toEqual([
      'Vano scala',
      'Mezzi di estinzione',
      'Cartelli e segnaletica di sicurezza',
    ]);
  });

  it('le parti da completare non hanno parentesi annidate', () => {
    for (const f of cat.famiglie)
      for (const s of f.sezioni)
        for (const v of s.voci) {
          let d = 0;
          for (const ch of v.testo) {
            d += ch === '[' ? 1 : ch === ']' ? -1 : 0;
            expect(d === 0 || d === 1, v.id).toBe(true);
          }
          expect(d, v.id).toBe(0);
        }
  });

  it('la famiglia si ricava dal numero: anche un codice personalizzato 75.3.C ha le voci delle autorimesse', () => {
    expect(famigliaDi(cat, '75.3.C')?.id).toBe('75');
    expect(famigliaDi(cat, '99.1.A')).toBeUndefined();
  });

  it('accetta una libreria modificata con una nuova famiglia, senza toccare il codice', () => {
    const c = validaCatalogo({
      attivita: [{ codice: '49.1.A', descrizione: 'Gruppi elettrogeni' }],
      famiglie: [{ id: '49', sezioni: [{ id: 'ge', titolo: 'Gruppo elettrogeno', voci: [{ id: 'ge1', titolo: 'x', testo: 'y', lavorazioni: [{ descrizione: 'z', um: 'mc' }] }] }] }],
    });
    expect(c.umOptions).toContain('mc');
    const s = sincronizza({ ...sopralluogoCon([]), attivita: [nuovaAttivita(c, '49.1.A')] }, c);
    expect(s.voci.map((v) => v.key)).toEqual(['ge1@ge@49.1.A']);
    expect(() => validaCatalogo({ attivita: [] })).toThrow(/famiglie/);
  });
});

describe('istanziazione per attività', () => {
  it('una 77 mostra tutte le voci della libreria 77, sezione per sezione', () => {
    const s = sopralluogoCon(['77.1.A']);
    const f77 = cat.famiglie.find((f) => f.id === '77')!;
    const sezioni = sezioniDiAttivita(s, '77.1.A');
    expect(sezioni.map((x) => x.titolo)).toEqual(f77.sezioni.map((x) => x.titolo));
    sezioni.forEach((sez, i) => {
      expect(vociDiSezione(s, sez.key).map((v) => v.voceId)).toEqual(f77.sezioni[i].voci.map((v) => v.id));
    });
    expect(s.voci.every((v) => !v.selezionata)).toBe(true);
  });

  it('più attività insieme: 74 + 75 + 77, ognuna con le sue voci indipendenti', () => {
    const s = sopralluogoCon(['74.1.A', '75.2.B', '77.1.A']);
    const tot = cat.famiglie.reduce((n, f) => n + f.sezioni.reduce((m, x) => m + x.voci.length, 0), 0);
    expect(s.voci).toHaveLength(tot);
    expect(new Set(s.voci.map((v) => v.attivita))).toEqual(new Set(['74.1.A', '75.2.B', '77.1.A']));
    expect(s.righeExtra.map((r) => r.key)).toEqual(['trasporto@74.1.A', 'trasporto@75.2.B', 'trasporto@77.1.A']);
  });

  it('due attività della stessa famiglia hanno voci separate', () => {
    const s = sopralluogoCon(['75.1.A', '75.2.B']);
    const a = voce(s, '75-ar-posacenere', '75.1.A');
    const b = voce(s, '75-ar-posacenere', '75.2.B');
    expect(a.key).not.toBe(b.key);
    a.testo = 'modificato';
    expect(b.testo).not.toBe('modificato');
  });

  it('attività, regola tecnica, scopo e certificazioni proposti dalla libreria', () => {
    const a = nuovaAttivita(cat, '77.1.A');
    expect(a.regolaTecnica).toBe('D.M. 16/05/1987 n° 246');
    expect(a.regolaTecnicaTesto).toContain('D.M. 16/05/1987');
    expect(a.descrizioneScopo).toContain('{dato}');
    expect(a.certificazioni.every((c) => c.richiesta)).toBe(true);
    const a74 = nuovaAttivita(cat, '74.1.A');
    expect(a74.certificazioni.some((c) => !c.richiesta)).toBe(true); // opzionali non spuntate
  });

  it('la sincronizzazione è idempotente e non tocca le modifiche', () => {
    const s = sopralluogoCon(['74.1.A']);
    s.voci[0].testo = 'modificato';
    const s2 = sincronizza(s, cat);
    expect(s2).toBe(s);
  });

  it('duplica una sezione (Vano scala → Vano scala B) con voci nuove e vuote', () => {
    let s = sopralluogoCon(['77.1.A']);
    const vs = sezioniDiAttivita(s, '77.1.A')[0];
    voce(s, '77-vs-aer-ok').selezionata = true;
    s = duplicaSezione(s, cat, vs.key, 'Vano scala B');
    const sez = sezioniDiAttivita(s, '77.1.A');
    expect(sez.map((x) => x.titolo)).toEqual(['Vano scala', 'Vano scala B', 'Mezzi di estinzione', 'Cartelli e segnaletica di sicurezza']);
    const nuove = vociDiSezione(s, sez[1].key);
    expect(nuove.length).toBe(vociDiSezione(s, vs.key).length);
    expect(nuove.every((v) => !v.selezionata)).toBe(true);
    // una seconda duplicazione va dopo "Vano scala B"
    s = duplicaSezione(s, cat, vs.key, 'Vano scala C');
    expect(sezioniDiAttivita(s, '77.1.A').map((x) => x.titolo).slice(0, 3)).toEqual(['Vano scala', 'Vano scala B', 'Vano scala C']);
  });

  it('documento: solo voci spuntate, sezioni vuote escluse; foto numerate in ordine', () => {
    const s = sopralluogoCon(['74.1.A', '77.1.A']);
    const a = voce(s, '74-ct-aer-ok');
    const b = voce(s, '77-vs-aer-ok');
    const c = voce(s, '77-me-rete');
    [a, b, c].forEach((v) => (v.selezionata = true));
    a.fotoIds = ['f1'];
    b.fotoIds = ['f2', 'f3'];
    const pers = nuovaVocePersonalizzata(sezioniDiAttivita(s, '77.1.A')[2]);
    s.voci.push(pers);
    const g = gruppiDocumento(s);
    expect(g.map((x) => x.sezioni.map((y) => y.sezione.titolo))).toEqual([
      ['Locale centrale termica'],
      ['Vano scala', 'Mezzi di estinzione', 'Cartelli e segnaletica di sicurezza'],
    ]);
    const n = numerazioneFoto(s);
    expect(n.get(a.key)).toEqual([1]);
    expect(n.get(b.key)).toEqual([2, 3]);
  });

  it('conclusioni automatiche: esito, riferimenti e non aggravio dalla voce', () => {
    const s = sopralluogoCon(['74.1.A', '77.1.A']);
    s.attivita[0].dataApprovazione = '2001-06-08';
    s.attivita[1].riferimento = 'regola';
    let t = testoConclusioniAutomatico(s, cat);
    expect(t).toContain('non risulta dunque conforme al progetto approvato il 08/06/2001 per l’attività 74.1.A e al D.M. 16/05/1987 n° 246 per l’attività 77.1.A');
    expect(t).not.toContain('non aggravio');
    voce(s, '74-ct-pot-diff').selezionata = true;
    expect(nonAggravioEffettivo(s)).toBe(true);
    t = testoConclusioniAutomatico(s, cat);
    expect(t).toContain('dichiarazione di non aggravio');
    s.nonAggravio = false;
    expect(nonAggravioEffettivo(s)).toBe(false);
  });

  it('migra i sopralluoghi creati con la prima versione dell’app', () => {
    const vecchio = {
      id: 'x',
      creato: 1,
      modificato: 2,
      attivita: [{ codice: '77.1.A', descrizione: 'd', nProgetto: '12', dataApprovazione: '2020-01-01', datoDimensionale: '25' }],
      condominio: { committente: 'Cond. Alfa', dataSopralluogo: '2026-01-01' },
      voci: [{ key: 'g1@77.1.A' }],
      conclusioni: 'x',
    };
    const s = sincronizza(migraSopralluogo(vecchio, cat), cat);
    expect(s.versione).toBe(2);
    expect(s.attivita[0].nProgetto).toBe('12');
    expect(s.condominio.committente).toBe('Cond. Alfa');
    expect(s.voci.length).toBeGreaterThan(5);
  });
});
