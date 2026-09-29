import { contaSegnaposto, vociSelezionate } from './catalogo';
import { valutaProva } from './idranti';
import type { Sopralluogo } from './types';

export type LivelloControllo = 'errore' | 'avviso';

export interface Controllo {
  livello: LivelloControllo;
  testo: string;
  /** passo dell'app (0 Attività, 1 Condominio, 2 Voci, 3 Idranti) in cui si corregge */
  passo?: number;
}

/**
 * Controlli prima di generare il Word: non bloccano mai la generazione, ma segnalano quello che
 * nelle ROA scritte a mano è sfuggito più spesso (dati vuoti, date incoerenti, frasi senza foto…).
 */
export function controlliPreGenerazione(s: Sopralluogo): Controllo[] {
  const out: Controllo[] = [];
  const c = s.condominio;
  const voci = vociSelezionate(s);

  if (!s.attivita.length) out.push({ livello: 'errore', testo: 'Nessuna attività selezionata.', passo: 0 });
  if (s.attivita.length && !voci.length) out.push({ livello: 'errore', testo: 'Nessuna frase spuntata: le sezioni del documento sarebbero vuote.', passo: 2 });

  for (const a of s.attivita) {
    if (a.riferimento === 'progetto') {
      if (!a.dataApprovazione) out.push({ livello: 'errore', testo: `Attività ${a.codice}: manca la data di approvazione del progetto.`, passo: 0 });
      if (!a.nProgetto.trim()) out.push({ livello: 'avviso', testo: `Attività ${a.codice}: manca il numero del progetto approvato.`, passo: 0 });
    } else if (!a.regolaTecnica.trim()) {
      out.push({ livello: 'errore', testo: `Attività ${a.codice}: manca la regola tecnica di riferimento.`, passo: 0 });
    }
    if (!a.datoDimensionale.trim()) out.push({ livello: 'avviso', testo: `Attività ${a.codice}: manca il dato dimensionale (kW, mq…).`, passo: 0 });
  }

  if (!c.indirizzo.trim()) out.push({ livello: 'errore', testo: 'Manca l’indirizzo dell’immobile.', passo: 1 });
  if (!c.comune.trim()) out.push({ livello: 'avviso', testo: 'Manca il comune.', passo: 1 });
  if (!c.commessa.trim()) out.push({ livello: 'avviso', testo: 'Manca il numero di commessa (va nel piè di pagina).', passo: 1 });
  if (!c.pressoAmministrazione.trim()) out.push({ livello: 'avviso', testo: 'Manca l’amministrazione (c/o).', passo: 1 });
  if (!c.codiceFiscale.trim()) out.push({ livello: 'avviso', testo: 'Manca il codice fiscale del condominio.', passo: 1 });
  if (!c.dataRelazione) out.push({ livello: 'errore', testo: 'Manca la data della relazione (firma).', passo: 1 });
  else if (c.dataSopralluogo && c.dataRelazione < c.dataSopralluogo) {
    out.push({ livello: 'errore', testo: 'La data della relazione è precedente a quella del sopralluogo.', passo: 1 });
  }
  if (!s.fotoCopertinaId) out.push({ livello: 'avviso', testo: 'Manca la foto di copertina.', passo: 1 });

  const conParentesi = voci.filter((v) => contaSegnaposto(v.testo) > 0);
  if (conParentesi.length) {
    out.push({
      livello: 'errore',
      testo: `${conParentesi.length === 1 ? '1 frase contiene' : `${conParentesi.length} frasi contengono`} ancora parti tra [parentesi]: ${conParentesi.map((v) => v.titolo).join('; ')}.`,
      passo: 2,
    });
  }
  const senzaFoto = voci.filter((v) => v.fotoIds.length === 0);
  if (senzaFoto.length) {
    out.push({
      livello: 'avviso',
      testo: `${senzaFoto.length === 1 ? '1 frase è' : `${senzaFoto.length} frasi sono`} senza foto: ${senzaFoto.map((v) => v.titolo).join('; ')}.`,
      passo: 2,
    });
  }
  const senzaTesto = voci.filter((v) => !v.testo.trim());
  if (senzaTesto.length) {
    out.push({ livello: 'errore', testo: `Frasi senza testo: ${senzaTesto.map((v) => v.titolo).join('; ')}.`, passo: 2 });
  }

  const pi = s.provaIdranti;
  if (pi?.attiva) {
    const v = valutaProva(pi);
    if (v.esito === 'incompleto') out.push({ livello: 'avviso', testo: 'Prova idranti: mancano le pressioni per calcolare la portata.', passo: 3 });
    if (v.esito === 'negativo') out.push({ livello: 'avviso', testo: 'Prova idranti con esito negativo: valuta se aggiungere la verifica dell’impianto alle voci della ROA.', passo: 3 });
    for (const a of v.avvisi) out.push({ livello: 'avviso', testo: `Prova idranti: ${a}`, passo: 3 });
    if (!pi.fotoProvaIds.length && !pi.fotoRapportoIds.length) out.push({ livello: 'avviso', testo: 'Prova idranti: nessuna foto della prova.', passo: 3 });
  }

  return out;
}
