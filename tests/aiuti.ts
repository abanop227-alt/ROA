import { catalogoPredefinito, nuovaAttivita, nuovoSopralluogo, sincronizza } from '../src/lib/catalogo';
import type { Sopralluogo } from '../src/lib/types';

export const cat = catalogoPredefinito;

export function sopralluogoCon(codici: string[]): Sopralluogo {
  const s = nuovoSopralluogo();
  s.attivita = codici.map((c) => nuovaAttivita(cat, c));
  return sincronizza(s, cat);
}

export function voce(s: Sopralluogo, voceId: string, codice?: string) {
  const v = s.voci.find((x) => x.voceId === voceId && (!codice || x.attivita === codice));
  if (!v) throw new Error(`voce ${voceId} non trovata`);
  return v;
}
