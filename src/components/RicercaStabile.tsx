import { useEffect, useState } from 'react';
import { elencaStabili } from '../lib/db';
import { cercaStabili, indirizzoStabile, type Stabile } from '../lib/stabili';

interface Props {
  onScegli: (s: Stabile) => void;
}

/** Cerca tra gli stabili importati dagli Excel e precompila i dati del condominio. */
export default function RicercaStabile({ onScegli }: Props) {
  const [elenco, setElenco] = useState<Stabile[] | null>(null);
  const [testo, setTesto] = useState('');
  useEffect(() => {
    elencaStabili().then(setElenco).catch(() => setElenco([]));
  }, []);
  if (!elenco?.length) {
    return elenco ? <p className="muto piccolo">Nessun elenco stabili importato: puoi farlo dalla schermata iniziale (sezione “Stabili”).</p> : null;
  }
  const risultati = cercaStabili(elenco, testo);
  return (
    <div className="card ricerca-stabile">
      <label className="campo">
        <span className="campo-etichetta">Cerca tra i tuoi stabili ({elenco.length})</span>
        <input type="search" value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="es. Aosta 21, Pasquali, Settimo…" autoComplete="off" />
      </label>
      {testo.trim() && !risultati.length && <p className="muto piccolo">Nessuno stabile trovato.</p>}
      <ul className="risultati">
        {risultati.map((s) => (
          <li key={s.id}>
            <button
              className="btn"
              onClick={() => {
                onScegli(s);
                setTesto('');
              }}
            >
              <strong>{s.nome}</strong>
              <span className="muto piccolo">
                {indirizzoStabile(s)}, {s.comune}
                {s.amministrazione && ` · ${s.amministrazione}`}
                {s.attivita.length > 0 && ` · ${s.attivita.join(', ')}`}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
