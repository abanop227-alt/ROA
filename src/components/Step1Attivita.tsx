import { useState } from 'react';
import { nuovaAttivita } from '../lib/catalogo';
import type { AttivitaSelezionata, Catalogo, Sopralluogo } from '../lib/types';
import { Campo } from './Campo';

interface Props {
  s: Sopralluogo;
  catalogo: Catalogo;
  aggiorna: (f: (s: Sopralluogo) => Sopralluogo) => void;
}

export default function Step1Attivita({ s, catalogo, aggiorna }: Props) {
  const [codice, setCodice] = useState('');
  const [descrizione, setDescrizione] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const selezionati = new Set(s.attivita.map((a) => a.codice));
  const ordine = (c: string) => {
    const i = catalogo.attivita.findIndex((a) => a.codice === c);
    return i < 0 ? 1000 : i;
  };

  function alterna(codiceAtt: string, descr: string) {
    aggiorna((x) => {
      if (x.attivita.some((a) => a.codice === codiceAtt)) {
        return { ...x, attivita: x.attivita.filter((a) => a.codice !== codiceAtt) };
      }
      const attivita = [...x.attivita, nuovaAttivita(codiceAtt, descr)];
      // ordine della libreria; le personalizzate in coda nell'ordine di inserimento
      attivita.sort((a, b) => ordine(a.codice) - ordine(b.codice));
      return { ...x, attivita };
    });
  }

  function modifica(codiceAtt: string, campo: keyof AttivitaSelezionata, valore: string) {
    aggiorna((x) => ({
      ...x,
      attivita: x.attivita.map((a) => (a.codice === codiceAtt ? { ...a, [campo]: valore } : a)),
    }));
  }

  function aggiungiPersonalizzata() {
    const c = codice.trim();
    if (!c) return setErrore('Indica il codice dell\'attività.');
    if (selezionati.has(c)) return setErrore('Attività già presente.');
    const daCatalogo = catalogo.attivita.find((a) => a.codice === c);
    aggiorna((x) => ({
      ...x,
      attivita: [...x.attivita, nuovaAttivita(c, descrizione.trim() || daCatalogo?.descrizione || '', !daCatalogo)],
    }));
    setCodice('');
    setDescrizione('');
    setErrore(null);
  }

  const personalizzate = s.attivita.filter((a) => !catalogo.attivita.some((c) => c.codice === a.codice));

  return (
    <section>
      <h2 className="titolo-passo">Attività soggette (D.P.R. 151/2011)</h2>
      <p className="muto piccolo">Tocca i codici presenti nel condominio.</p>
      <div className="chips" role="group" aria-label="Attività">
        {catalogo.attivita.map((a) => (
          <button
            key={a.codice}
            className={`chip ${selezionati.has(a.codice) ? 'attivo' : ''}`}
            aria-pressed={selezionati.has(a.codice)}
            onClick={() => alterna(a.codice, a.descrizione)}
          >
            {selezionati.has(a.codice) && '✓ '}
            {a.codice}
          </button>
        ))}
        {personalizzate.map((a) => (
          <button key={a.codice} className="chip attivo" aria-pressed onClick={() => alterna(a.codice, a.descrizione)}>
            ✓ {a.codice}
          </button>
        ))}
      </div>

      {s.attivita.map((a) => (
        <div key={a.codice} className="card scheda-attivita">
          <div className="scheda-testa">
            <strong className="codice">{a.codice}</strong>
            {a.personalizzata && <span className="badge">personalizzata</span>}
          </div>
          {a.personalizzata ? (
            <Campo etichetta="Descrizione" valore={a.descrizione} onValore={(v) => modifica(a.codice, 'descrizione', v)} />
          ) : (
            <p className="piccolo descrizione-attivita">{a.descrizione}</p>
          )}
          <div className="griglia-2">
            <Campo
              etichetta="N. progetto approvato"
              valore={a.nProgetto}
              onValore={(v) => modifica(a.codice, 'nProgetto', v)}
              autoComplete="off"
            />
            <Campo
              etichetta="Data approvazione"
              type="date"
              valore={a.dataApprovazione}
              onValore={(v) => modifica(a.codice, 'dataApprovazione', v)}
            />
          </div>
          <Campo
            etichetta="Dato dimensionale"
            valore={a.datoDimensionale}
            onValore={(v) => modifica(a.codice, 'datoDimensionale', v)}
            placeholder="Superficie o potenzialità, es. 800 mq / 250 kW"
            autoComplete="off"
          />
        </div>
      ))}

      <details className="card aggiungi-attivita">
        <summary>+ Aggiungi attività personalizzata</summary>
        <Campo etichetta="Codice" valore={codice} onValore={setCodice} placeholder="es. 49.1.A" autoComplete="off" />
        <Campo etichetta="Descrizione" valore={descrizione} onValore={setDescrizione} autoComplete="off" />
        {errore && <p className="errore">{errore}</p>}
        <button className="btn btn-primario btn-blocco" onClick={aggiungiPersonalizzata}>
          Aggiungi attività
        </button>
      </details>
    </section>
  );
}
