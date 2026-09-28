import datiPredefiniti from '../data/roa-dati.json';
import type {
  AttivitaCatalogo,
  AttivitaSelezionata,
  Catalogo,
  Sopralluogo,
  VoceCatalogo,
  VoceIstanza,
} from './types';
import { nuovoId, oggiISO } from './util';

/** Controlla la struttura di una libreria (JSON) e restituisce un Catalogo pulito. */
export function validaCatalogo(dati: unknown): Catalogo {
  const errore = (msg: string): never => {
    throw new Error(`Libreria non valida: ${msg}`);
  };
  if (!dati || typeof dati !== 'object') errore('il file non contiene un oggetto JSON');
  const d = dati as Record<string, unknown>;
  if (!Array.isArray(d.attivita)) errore('manca l\'elenco "attivita"');
  if (!Array.isArray(d.voci)) errore('manca l\'elenco "voci"');

  const attivita: AttivitaCatalogo[] = (d.attivita as unknown[]).map((a, i) => {
    const x = a as Record<string, unknown>;
    if (typeof x?.codice !== 'string' || !x.codice.trim()) errore(`attività n. ${i + 1} senza "codice"`);
    return { codice: String(x.codice).trim(), descrizione: String(x.descrizione ?? '') };
  });

  const idVisti = new Set<string>();
  const voci: VoceCatalogo[] = (d.voci as unknown[]).map((v, i) => {
    const x = v as Record<string, unknown>;
    const id = typeof x?.id === 'string' && x.id.trim() ? x.id.trim() : `v${i}`;
    if (idVisti.has(id)) errore(`id voce duplicato "${id}"`);
    idVisti.add(id);
    if (typeof x.titolo !== 'string') errore(`voce "${id}" senza "titolo"`);
    return {
      id,
      titolo: String(x.titolo),
      attivita: Array.isArray(x.attivita) ? x.attivita.map(String) : [],
      rifNormativo: String(x.rifNormativo ?? ''),
      testo: String(x.testo ?? ''),
      certificazioni: Array.isArray(x.certificazioni) ? x.certificazioni.map(String) : [],
      umDefault: String(x.umDefault ?? 'a corpo'),
    };
  });

  const umOptions = Array.isArray(d.umOptions) && d.umOptions.length ? d.umOptions.map(String) : ['a corpo', 'cad'];
  for (const v of voci) if (!umOptions.includes(v.umDefault)) umOptions.push(v.umDefault);

  return {
    attivita,
    voci,
    umOptions,
    conclusioniDefault: String(d.conclusioniDefault ?? ''),
  };
}

export const catalogoPredefinito: Catalogo = validaCatalogo(datiPredefiniti);

export function chiaveVoce(voceId: string, codice: string): string {
  return `${voceId}@${codice}`;
}

export function istanziaVoce(voce: VoceCatalogo, codice: string): VoceIstanza {
  return {
    key: chiaveVoce(voce.id, codice),
    voceId: voce.id,
    attivita: codice,
    personalizzata: false,
    selezionata: false,
    titolo: voce.titolo,
    rifNormativo: voce.rifNormativo,
    testo: voce.testo,
    note: '',
    certificazioni: voce.certificazioni.map((testo) => ({ testo, richiesta: true })),
    fotoIds: [],
    computo: { descrizione: '', um: voce.umDefault, quantita: '1', prezzo: '' },
  };
}

export function nuovaVocePersonalizzata(attivita: string | null, um = 'a corpo'): VoceIstanza {
  return {
    key: nuovoId('pers-'),
    voceId: null,
    attivita,
    personalizzata: true,
    selezionata: true,
    titolo: 'Nuova voce',
    rifNormativo: '',
    testo: '',
    note: '',
    certificazioni: [],
    fotoIds: [],
    computo: { descrizione: '', um, quantita: '1', prezzo: '' },
  };
}

/**
 * Istanzia ogni voce della libreria una volta per ciascuna attività selezionata a cui si applica.
 * Le istanze già presenti (con testo, note, foto…) non vengono toccate; quelle di attività
 * deselezionate restano in memoria ma non sono visibili (vedi `vociVisibili`).
 */
export function sincronizzaVoci(s: Sopralluogo, catalogo: Catalogo): Sopralluogo {
  const esistenti = new Set(s.voci.map((v) => v.key));
  const nuove: VoceIstanza[] = [];
  for (const att of s.attivita) {
    for (const voce of catalogo.voci) {
      if (!voce.attivita.includes(att.codice)) continue;
      const key = chiaveVoce(voce.id, att.codice);
      if (esistenti.has(key)) continue;
      esistenti.add(key);
      nuove.push(istanziaVoce(voce, att.codice));
    }
  }
  return nuove.length ? { ...s, voci: [...s.voci, ...nuove] } : s;
}

/** Voci appartenenti alle attività attualmente selezionate (+ prescrizioni generali). */
export function vociVisibili(s: Sopralluogo): VoceIstanza[] {
  const codici = new Set(s.attivita.map((a) => a.codice));
  return s.voci.filter((v) => v.attivita === null || codici.has(v.attivita));
}

export function vociDiAttivita(s: Sopralluogo, codice: string | null): VoceIstanza[] {
  return vociVisibili(s).filter((v) => v.attivita === codice);
}

export interface GruppoVoci {
  attivita: AttivitaSelezionata | null; // null = prescrizioni generali
  voci: VoceIstanza[];
}

/** Voci selezionate raggruppate nell'ordine del documento: attività nell'ordine scelto, poi generali. */
export function gruppiSelezionati(s: Sopralluogo): GruppoVoci[] {
  const gruppi: GruppoVoci[] = s.attivita.map((a) => ({
    attivita: a,
    voci: s.voci.filter((v) => v.selezionata && v.attivita === a.codice),
  }));
  const generali = s.voci.filter((v) => v.selezionata && v.attivita === null);
  if (generali.length) gruppi.push({ attivita: null, voci: generali });
  return gruppi;
}

export function nuovaAttivita(codice: string, descrizione: string, personalizzata = false): AttivitaSelezionata {
  return { codice, descrizione, personalizzata, nProgetto: '', dataApprovazione: '', datoDimensionale: '' };
}

export function nuovoSopralluogo(catalogo: Catalogo): Sopralluogo {
  const ora = Date.now();
  return {
    id: nuovoId(),
    creato: ora,
    modificato: ora,
    attivita: [],
    condominio: {
      committente: '',
      indirizzo: '',
      comune: '',
      codiceFiscale: '',
      dataSopralluogo: oggiISO(),
      pressoAmministrazione: '',
      indirizzoAmministrazione: '',
      telefono: '',
      commessa: '',
    },
    voci: [],
    conclusioni: catalogo.conclusioniDefault,
  };
}

/** Elenco delle certificazioni richieste, senza duplicati, nell'ordine di comparsa. */
export function certificazioniRichieste(s: Sopralluogo): string[] {
  const viste = new Set<string>();
  const out: string[] = [];
  for (const g of gruppiSelezionati(s)) {
    for (const v of g.voci) {
      for (const c of v.certificazioni) {
        const t = c.testo.trim();
        const k = t.toLowerCase().replace(/\s+/g, ' ');
        if (!c.richiesta || !t || viste.has(k)) continue;
        viste.add(k);
        out.push(t);
      }
    }
  }
  return out;
}

/** Individua le parti ancora tra [parentesi quadre] da completare. */
export function contaSegnaposto(testo: string): number {
  return (testo.match(/\[[^\]]*\]/g) || []).length;
}
