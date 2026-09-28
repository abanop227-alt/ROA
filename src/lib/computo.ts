import { gruppiDocumento, zonaComputo } from './catalogo';
import { parseNumero } from './numeri';
import type { Catalogo, RigaComputo, Sopralluogo } from './types';

export interface RigaCalcolata {
  key: string;
  origine: 'voce' | 'extra';
  /** voce di provenienza (solo per origine "voce") */
  voceKey?: string;
  descrizione: string;
  um: string;
  quantitaTesto: string;
  prezzoTesto: string;
  quantita: number;
  prezzo: number;
  /** null se il prezzo non è stato indicato */
  importo: number | null;
}

export interface ZonaComputo {
  codice: string;
  etichetta: string;
  righe: RigaCalcolata[];
  totale: number;
  conPrezzi: boolean;
}

export function arrotonda2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function calcola(r: RigaComputo, origine: 'voce' | 'extra', voceKey?: string): RigaCalcolata {
  const quantita = r.quantita.trim() ? parseNumero(r.quantita) : 1;
  const prezzo = parseNumero(r.prezzo);
  return {
    key: r.key,
    origine,
    voceKey,
    descrizione: r.descrizione,
    um: r.um,
    quantitaTesto: r.quantita,
    prezzoTesto: r.prezzo,
    quantita,
    prezzo,
    importo: r.prezzo.trim() ? arrotonda2(quantita * prezzo) : null,
  };
}

/** Computo per zona (una tabella per attività): lavorazioni delle voci spuntate, poi le righe aggiuntive. */
export function zoneComputo(s: Sopralluogo, catalogo: Catalogo): ZonaComputo[] {
  return gruppiDocumento(s)
    .map((g) => {
      const codice = g.attivita.codice;
      const righe: RigaCalcolata[] = [
        ...g.sezioni.flatMap((x) =>
          x.voci.flatMap((v) => v.lavorazioni.filter((l) => l.inclusa).map((l) => calcola(l, 'voce', v.key))),
        ),
        ...s.righeExtra.filter((r) => r.zona === codice && r.inclusa).map((r) => calcola(r, 'extra')),
      ];
      return {
        codice,
        etichetta: zonaComputo(catalogo, codice),
        righe,
        totale: arrotonda2(righe.reduce((t, r) => t + (r.importo ?? 0), 0)),
        conPrezzi: righe.some((r) => r.importo !== null),
      };
    })
    // una zona con la sola riga "Trasporto…" proposta d'ufficio non ha senso nel documento
    .filter((z) => z.righe.some((r) => r.origine === 'voce' || !r.key.startsWith('trasporto@')));
}

export function totaleComplessivo(zone: ZonaComputo[]): number {
  return arrotonda2(zone.reduce((t, z) => t + z.totale, 0));
}
