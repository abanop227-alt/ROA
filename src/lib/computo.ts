import { gruppiSelezionati } from './catalogo';
import { parseNumero } from './numeri';
import type { Sopralluogo, VoceIstanza } from './types';

export interface RigaCalcolata {
  key: string;
  descrizione: string;
  descrizioneAutomatica: string;
  um: string;
  quantita: number;
  prezzo: number;
  importo: number;
}

export function arrotonda2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function descrizioneAutomatica(v: VoceIstanza, piuAttivita: boolean): string {
  return piuAttivita && v.attivita ? `${v.titolo} (${v.attivita})` : v.titolo;
}

/** Righe del computo metrico generate dalle voci selezionate. */
export function righeComputo(s: Sopralluogo): RigaCalcolata[] {
  const piuAttivita = s.attivita.length > 1;
  return gruppiSelezionati(s).flatMap((g) =>
    g.voci.map((v) => {
      const auto = descrizioneAutomatica(v, piuAttivita);
      const quantita = parseNumero(v.computo.quantita);
      const prezzo = parseNumero(v.computo.prezzo);
      return {
        key: v.key,
        descrizione: v.computo.descrizione.trim() || auto,
        descrizioneAutomatica: auto,
        um: v.computo.um,
        quantita,
        prezzo,
        importo: arrotonda2(quantita * prezzo),
      };
    }),
  );
}

export function totaleComputo(righe: RigaCalcolata[]): number {
  return arrotonda2(righe.reduce((t, r) => t + r.importo, 0));
}
