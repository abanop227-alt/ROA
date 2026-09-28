import { catalogoPredefinito, nuovaAttivita, nuovoSopralluogo, sincronizzaVoci } from '../src/lib/catalogo';
import type { Sopralluogo } from '../src/lib/types';

export function sopralluogoCon(codici: string[]): Sopralluogo {
  const s = nuovoSopralluogo(catalogoPredefinito);
  s.attivita = codici.map((c) => {
    const a = catalogoPredefinito.attivita.find((x) => x.codice === c);
    return nuovaAttivita(c, a?.descrizione ?? '');
  });
  return sincronizzaVoci(s, catalogoPredefinito);
}
