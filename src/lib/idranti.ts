// Prova di pressione e portata della rete idranti (UNI 10779 / UNI EN 671-3), come nei Word dello studio:
//   Q = K × √(10 × P)     Q in l/min, P = pressione di efflusso in MPa (1 MPa = 10 bar)
import { arrotonda2 } from './computo';
import { formatNumero, parseNumero } from './numeri';
import type { ProvaIdranti } from './types';
import { oggiISO } from './util';

export const K_PREDEFINITO = '80,82';
export const PORTATA_MINIMA_PREDEFINITA = '120';

/** Testo dello strumento come nei Word dello studio: da adattare al proprio. */
export const STRUMENTO_PREDEFINITO =
  'un misuratore di pressione e portata d’acqua modello F.M. 12 STREAM mtr. n° [numero], prodotto dalla SAPIN, testato dall’Istituto Giordano con rapporto di prova n° [numero] e munito di ugello Ø 12 mm.';

export function nuovaProvaIdranti(attivita = ''): ProvaIdranti {
  return {
    attiva: true,
    attivita,
    dataProva: oggiISO(),
    riferimento: attivita ? `Verifica del § 6.1.4 del D.M. 01/02/1986 per ATT. ${attivita}.` : '',
    zona: 'AUTORIMESSA',
    descrizioneImpianto: '',
    circostanza: '',
    eseguitaDa: '',
    idrantiTotali: '',
    idrantiAperti: '2',
    strumento: STRUMENTO_PREDEFINITO,
    coefficienteK: K_PREDEFINITO,
    portataMinima: PORTATA_MINIMA_PREDEFINITA,
    misure: [{ pStatica: '', pEfflusso: '', portataMisurata: '' }],
    note: '',
    fotoAttaccoIds: [],
    fotoProvaIds: [],
    fotoRapportoIds: [],
  };
}

/** Q = K × √(10 × P[MPa]); con P in bar diventa K × √P[bar]. */
export function portataDaPressione(k: number, pEfflussoBar: number): number {
  if (!(k > 0) || !(pEfflussoBar > 0)) return 0;
  return arrotonda2(k * Math.sqrt(10 * (pEfflussoBar / 10)));
}

export interface MisuraValutata {
  n: number;
  /** valori come digitati (compaiono così nel Word) */
  pStaticaTesto: string;
  pEfflussoTesto: string;
  pStatica: number | null;
  pEfflusso: number | null;
  /** l/min: misurata o calcolata; null se mancano i dati */
  portata: number | null;
  calcolata: boolean;
}

export type EsitoProva = 'positivo' | 'negativo' | 'incompleto';

export interface ValutazioneProva {
  misure: MisuraValutata[];
  portataMinima: number;
  /** portata più bassa tra le misure complete */
  minimoRiscontrato: number | null;
  esito: EsitoProva;
  /** idranti da aprire contemporaneamente: almeno il 50% (arrotondato per eccesso) */
  idrantiMinimi: number | null;
  avvisi: string[];
}

const num = (t: string): number | null => (t.trim() ? parseNumero(t) : null);

export function valutaProva(p: ProvaIdranti): ValutazioneProva {
  const k = parseNumero(p.coefficienteK);
  const minima = parseNumero(p.portataMinima);
  // le righe rimaste vuote non contano
  const compilate = p.misure.filter((m) => m.pStatica.trim() || m.pEfflusso.trim() || m.portataMisurata.trim());
  const misure: MisuraValutata[] = compilate.map((m, i) => {
    const pEf = num(m.pEfflusso);
    const misurata = num(m.portataMisurata);
    const portata = misurata !== null && misurata > 0 ? misurata : pEf ? portataDaPressione(k, pEf) || null : null;
    return { n: i + 1, pStaticaTesto: m.pStatica.trim(), pEfflussoTesto: m.pEfflusso.trim(), pStatica: num(m.pStatica), pEfflusso: pEf, portata, calcolata: !(misurata !== null && misurata > 0) };
  });
  const complete = misure.filter((m) => m.portata !== null);
  const minimo = complete.length ? Math.min(...complete.map((m) => m.portata!)) : null;
  const avvisi: string[] = [];
  const tot = num(p.idrantiTotali);
  const aperti = num(p.idrantiAperti);
  const idrantiMinimi = tot && tot > 0 ? Math.max(2, Math.ceil(tot / 2)) : null;
  if (idrantiMinimi !== null && aperti !== null && aperti < Math.min(idrantiMinimi, tot!)) {
    avvisi.push(`Con ${formatNumero(tot!, 0)} idranti la prova va fatta con almeno ${idrantiMinimi} aperti contemporaneamente (50%): ne risultano ${formatNumero(aperti, 0)}.`);
  }
  if (aperti !== null && tot !== null && aperti > tot) avvisi.push('Gli idranti aperti sono più di quelli totali.');
  if (!(k > 0) && misure.some((m) => m.calcolata && m.pEfflusso)) avvisi.push('Manca il coefficiente K dello strumento: la portata non si può calcolare.');
  for (const m of misure) if (m.pStatica !== null && m.pEfflusso !== null && m.pEfflusso > m.pStatica) avvisi.push(`Misura ${m.n}: la pressione di efflusso supera la statica: controlla i valori.`);
  return {
    misure,
    portataMinima: minima,
    minimoRiscontrato: minimo,
    esito: minimo === null || !(minima > 0) || complete.length < misure.length ? 'incompleto' : minimo >= minima ? 'positivo' : 'negativo',
    idrantiMinimi,
    avvisi,
  };
}

/** Portata come nei Word: "122,57" */
export const formatPortata = (n: number) => formatNumero(n, 2);
