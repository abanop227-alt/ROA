import { professionistaVuoto } from '../lib/moduliVvf';
import type { ProfessionistaVvf, Tecnico } from '../lib/types';
import { Campo } from './Campo';

interface Props {
  tecnico: Tecnico;
  onCambia: (v: ProfessionistaVvf) => void;
}

/** Dati del professionista per i moduli VV.F. (MOD. PIN): restano solo su questo dispositivo. */
export default function ProfessionistaVvfForm({ tecnico, onCambia }: Props) {
  const p = tecnico.vvf ?? professionistaVuoto();
  const set = (c: Partial<ProfessionistaVvf>) => onCambia({ ...p, ...c });
  const uff = (c: Partial<ProfessionistaVvf['ufficio']>) => set({ ufficio: { ...p.ufficio, ...c } });
  const del = (c: Partial<ProfessionistaVvf['delegato']>) => set({ delegato: { ...p.delegato, ...c } });
  return (
    <details className="sotto-impostazioni">
      <summary>Dati per i moduli VV.F. (MOD. PIN)</summary>
      <p className="muto piccolo">
        Servono a compilare i moduli dei Vigili del Fuoco (asseverazioni, recapiti, delegato al ritiro). Non vengono mai inviati a nessuno.
      </p>
      <div className="griglia-2">
        <Campo etichetta="Titolo professionale" valore={p.titolo} onValore={(v) => set({ titolo: v })} placeholder="GEOM." />
        <Campo etichetta="Cognome" valore={p.cognome} onValore={(v) => set({ cognome: v })} />
        <Campo etichetta="Nome" valore={p.nome} onValore={(v) => set({ nome: v })} />
        <Campo etichetta="Ordine / collegio" valore={p.collegio} onValore={(v) => set({ collegio: v })} placeholder="COLLEGIO GEOM." />
        <Campo etichetta="Provincia dell’albo" valore={p.alboProvincia} onValore={(v) => set({ alboProvincia: v })} />
        <Campo etichetta="N. iscrizione albo" valore={p.alboNumero} onValore={(v) => set({ alboNumero: v })} />
        <Campo etichetta="Codice iscrizione M.I." valore={p.codiceMI} onValore={(v) => set({ codiceMI: v })} />
      </div>
      <h4 className="titolo-sezione">Ufficio (e indirizzo per la corrispondenza)</h4>
      <div className="griglia-2">
        <Campo etichetta="Via / piazza" valore={p.ufficio.indirizzo} onValore={(v) => uff({ indirizzo: v })} />
        <Campo etichetta="N. civico" valore={p.ufficio.civico} onValore={(v) => uff({ civico: v })} />
        <Campo etichetta="CAP" valore={p.ufficio.cap} onValore={(v) => uff({ cap: v })} inputMode="numeric" />
        <Campo etichetta="Comune" valore={p.ufficio.comune} onValore={(v) => uff({ comune: v })} />
        <Campo etichetta="Provincia" valore={p.ufficio.provincia} onValore={(v) => uff({ provincia: v })} placeholder="MI" />
        <Campo etichetta="Telefono" valore={p.ufficio.telefono} onValore={(v) => uff({ telefono: v })} inputMode="tel" />
        <Campo etichetta="Email" valore={p.email} onValore={(v) => set({ email: v })} type="email" />
        <Campo etichetta="PEC" valore={p.pec} onValore={(v) => set({ pec: v })} type="email" />
      </div>
      <h4 className="titolo-sezione">Delegato al ritiro (facoltativo)</h4>
      <div className="griglia-2">
        <Campo etichetta="Titolo" valore={p.delegato.titolo} onValore={(v) => del({ titolo: v })} />
        <Campo etichetta="Cognome" valore={p.delegato.cognome} onValore={(v) => del({ cognome: v })} />
        <Campo etichetta="Nome" valore={p.delegato.nome} onValore={(v) => del({ nome: v })} />
        <Campo etichetta="Via / piazza" valore={p.delegato.indirizzo} onValore={(v) => del({ indirizzo: v })} />
        <Campo etichetta="N. civico" valore={p.delegato.civico} onValore={(v) => del({ civico: v })} />
        <Campo etichetta="CAP" valore={p.delegato.cap} onValore={(v) => del({ cap: v })} inputMode="numeric" />
        <Campo etichetta="Comune" valore={p.delegato.comune} onValore={(v) => del({ comune: v })} />
        <Campo etichetta="Provincia" valore={p.delegato.provincia} onValore={(v) => del({ provincia: v })} />
        <Campo etichetta="Telefono" valore={p.delegato.telefono} onValore={(v) => del({ telefono: v })} inputMode="tel" />
      </div>
    </details>
  );
}
