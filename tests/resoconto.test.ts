import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { Commessa } from '../src/lib/commesse';
import { amministrazioni, creaResoconto, mesePrecedente, nomeMese, stessaAmministrazione } from '../src/lib/resoconto';
import { resocontoDocx, resocontoXlsx } from '../src/lib/resocontoDocs';
import type { Stabile } from '../src/lib/stabili';
import { leggiFogli } from '../src/lib/stabili';
import { tecnicoVuoto } from '../src/lib/catalogo';

const c = (p: Partial<Commessa>): Commessa => ({ numero: 1, numeroTesto: '1', cliente: 'PASQUALI', tipoVia: 'VIA', via: 'LINATI', civico: '8', cap: '', comune: 'MILANO', pratica: 'ROA', referente: 'ABA', stato: '', dataFine: '', dataConsegna: '', note: '', origine: 'excel', ...p });
const st = (p: Partial<Stabile>): Stabile => ({ id: 'x', nome: 'X', tipoVia: 'VIA', via: 'EUROPA', civico: '5', cap: '', comune: 'SAN DONATO', contatto: '', telefono: '', nop: '', kw: '', attivita: ['75.2.B'], progetto: '', scadenza: '', codiceFiscale: '', note: '', amministrazione: 'PASQUALI', origine: 'f.xlsx', ...p });

const commesse = [
  c({ numero: 1, pratica: 'ROA', stato: 'COMPLETO', dataFine: '2026-08-12', dataConsegna: '2026-08-05' }),
  c({ numero: 2, via: 'EUROPA', civico: '5', pratica: 'RINNOVO', stato: 'COMPLETO', dataFine: '2026-07-20' }),
  c({ numero: 3, via: 'GOVONE', civico: '50', pratica: 'SCIA', stato: '', dataConsegna: '2026-08-28' }),
  c({ numero: 4, cliente: 'FORLANO', via: 'MOIRANO', civico: '5', pratica: 'ROA', stato: 'COMPLETO', dataFine: '2026-08-03' }),
  c({ numero: 5, via: 'NAGO', civico: '22', pratica: 'IPA', stato: '' }),
];

describe('resoconto mensile', () => {
  it('riconosce la stessa amministrazione anche con nomi diversi', () => {
    expect(stessaAmministrazione('PASQUALI', 'Pasquali')).toBe(true);
    expect(stessaAmministrazione('STUDIO C.S.E.', 'BARBATI ERMINIO (STUDIO C.S.E. SRLS)')).toBe(true);
    expect(stessaAmministrazione('PASQUALI', 'FORLANO')).toBe(false);
    expect(stessaAmministrazione('', 'X')).toBe(false);
  });

  it('elenca le amministrazioni senza doppioni', () => {
    expect(amministrazioni(commesse, [st({ amministrazione: 'PASQUALI' }), st({ amministrazione: 'SIBOLDI' })])).toEqual(['FORLANO', 'PASQUALI', 'SIBOLDI']);
  });

  it('divide completati del mese, consegnati e in corso, solo per l’amministrazione scelta', () => {
    const r = creaResoconto('PASQUALI', '2026-08', commesse, []);
    expect(r.completati.map((x) => x.indirizzo)).toEqual(['Via Linati, 8']); // la 2 è completata a luglio
    expect(r.consegnati.map((x) => x.pratica)).toEqual(['SCIA', 'ROA']); // per indirizzo: Govone, Linati
    expect(r.inCorso.map((x) => x.indirizzo)).toEqual(['Via Govone, 50', 'Via Nago, 22']);
    expect(r.totale).toEqual({ completati: 1, consegnati: 2, inCorso: 2 });
    expect(creaResoconto('FORLANO', '2026-08', commesse, []).completati).toHaveLength(1);
  });

  it('scadenze dei prossimi 12 mesi dagli elenchi stabili', () => {
    const stabili = [st({ via: 'A', scadenza: '2027' }), st({ via: 'B', scadenza: '2026-11-05' }), st({ via: 'C', scadenza: '2035' }), st({ via: 'D', scadenza: '' }), st({ via: 'E', scadenza: '2024' })];
    const r = creaResoconto('PASQUALI', '2026-08', [], stabili);
    expect(r.scadenze.map((s) => s.indirizzo)).toEqual(['Via B, 5', 'Via A, 5']);
  });

  it('mese e nomi in italiano', () => {
    expect(nomeMese('2026-08')).toBe('agosto 2026');
    expect(mesePrecedente(new Date(2026, 8, 29))).toBe('2026-08');
    expect(mesePrecedente(new Date(2026, 0, 5))).toBe('2025-12');
  });
});

describe('file del resoconto', () => {
  it('Word e Excel contengono le sezioni e le pratiche', async () => {
    const r = creaResoconto('PASQUALI', '2026-08', commesse, [st({ scadenza: '2027' })]);
    const docx = await JSZip.loadAsync(await (await resocontoDocx(r, tecnicoVuoto)).arrayBuffer());
    const xml = await docx.file('word/document.xml')!.async('string');
    for (const t of ['RESOCONTO LAVORI', 'Amministrazione PASQUALI', 'agosto 2026', 'Lavori completati nel mese (1)', 'Via Linati, 8', 'Lavori in corso (2)', 'Scadenze dei prossimi 12 mesi (1)']) expect(xml).toContain(t);
    const fogli = await leggiFogli(await (await resocontoXlsx(r)).arrayBuffer());
    const testo = [...fogli[0].righe.values()].map((riga) => [...riga.values()].join(' | ')).join('\n');
    expect(testo).toContain('Resoconto lavori – PASQUALI – agosto 2026');
    expect(testo).toContain('Via Govone, 50');
    expect(testo).toContain('12/08/2026');
  });
});
