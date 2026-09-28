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
