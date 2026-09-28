import datiPredefiniti from '../data/roa-dati.json';
import type {
  AttivitaSelezionata,
  Catalogo,
  CertificazioneCatalogo,
  FamigliaCatalogo,
  Lavorazione,
  RigaComputo,
  RigaExtra,
  SezioneCatalogo,
  SezioneIstanza,
  Sopralluogo,
  Tecnico,
  VoceCatalogo,
  VoceIstanza,
} from './types';
import { dataItaliana, nuovoId, oggiISO } from './util';

// ======================= validazione libreria =======================

const str = (x: unknown, def = '') => (typeof x === 'string' ? x : x == null ? def : String(x));
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);

/** Controlla la struttura di una libreria (JSON) e restituisce un Catalogo pulito. */
export function validaCatalogo(dati: unknown): Catalogo {
  const errore = (msg: string): never => {
    throw new Error(`Libreria non valida: ${msg}`);
  };
  if (!dati || typeof dati !== 'object') errore('il file non contiene un oggetto JSON');
  const d = dati as Record<string, unknown>;
  if (!Array.isArray(d.attivita)) errore('manca l\'elenco "attivita"');
  if (!Array.isArray(d.famiglie)) errore('manca l\'elenco "famiglie" (formato libreria versione 2)');

  const idVisti = new Set<string>();
  const unico = (id: string, cosa: string) => {
    if (idVisti.has(id)) errore(`${cosa} con id duplicato "${id}"`);
    idVisti.add(id);
  };
  const lav = (l: unknown): Lavorazione => {
    const x = (l ?? {}) as Record<string, unknown>;
    return { descrizione: str(x.descrizione), um: str(x.um, 'a corpo'), ...(x.inclusa === false ? { inclusa: false } : {}) };
  };

  const famiglie: FamigliaCatalogo[] = (d.famiglie as unknown[]).map((f, i) => {
    const x = (f ?? {}) as Record<string, unknown>;
    const id = str(x.id).trim() || errore(`famiglia n. ${i + 1} senza "id"`);
    const sezioni: SezioneCatalogo[] = arr(x.sezioni).map((s, j) => {
      const y = (s ?? {}) as Record<string, unknown>;
      const sid = str(y.id).trim() || `${id}-s${j}`;
      unico(sid, 'sezione');
      const voci: VoceCatalogo[] = arr(y.voci).map((v, k) => {
        const z = (v ?? {}) as Record<string, unknown>;
        const vid = str(z.id).trim() || `${sid}-v${k}`;
        unico(vid, 'voce');
        return {
          id: vid,
          titolo: str(z.titolo) || str(z.testo).slice(0, 60),
          testo: str(z.testo),
          didascalia: str(z.didascalia),
          lavorazioni: arr(z.lavorazioni).map(lav),
          ...(z.nonAggravio ? { nonAggravio: true } : {}),
        };
      });
      return { id: sid, titolo: str(y.titolo), voci };
    });
    const certificazioni: CertificazioneCatalogo[] = arr(x.certificazioni).map((c) => {
      const y = (typeof c === 'string' ? { testo: c } : (c ?? {})) as Record<string, unknown>;
      return {
        testo: str(y.testo),
        ...(Array.isArray(y.sotto) ? { sotto: y.sotto.map((s) => str(s)) } : {}),
        ...(y.predefinita === false ? { predefinita: false } : {}),
      };
    });
    return {
      id,
      nome: str(x.nome, id),
      zonaComputo: str(x.zonaComputo, 'ATTIVITA’ {codice}'),
      unitaDato: str(x.unitaDato),
      etichettaDato: str(x.etichettaDato, 'Dato dimensionale'),
      modelloScopo: str(x.modelloScopo, '{dato}'),
      ...(x.introduzione ? { introduzione: str(x.introduzione) } : {}),
      regoleTecniche: arr(x.regoleTecniche).map((r) => {
        const y = (r ?? {}) as Record<string, unknown>;
        return { etichetta: str(y.etichetta), testo: str(y.testo) };
      }),
      sezioni,
      certificazioni,
    };
  });

  const t = (d.testi ?? {}) as Record<string, unknown>;
  const umOptions = arr(d.umOptions).map((u) => str(u));
  const tutteLav = [
    ...famiglie.flatMap((f) => f.sezioni.flatMap((s) => s.voci.flatMap((v) => v.lavorazioni))),
    ...arr(d.lavorazioniComuni).map(lav),
  ];
  for (const l of tutteLav) if (l.um && !umOptions.includes(l.um)) umOptions.push(l.um);

  return {
    versione: 2,
    attivita: (d.attivita as unknown[]).map((a, i) => {
      const x = (a ?? {}) as Record<string, unknown>;
      const codice = str(x.codice).trim() || errore(`attività n. ${i + 1} senza "codice"`);
      return { codice, descrizione: str(x.descrizione) };
    }),
    famiglie,
    umOptions: umOptions.length ? umOptions : ['a corpo', 'cad'],
    lavorazioniComuni: arr(d.lavorazioniComuni).map(lav),
    cartelliSuggeriti: arr(d.cartelliSuggeriti).map((c) => str(c)),
    notaBeneSuggerimenti: arr(d.notaBeneSuggerimenti).map((c) => str(c)),
    testi: {
      esposizione: str(t.esposizione),
      notaCertificazioni: str(t.notaCertificazioni),
      noteCertificazioni: arr(t.noteCertificazioni).map((c) => str(c)),
      conclusioneCompletare: str(t.conclusioneCompletare),
      conclusioneScia: str(t.conclusioneScia),
      conclusioneNonAggravio: str(t.conclusioneNonAggravio),
      sanzioni: str(t.sanzioni),
      chiusura: str(t.chiusura),
    },
  };
}

export const catalogoPredefinito: Catalogo = validaCatalogo(datiPredefiniti);

/** Famiglia di un codice attività: "75.3.C" → famiglia "75". */
export function famigliaDi(catalogo: Catalogo, codice: string): FamigliaCatalogo | undefined {
  const prefisso = codice.trim().split(/[.\s]/)[0];
  return catalogo.famiglie.find((f) => f.id === prefisso);
}

export function zonaComputo(catalogo: Catalogo, codice: string): string {
  const f = famigliaDi(catalogo, codice);
  return (f?.zonaComputo ?? 'ATTIVITA’ {codice}').replace('{codice}', codice);
}

// ======================= creazione =======================

const TRASPORTO = 'Trasporto materiali di qualsiasi natura all’esterno del fabbricato e conferimento alle P.P.D.D.';

function riga(l: Lavorazione, key = nuovoId('l-')): RigaComputo {
  return { key, descrizione: l.descrizione, um: l.um, quantita: '', prezzo: '', inclusa: l.inclusa !== false };
}

export function nuovaAttivita(catalogo: Catalogo, codice: string, descrizione?: string, personalizzata = false): AttivitaSelezionata {
  const f = famigliaDi(catalogo, codice);
  const cat = catalogo.attivita.find((a) => a.codice === codice);
  const regola = f?.regoleTecniche[0];
  return {
    codice,
    descrizione: descrizione ?? cat?.descrizione ?? '',
    personalizzata,
    riferimento: 'progetto',
    nProgetto: '',
    dataApprovazione: '',
    regolaTecnica: regola?.etichetta ?? '',
    regolaTecnicaTesto: regola?.testo ?? '',
    datoDimensionale: '',
    descrizioneScopo: f?.modelloScopo ?? '',
    introduzione: f?.introduzione ?? '',
    certificazioni: (f?.certificazioni ?? []).map((c) => ({
      testo: c.testo,
      sotto: c.sotto ?? [],
      richiesta: c.predefinita !== false,
    })),
  };
}

export function istanziaVoce(voce: VoceCatalogo, sez: SezioneIstanza): VoceIstanza {
  return {
    key: `${voce.id}@${sez.key}`,
    sezioneKey: sez.key,
    attivita: sez.attivita,
    voceId: voce.id,
    personalizzata: false,
    selezionata: false,
    titolo: voce.titolo,
    testo: voce.testo,
    didascalia: voce.didascalia,
    note: '',
    fotoIds: [],
    lavorazioni: voce.lavorazioni.map((l, i) => riga(l, `${voce.id}@${sez.key}#${i}`)),
    nonAggravio: !!voce.nonAggravio,
  };
}

export function nuovaVocePersonalizzata(sez: SezioneIstanza): VoceIstanza {
  return {
    key: nuovoId('v-'),
    sezioneKey: sez.key,
    attivita: sez.attivita,
    voceId: null,
    personalizzata: true,
    selezionata: true,
    titolo: 'Nuova frase',
    testo: '',
    didascalia: '',
    note: '',
    fotoIds: [],
    lavorazioni: [],
    nonAggravio: false,
  };
}

export function nuovaSezionePersonalizzata(codice: string, titolo = 'Nuova sezione'): SezioneIstanza {
  return { key: nuovoId('s-'), attivita: codice, sezioneId: null, titolo };
}

export function nuovaRigaExtra(zona: string, l: Lavorazione): RigaExtra {
  return { ...riga(l), zona };
}

export function nuovoSopralluogo(): Sopralluogo {
  const ora = Date.now();
  return {
    versione: 2,
    id: nuovoId(),
    creato: ora,
    modificato: ora,
    attivita: [],
    condominio: {
      nome: '',
      committente: '',
      indirizzo: '',
      cap: '',
      comune: '',
      codiceFiscale: '',
      dataSopralluogo: oggiISO(),
      dataRelazione: oggiISO(),
      pressoAmministrazione: '',
      indirizzoAmministrazione: '',
      telefono: '',
      commessa: '',
    },
    fotoCopertinaId: null,
    sezioni: [],
    voci: [],
    righeExtra: [],
    cartelli: [],
    notaBene: '',
    esitoConforme: false,
    nonAggravio: null,
    conclusioni: null,
  };
}

/** Porta un sopralluogo della prima versione dell'app al formato attuale (tiene dati e attività). */
export function migraSopralluogo(x: unknown, catalogo: Catalogo): Sopralluogo {
  const s = x as Partial<Sopralluogo> & Record<string, unknown>;
  if (s.versione === 2) return s as Sopralluogo;
  const base = nuovoSopralluogo();
  const vecchio = (s.condominio ?? {}) as Record<string, string>;
  return {
    ...base,
    id: String(s.id ?? base.id),
    creato: Number(s.creato ?? base.creato),
    modificato: Number(s.modificato ?? base.modificato),
    condominio: { ...base.condominio, ...vecchio, dataRelazione: vecchio.dataSopralluogo || base.condominio.dataRelazione },
    attivita: arr(s.attivita).map((a) => {
      const y = a as Record<string, string>;
      return {
        ...nuovaAttivita(catalogo, y.codice, y.descrizione || undefined, !famigliaDi(catalogo, y.codice)),
        nProgetto: y.nProgetto ?? '',
        dataApprovazione: y.dataApprovazione ?? '',
        datoDimensionale: y.datoDimensionale ?? '',
      };
    }),
  };
}

// ======================= sincronizzazione =======================

/**
 * Per ogni attività selezionata crea (una sola volta) le sezioni della libreria con tutte le loro voci,
 * e la riga "Trasporto materiali…" del computo. Quello che esiste già non viene toccato.
 */
export function sincronizza(s: Sopralluogo, catalogo: Catalogo): Sopralluogo {
  const sezKeys = new Set(s.sezioni.map((x) => x.key));
  const vociKeys = new Set(s.voci.map((x) => x.key));
  const extraKeys = new Set(s.righeExtra.map((x) => x.key));
  const nuoveSez: SezioneIstanza[] = [];
  const nuoveExtra: RigaExtra[] = [];

  for (const a of s.attivita) {
    const f = famigliaDi(catalogo, a.codice);
    if (!f) continue;
    for (const sc of f.sezioni) {
      const key = `${sc.id}@${a.codice}`;
      if (!sezKeys.has(key)) {
        sezKeys.add(key);
        nuoveSez.push({ key, attivita: a.codice, sezioneId: sc.id, titolo: sc.titolo });
      }
    }
    const kt = `trasporto@${a.codice}`;
    if (!extraKeys.has(kt)) {
      extraKeys.add(kt);
      nuoveExtra.push({ ...nuovaRigaExtra(a.codice, { descrizione: TRASPORTO, um: 'a corpo' }), key: kt });
    }
  }

  // una sezione nuova della libreria va al suo posto (dopo quelle che la precedono in libreria)
  const sezioni = [...s.sezioni];
  for (const nuova of nuoveSez) {
    const ordine = famigliaDi(catalogo, nuova.attivita)?.sezioni.map((x) => x.id) ?? [];
    const pos = ordine.indexOf(nuova.sezioneId ?? '');
    let dopo = -1;
    sezioni.forEach((x, j) => {
      if (x.attivita === nuova.attivita && ordine.indexOf(x.sezioneId ?? '') < pos && ordine.indexOf(x.sezioneId ?? '') >= 0) dopo = j;
    });
    if (dopo < 0) {
      const ultimaStessaAttivita = sezioni.map((x) => x.attivita).lastIndexOf(nuova.attivita);
      dopo = pos === 0 ? sezioni.findIndex((x) => x.attivita === nuova.attivita) - 1 : ultimaStessaAttivita;
      if (dopo < -1) dopo = sezioni.length - 1;
    }
    sezioni.splice(dopo + 1, 0, nuova);
  }

  // Frasi spostate in un'altra sezione della libreria (es. locale macchine ascensore):
  // le istanze già esistenti seguono la frase nella nuova sezione, con quanto già compilato.
  let voci = s.voci;
  let spostate = false;
  const sezioneDiVoce = new Map<string, string>();
  for (const f of catalogo.famiglie) for (const sc of f.sezioni) for (const v of sc.voci) sezioneDiVoce.set(v.id, sc.id);
  for (const v of s.voci) {
    const sez = sezioni.find((x) => x.key === v.sezioneKey);
    const giusta = v.voceId ? sezioneDiVoce.get(v.voceId) : undefined;
    if (!sez?.sezioneId || !giusta || sez.sezioneId === giusta || sez.key.includes('#')) continue;
    const destinazione = `${giusta}@${v.attivita}`;
    if (!sezioni.some((x) => x.key === destinazione)) continue;
    const nuovaKey = `${v.voceId}@${destinazione}`;
    const doppione = voci.find((x) => x.key === nuovaKey);
    const intatta = (x: VoceIstanza) =>
      !x.selezionata && !x.fotoIds.length && !x.note.trim() && x.testo === catalogo.famiglie
        .flatMap((f) => f.sezioni.flatMap((sc) => sc.voci))
        .find((y) => y.id === x.voceId)?.testo;
    if (doppione && !intatta(doppione)) continue; // entrambe compilate: restano tutte e due
    voci = voci
      .filter((x) => x !== doppione)
      .map((x) => (x === v ? { ...x, key: nuovaKey, sezioneKey: destinazione } : x));
    vociKeys.delete(v.key);
    vociKeys.add(nuovaKey);
    spostate = true;
  }

  const nuoveVoci: VoceIstanza[] = [];
  for (const sez of sezioni) {
    if (!sez.sezioneId) continue;
    const sc = famigliaDi(catalogo, sez.attivita)?.sezioni.find((x) => x.id === sez.sezioneId);
    for (const v of sc?.voci ?? []) {
      const key = `${v.id}@${sez.key}`;
      if (vociKeys.has(key)) continue;
      vociKeys.add(key);
      nuoveVoci.push(istanziaVoce(v, sez));
    }
  }

  if (!nuoveSez.length && !nuoveVoci.length && !nuoveExtra.length && !spostate) return s;
  return {
    ...s,
    sezioni,
    voci: nuoveVoci.length ? [...voci, ...nuoveVoci] : voci,
    righeExtra: nuoveExtra.length ? [...s.righeExtra, ...nuoveExtra] : s.righeExtra,
  };
}

/** Scambia due elementi di un array (copia). */
function scambia<T>(a: T[], i: number, j: number): T[] {
  const b = [...a];
  [b[i], b[j]] = [b[j], b[i]];
  return b;
}

/** Sposta una sezione su (-1) o giù (+1) tra quelle della stessa attività: cambia anche l'ordine nel Word. */
export function spostaSezione(s: Sopralluogo, key: string, verso: -1 | 1): Sopralluogo {
  const sez = s.sezioni.find((x) => x.key === key);
  if (!sez) return s;
  const indici = s.sezioni.map((x, i) => (x.attivita === sez.attivita ? i : -1)).filter((i) => i >= 0);
  const pos = indici.indexOf(s.sezioni.indexOf(sez));
  const altro = indici[pos + verso];
  if (altro === undefined) return s;
  return { ...s, sezioni: scambia(s.sezioni, indici[pos], altro) };
}

/** Sposta una frase su (-1) o giù (+1) nella sua sezione: cambia l'ordine a) b) c) nel Word. */
export function spostaVoce(s: Sopralluogo, key: string, verso: -1 | 1): Sopralluogo {
  const v = s.voci.find((x) => x.key === key);
  if (!v) return s;
  const indici = s.voci.map((x, i) => (x.sezioneKey === v.sezioneKey ? i : -1)).filter((i) => i >= 0);
  const pos = indici.indexOf(s.voci.indexOf(v));
  const altro = indici[pos + verso];
  if (altro === undefined) return s;
  return { ...s, voci: scambia(s.voci, indici[pos], altro) };
}

/** Duplica una sezione (es. "Vano scala" → "Vano scala B") con tutte le voci di libreria, vuote. */
export function duplicaSezione(s: Sopralluogo, catalogo: Catalogo, sezKey: string, titolo: string): Sopralluogo {
  const orig = s.sezioni.find((x) => x.key === sezKey);
  if (!orig) return s;
  const nuova: SezioneIstanza = {
    key: orig.sezioneId ? `${orig.sezioneId}@${orig.attivita}#${nuovoId().slice(0, 8)}` : nuovoId('s-'),
    attivita: orig.attivita,
    sezioneId: orig.sezioneId,
    titolo,
  };
  const i = s.sezioni.indexOf(orig);
  // subito dopo l'ultima sezione con lo stesso id di libreria
  let dopo = i;
  s.sezioni.forEach((x, j) => {
    if (j > i && x.attivita === orig.attivita && x.sezioneId && x.sezioneId === orig.sezioneId) dopo = j;
  });
  const sezioni = [...s.sezioni.slice(0, dopo + 1), nuova, ...s.sezioni.slice(dopo + 1)];
  return sincronizza({ ...s, sezioni }, catalogo);
}

// ======================= lettura =======================

export function sezioniDiAttivita(s: Sopralluogo, codice: string): SezioneIstanza[] {
  return s.sezioni.filter((x) => x.attivita === codice);
}

export function vociDiSezione(s: Sopralluogo, sezKey: string): VoceIstanza[] {
  return s.voci.filter((v) => v.sezioneKey === sezKey);
}

export function vociAttive(s: Sopralluogo): VoceIstanza[] {
  const codici = new Set(s.attivita.map((a) => a.codice));
  return s.voci.filter((v) => codici.has(v.attivita));
}

export interface GruppoAttivita {
  attivita: AttivitaSelezionata;
  sezioni: { sezione: SezioneIstanza; voci: VoceIstanza[] }[];
}

/** Voci selezionate nell'ordine del documento (attività → sezioni → voci), sezioni vuote escluse. */
export function gruppiDocumento(s: Sopralluogo): GruppoAttivita[] {
  return s.attivita.map((a) => ({
    attivita: a,
    sezioni: sezioniDiAttivita(s, a.codice)
      .map((sezione) => ({ sezione, voci: vociDiSezione(s, sezione.key).filter((v) => v.selezionata) }))
      .filter((x) => x.voci.length > 0),
  }));
}

export function vociSelezionate(s: Sopralluogo): VoceIstanza[] {
  return gruppiDocumento(s).flatMap((g) => g.sezioni.flatMap((x) => x.voci));
}

/** Numerazione progressiva delle foto nel documento: voce → [prima, ultima]. */
export function numerazioneFoto(s: Sopralluogo): Map<string, number[]> {
  const out = new Map<string, number[]>();
  let n = 0;
  for (const v of vociSelezionate(s)) {
    if (!v.fotoIds.length) continue;
    out.set(
      v.key,
      v.fotoIds.map(() => ++n),
    );
  }
  return out;
}

export function nonAggravioEffettivo(s: Sopralluogo): boolean {
  return s.nonAggravio ?? vociSelezionate(s).some((v) => v.nonAggravio);
}

export function contaSegnaposto(testo: string): number {
  return (testo.match(/\[[^\]]*\]/g) || []).length;
}

// ======================= testi composti =======================

export function descrizioneScopo(a: AttivitaSelezionata): string {
  const dato = a.datoDimensionale.trim() || '[valore]';
  return a.descrizioneScopo.includes('{dato}') ? a.descrizioneScopo.replace('{dato}', dato) : a.descrizioneScopo;
}

/** "al progetto approvato il 08/06/2001 al N° 342224" oppure "al D.M. 16/05/1987 n° 246" */
export function riferimentoVerifica(a: AttivitaSelezionata): string {
  if (a.riferimento === 'regola') return `al ${a.regolaTecnica.trim() || '[regola tecnica]'}`;
  const data = dataItaliana(a.dataApprovazione) || '[data]';
  const n = a.nProgetto.trim();
  return `al progetto approvato il ${data}${n ? ` al N° ${n}` : ''}`;
}

export function righeTitolo(a: AttivitaSelezionata): string {
  if (a.riferimento === 'regola') return `AL ${(a.regolaTecnica.trim() || '[regola tecnica]').toUpperCase()} PER ATT. ${a.codice}`;
  const data = dataItaliana(a.dataApprovazione) || '[DATA]';
  const n = a.nProgetto.trim();
  return `AL PROGETTO APPROVATO IL ${data}${n ? ` AL N°${n}` : ''} PER ATT. ${a.codice}`;
}

export function testoConclusioniAutomatico(s: Sopralluogo, catalogo: Catalogo): string {
  const t = catalogo.testi;
  const parti = s.attivita.map((a) => {
    if (a.riferimento === 'regola') return `al ${a.regolaTecnica.trim() || '[regola tecnica]'} per l’attività ${a.codice}`;
    return `al progetto approvato il ${dataItaliana(a.dataApprovazione) || '[data]'} per l’attività ${a.codice}`;
  });
  const primo = `Lo stato attuale dei luoghi ${s.esitoConforme ? 'risulta' : 'non risulta'} dunque conforme ${
    parti.length ? parti.join(' e ') + ' ' : ''
  }ed ai requisiti essenziali di sicurezza antincendio previsti dalle regole tecniche.`;
  const scia = t.conclusioneScia + (nonAggravioEffettivo(s) ? t.conclusioneNonAggravio : '') + '.';
  return [primo, t.conclusioneCompletare, scia].join('\n');
}

export function testoConclusioni(s: Sopralluogo, catalogo: Catalogo): string {
  return s.conclusioni ?? testoConclusioniAutomatico(s, catalogo);
}

export function committente(s: Sopralluogo): string {
  const c = s.condominio;
  if (c.committente.trim()) return c.committente.trim();
  const luogo = [c.cap.trim(), c.comune.trim()].filter(Boolean).join(' ');
  const parti = [c.nome.trim(), c.indirizzo.trim(), luogo].filter(Boolean);
  return parti.length ? `Condominio ${parti.join(' – ')}` : '';
}

export function titoloBreve(s: Sopralluogo): string {
  const c = s.condominio;
  return [c.nome && `Condominio ${c.nome}`, c.indirizzo, c.comune].filter(Boolean).join(' – ') || c.committente || '';
}

export const tecnicoVuoto: Tecnico = {
  intestazione: '',
  firma: '',
  luogo: 'Milano',
  societa: '',
  iniziali: '',
  revisione: 'Rev.0',
};
