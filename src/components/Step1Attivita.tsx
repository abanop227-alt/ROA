import { useState } from 'react';
import { famigliaDi, nuovaAttivita } from '../lib/catalogo';
import type { AttivitaSelezionata, Catalogo, Sopralluogo } from '../lib/types';
import { AreaTesto, Campo } from './Campo';

interface Props {
  s: Sopralluogo;
  catalogo: Catalogo;
  aggiorna: (f: (s: Sopralluogo) => Sopralluogo) => void;
}

const PERSONALIZZATA = '__altra__';

function SchedaAttivita({
  a,
  catalogo,
  modifica,
}: {
  a: AttivitaSelezionata;
  catalogo: Catalogo;
  modifica: (campi: Partial<AttivitaSelezionata>) => void;
}) {
  const f = famigliaDi(catalogo, a.codice);
  const regole = f?.regoleTecniche ?? [];
  const scelta = regole.find((r) => r.etichetta === a.regolaTecnica && r.testo === a.regolaTecnicaTesto)?.etichetta ?? PERSONALIZZATA;
  return (
    <div className="card scheda-attivita">
      <div className="scheda-testa">
        <strong className="codice">{a.codice}</strong>
        {f ? <span className="badge">{f.nome}</span> : <span className="badge">senza frasi tipo</span>}
      </div>
      <label className="campo">
        <span className="campo-etichetta">Classificazione (D.P.R. 151/11)</span>
        <AreaTesto rows={2} valore={a.descrizione} onValore={(v) => modifica({ descrizione: v })} />
      </label>

      <div className="segmentato" role="radiogroup" aria-label="Verifica rispetto a">
        <button
          role="radio"
          aria-checked={a.riferimento === 'progetto'}
          className={a.riferimento === 'progetto' ? 'attivo' : ''}
          onClick={() => modifica({ riferimento: 'progetto' })}
        >
          Progetto approvato
        </button>
        <button
          role="radio"
          aria-checked={a.riferimento === 'regola'}
          className={a.riferimento === 'regola' ? 'attivo' : ''}
          onClick={() => modifica({ riferimento: 'regola' })}
        >
          Regola tecnica
        </button>
      </div>
      {a.riferimento === 'progetto' ? (
        <div className="griglia-2">
          <Campo etichetta="N. progetto approvato" valore={a.nProgetto} onValore={(v) => modifica({ nProgetto: v })} autoComplete="off" />
          <Campo etichetta="Data approvazione" type="date" valore={a.dataApprovazione} onValore={(v) => modifica({ dataApprovazione: v })} />
        </div>
      ) : (
        <p className="muto piccolo">Nel titolo e nello scopo: “conforme al {a.regolaTecnica || '…'}”.</p>
      )}

      <label className="campo">
        <span className="campo-etichetta">Regola tecnica di riferimento (dipende dal progetto)</span>
        <select
          value={scelta}
          onChange={(e) => {
            const r = regole.find((x) => x.etichetta === e.target.value);
            if (r) modifica({ regolaTecnica: r.etichetta, regolaTecnicaTesto: r.testo });
            else modifica({ regolaTecnicaTesto: a.regolaTecnicaTesto || a.regolaTecnica });
          }}
        >
          {regole.map((r) => (
            <option key={r.etichetta} value={r.etichetta}>
              {r.etichetta}
            </option>
          ))}
          <option value={PERSONALIZZATA}>Altra / modificata…</option>
        </select>
      </label>
      {scelta === PERSONALIZZATA && (
        <Campo
          etichetta="Regola tecnica (breve, per titolo e scopo)"
          valore={a.regolaTecnica}
          onValore={(v) => modifica({ regolaTecnica: v })}
          placeholder="es. D.M. 16/05/1987 n° 246"
        />
      )}
      <label className="campo">
        <span className="campo-etichetta">Frase in corsivo all’inizio del capitolo</span>
        <AreaTesto rows={2} valore={a.regolaTecnicaTesto} onValore={(v) => modifica({ regolaTecnicaTesto: v })} />
      </label>

      <Campo
        etichetta={`${f?.etichettaDato ?? 'Dato dimensionale'}${f?.unitaDato ? ` (${f.unitaDato})` : ''}`}
        valore={a.datoDimensionale}
        onValore={(v) => modifica({ datoDimensionale: v })}
        inputMode="decimal"
        placeholder={f?.unitaDato === 'kW' ? 'es. 127,90' : f?.unitaDato === 'mq' ? 'es. 1.345,00' : 'es. 25,20'}
        autoComplete="off"
      />
      <label className="campo">
        <span className="campo-etichetta">Descrizione nello scopo ({'{dato}'} = valore sopra)</span>
        <AreaTesto rows={2} valore={a.descrizioneScopo} onValore={(v) => modifica({ descrizioneScopo: v })} />
      </label>
      {(a.introduzione || f?.introduzione) && (
        <label className="campo">
          <span className="campo-etichetta">Descrizione iniziale (piano, superficie, box…)</span>
          <AreaTesto rows={3} valore={a.introduzione} onValore={(v) => modifica({ introduzione: v })} />
        </label>
      )}
    </div>
  );
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

  function alterna(cod: string) {
    const conDati = s.voci.some((v) => v.attivita === cod && (v.selezionata || v.fotoIds.length));
    if (selezionati.has(cod) && conDati && !confirm(`Togliere l’attività ${cod}? Le frasi spuntate restano salvate e ricompaiono se la riselezioni.`)) return;
    aggiorna((x) => {
      if (x.attivita.some((a) => a.codice === cod)) return { ...x, attivita: x.attivita.filter((a) => a.codice !== cod) };
      const attivita = [...x.attivita, nuovaAttivita(catalogo, cod)];
      attivita.sort((a, b) => ordine(a.codice) - ordine(b.codice));
      return { ...x, attivita };
    });
  }

  function modifica(cod: string, campi: Partial<AttivitaSelezionata>) {
    aggiorna((x) => ({ ...x, attivita: x.attivita.map((a) => (a.codice === cod ? { ...a, ...campi } : a)) }));
  }

  function aggiungiPersonalizzata() {
    const c = codice.trim().toUpperCase();
    if (!c) return setErrore('Indica il codice dell’attività.');
    if (selezionati.has(c)) return setErrore('Attività già presente.');
    aggiorna((x) => ({
      ...x,
      attivita: [...x.attivita, nuovaAttivita(catalogo, c, descrizione.trim() || undefined, !catalogo.attivita.some((a) => a.codice === c))],
    }));
    setCodice('');
    setDescrizione('');
    setErrore(null);
  }

  const personalizzate = s.attivita.filter((a) => !catalogo.attivita.some((c) => c.codice === a.codice));
  const famigliaNuova = codice.trim() && famigliaDi(catalogo, codice);

  return (
    <section>
      <h2 className="titolo-passo">Attività soggette (D.P.R. 151/2011)</h2>
      <p className="muto piccolo">Tocca tutte le attività presenti nel condominio: puoi sceglierne più d’una.</p>
      <div className="chips" role="group" aria-label="Attività">
        {catalogo.attivita.map((a) => (
          <button
            key={a.codice}
            className={`chip ${selezionati.has(a.codice) ? 'attivo' : ''}`}
            aria-pressed={selezionati.has(a.codice)}
            onClick={() => alterna(a.codice)}
          >
            {selezionati.has(a.codice) && '✓ '}
            {a.codice}
          </button>
        ))}
        {personalizzate.map((a) => (
          <button key={a.codice} className="chip attivo" aria-pressed onClick={() => alterna(a.codice)}>
            ✓ {a.codice}
          </button>
        ))}
      </div>

      {s.attivita.map((a) => (
        <SchedaAttivita key={a.codice} a={a} catalogo={catalogo} modifica={(c) => modifica(a.codice, c)} />
      ))}

      <details className="card aggiungi-attivita">
        <summary>+ Aggiungi un’altra attività</summary>
        <Campo etichetta="Codice" valore={codice} onValore={setCodice} placeholder="es. 75.3.C" autoComplete="off" />
        {famigliaNuova && <p className="ok piccolo">✓ Avrà le frasi tipo di “{famigliaNuova.nome}”.</p>}
        <Campo etichetta="Classificazione" valore={descrizione} onValore={setDescrizione} autoComplete="off" />
        {errore && <p className="errore">{errore}</p>}
        <button className="btn btn-primario btn-blocco" onClick={aggiungiPersonalizzata}>
          Aggiungi attività
        </button>
      </details>
    </section>
  );
}
