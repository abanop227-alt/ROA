// ---- Libreria (roa-dati.json) ----
export interface AttivitaCatalogo {
  codice: string;
  descrizione: string;
}

export interface VoceCatalogo {
  id: string;
  titolo: string;
  attivita: string[];
  rifNormativo: string;
  testo: string;
  certificazioni: string[];
  umDefault: string;
}

export interface Catalogo {
  attivita: AttivitaCatalogo[];
  voci: VoceCatalogo[];
  umOptions: string[];
  conclusioniDefault: string;
}

// ---- Sopralluogo ----
export interface AttivitaSelezionata {
  codice: string;
  descrizione: string;
  personalizzata: boolean;
  nProgetto: string;
  dataApprovazione: string; // yyyy-mm-dd
  datoDimensionale: string;
}

export interface DatiCondominio {
  committente: string;
  indirizzo: string;
  comune: string;
  codiceFiscale: string;
  dataSopralluogo: string; // yyyy-mm-dd
  pressoAmministrazione: string;
  indirizzoAmministrazione: string;
  telefono: string;
  commessa: string;
}

export interface Certificazione {
  testo: string;
  richiesta: boolean;
}

export interface RigaComputo {
  /** vuota = usa la descrizione automatica */
  descrizione: string;
  um: string;
  quantita: string; // testo così com'è digitato (es. "1,5")
  prezzo: string;
}

export interface VoceIstanza {
  /** `${idVoce}@${codiceAttivita}` per le voci di libreria, `pers-…` per quelle personalizzate */
  key: string;
  voceId: string | null;
  /** codice attività, null = prescrizioni generali */
  attivita: string | null;
  personalizzata: boolean;
  selezionata: boolean;
  titolo: string;
  rifNormativo: string;
  testo: string;
  note: string;
  certificazioni: Certificazione[];
  fotoIds: string[];
  computo: RigaComputo;
}

export interface Sopralluogo {
  id: string;
  creato: number;
  modificato: number;
  attivita: AttivitaSelezionata[];
  condominio: DatiCondominio;
  voci: VoceIstanza[];
  conclusioni: string;
}

export interface FotoRecord {
  id: string;
  sopralluogoId: string;
  blob: Blob;
  type: string; // image/jpeg | image/png
  width: number;
  height: number;
  creato: number;
}
