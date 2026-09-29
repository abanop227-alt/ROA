// ======================= Libreria (roa-dati.json) =======================

export interface Lavorazione {
  descrizione: string;
  um: string;
  /** false = proposta ma non spuntata (es. lavorazione alternativa) */
  inclusa?: boolean;
}

export interface VoceCatalogo {
  id: string;
  /** etichetta breve mostrata nell'app */
  titolo: string;
  /** testo che va nella relazione, con parti tra [parentesi] da completare */
  testo: string;
  /** didascalia proposta per le foto */
  didascalia: string;
  lavorazioni: Lavorazione[];
  /** la voce comporta la dichiarazione di non aggravio in conclusione */
  nonAggravio?: boolean;
}

export interface SezioneCatalogo {
  id: string;
  titolo: string;
  voci: VoceCatalogo[];
}

export interface CertificazioneCatalogo {
  testo: string;
  sotto?: string[];
  /** false = proposta ma non spuntata */
  predefinita?: boolean;
}

export interface RegolaTecnica {
  /** es. "D.M. 16/05/1987 n° 246": usata nel titolo e nello scopo */
  etichetta: string;
  /** frase in corsivo all'inizio del capitolo dell'attività */
  testo: string;
}

/** Gruppo di attività con lo stesso numero (74, 75, 77…) */
export interface FamigliaCatalogo {
  id: string;
  nome: string;
  /** intestazione del computo, {codice} = codice attività */
  zonaComputo: string;
  unitaDato: string;
  etichettaDato: string;
  /** descrizione per lo scopo, {dato} = dato dimensionale */
  modelloScopo: string;
  introduzione?: string;
  regoleTecniche: RegolaTecnica[];
  sezioni: SezioneCatalogo[];
  certificazioni: CertificazioneCatalogo[];
}

export interface AttivitaCatalogo {
  codice: string;
  descrizione: string;
}

export interface TestiFissi {
  esposizione: string;
  notaCertificazioni: string;
  noteCertificazioni: string[];
  conclusioneCompletare: string;
  conclusioneScia: string;
  conclusioneNonAggravio: string;
  sanzioni: string;
  chiusura: string;
}

export interface Catalogo {
  versione: 2;
  attivita: AttivitaCatalogo[];
  famiglie: FamigliaCatalogo[];
  umOptions: string[];
  lavorazioniComuni: Lavorazione[];
  cartelliSuggeriti: string[];
  notaBeneSuggerimenti: string[];
  testi: TestiFissi;
}

// ======================= Sopralluogo =======================

export interface CertificazioneIstanza {
  testo: string;
  sotto: string[];
  richiesta: boolean;
}

export interface AttivitaSelezionata {
  codice: string;
  /** classificazione (Allegato I) */
  descrizione: string;
  personalizzata: boolean;
  /** verifica rispetto al progetto approvato o direttamente alla regola tecnica */
  riferimento: 'progetto' | 'regola';
  nProgetto: string;
  dataApprovazione: string; // yyyy-mm-dd
  regolaTecnica: string;
  regolaTecnicaTesto: string;
  datoDimensionale: string;
  /** descrizione per lo scopo, {dato} = dato dimensionale */
  descrizioneScopo: string;
  introduzione: string;
  certificazioni: CertificazioneIstanza[];
}

export interface DatiCondominio {
  nome: string;
  committente: string;
  indirizzo: string;
  cap: string;
  comune: string;
  codiceFiscale: string;
  dataSopralluogo: string;
  dataRelazione: string;
  pressoAmministrazione: string;
  indirizzoAmministrazione: string;
  telefono: string;
  commessa: string;
}

export interface RigaComputo {
  key: string;
  descrizione: string;
  um: string;
  quantita: string; // testo digitato (es. "1,5")
  prezzo: string;
  inclusa: boolean;
}

export interface RigaExtra extends RigaComputo {
  /** codice attività in cui compare la riga */
  zona: string;
}

export interface SezioneIstanza {
  key: string;
  attivita: string;
  /** id della sezione di libreria, null = sezione personalizzata */
  sezioneId: string | null;
  titolo: string;
}

export interface VoceIstanza {
  key: string;
  sezioneKey: string;
  attivita: string;
  voceId: string | null;
  personalizzata: boolean;
  selezionata: boolean;
  titolo: string;
  testo: string;
  didascalia: string;
  /** appunti del sopralluogo: non vanno nel Word */
  note: string;
  fotoIds: string[];
  lavorazioni: RigaComputo[];
  nonAggravio: boolean;
}

export interface Cartello {
  key: string;
  quantita: string;
  descrizione: string;
}

/** Una misura della prova idranti: pressioni in bar; la portata si calcola o si scrive se già misurata. */
export interface MisuraIdranti {
  pStatica: string;
  pEfflusso: string;
  /** portata già misurata dallo strumento (l/min): se c'è, non si calcola */
  portataMisurata: string;
}

/** Prova di pressione e portata della rete idranti: produce un secondo Word, separato dalla ROA. */
export interface ProvaIdranti {
  attiva: boolean;
  /** codice dell'attività a cui si riferisce (es. 75.2.B) */
  attivita: string;
  dataProva: string; // yyyy-mm-dd
  /** es. "Verifica del § 6.1.4 del D.M. 01/02/1986 per ATT. 75.2.B." */
  riferimento: string;
  /** titolo della zona nel documento (AUTORIMESSA, EDIFICIO…) */
  zona: string;
  /** descrizione dell'impianto (piani, idranti, attacco autopompa) */
  descrizioneImpianto: string;
  /** es. "al momento del collaudo del gruppo di pompaggio" */
  circostanza: string;
  /** se la prova l'ha fatta un'altra ditta: nome e riferimento del rapporto */
  eseguitaDa: string;
  idrantiTotali: string;
  idrantiAperti: string;
  strumento: string;
  /** coefficiente K dello strumento (tabella dello strumento in uso) */
  coefficienteK: string;
  /** portata minima richiesta all'idrante più sfavorito, l/min */
  portataMinima: string;
  misure: MisuraIdranti[];
  note: string;
  fotoAttaccoIds: string[];
  fotoProvaIds: string[];
  /** pagine/foto del rapporto della ditta, in allegato al documento */
  fotoRapportoIds: string[];
}

// ======================= Pratica =======================

export type TipoPratica = 'roa' | 'scia' | 'rinnovo';
/**
 * ROA: bozza → emessa → lavori → eseguiti (la SCIA si compila solo a lavori eseguiti).
 * SCIA e rinnovo: bozza → presentata.
 */
export type StatoPratica = 'bozza' | 'emessa' | 'lavori' | 'eseguiti' | 'presentata';

export interface Pratica {
  tipo: TipoPratica;
  stato: StatoPratica;
  /** chi segue la pratica (Aba, Federico, Zahra…) */
  referente: string;
  /** ROA da cui nasce una SCIA (o pratica precedente di un rinnovo) */
  origineId: string | null;
  /** yyyy-mm-dd dell'ultimo cambio di stato */
  dataStato: string;
  /** SCIA e rinnovo: data di presentazione e protocollo PEC */
  dataPresentazione: string;
  protocolloPec: string;
  /** numero pratica VV.F. (NOP) */
  nPraticaVvf: string;
  /** rinnovo: le attività hanno rinnovi completamente indipendenti (scadenze distinte) */
  indipendenti?: boolean;
}

export interface Sopralluogo {
  versione: 2;
  id: string;
  creato: number;
  modificato: number;
  attivita: AttivitaSelezionata[];
  condominio: DatiCondominio;
  fotoCopertinaId: string | null;
  sezioni: SezioneIstanza[];
  voci: VoceIstanza[];
  righeExtra: RigaExtra[];
  cartelli: Cartello[];
  notaBene: string;
  esitoConforme: boolean;
  /** null = automatico (dalle voci spuntate) */
  nonAggravio: boolean | null;
  /** null = testo generato automaticamente */
  conclusioni: string | null;
  /** prova di pressione e portata degli idranti (facoltativa) */
  provaIdranti?: ProvaIdranti | null;
  /** tipo e stato della pratica; assente = ROA in bozza (sopralluoghi delle versioni precedenti) */
  pratica?: Pratica;
  /** elenco di controllo dei documenti della pratica (SCIA e rinnovo): chiave → presente */
  documenti?: Record<string, boolean>;
}

export interface FotoRecord {
  id: string;
  sopralluogoId: string;
  blob: Blob;
  type: string;
  width: number;
  height: number;
  creato: number;
}

export interface Tecnico {
  /** righe dell'intestazione nella parte generale */
  intestazione: string;
  firma: string;
  luogo: string;
  societa: string;
  iniziali: string;
  revisione: string;
}
