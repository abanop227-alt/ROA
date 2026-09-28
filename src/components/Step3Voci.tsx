import { useState } from 'react';
import { nuovaVocePersonalizzata, vociDiAttivita } from '../lib/catalogo';
import type { Catalogo, Sopralluogo, VoceIstanza } from '../lib/types';
import VoceCard from './VoceCard';

export const GENERALI = '__generali__';

export function TabsAttivita({ s, tab, onTab }: { s: Sopralluogo; tab: string; onTab: (t: string) => void }) {
  const conta = (codice: string | null) => vociDiAttivita(s, codice).filter((v) => v.selezionata).length;
  const generali = conta(null);
  return (
    <div className="tabs" role="tablist" aria-label="Attività">
      {s.attivita.map((a) => (
        <button
          key={a.codice}
          role="tab"
          aria-selected={tab === a.codice}
          className={`tab ${tab === a.codice ? 'attivo' : ''}`}
          onClick={() => onTab(a.codice)}
        >
          {a.codice} · {conta(a.codice)}
        </button>
      ))}
      <button
        role="tab"
        aria-selected={tab === GENERALI}
        className={`tab ${tab === GENERALI ? 'attivo' : ''}`}
        onClick={() => onTab(GENERALI)}
      >
        Generali · {generali}
      </button>
    </div>
  );
}

interface Props {
  s: Sopralluogo;
  catalogo: Catalogo;
  tab: string;
  aggiorna: (f: (s: Sopralluogo) => Sopralluogo) => void;
  onVaiAttivita: () => void;
}

export default function Step3Voci({ s, catalogo, tab, aggiorna, onVaiAttivita }: Props) {
  const [aperta, setAperta] = useState<string | null>(null);

  if (!s.attivita.length) {
    return (
      <section className="vuoto">
        <p>Non hai ancora selezionato nessuna attività.</p>
        <p className="muto piccolo">Le voci della libreria compaiono in base alle attività scelte al passo 1.</p>
        <button className="btn btn-primario btn-grande btn-blocco" onClick={onVaiAttivita}>
          ‹ Scegli le attività
        </button>
      </section>
    );
  }

  const codice = tab === GENERALI ? null : tab;
  const voci = vociDiAttivita(s, codice);
  const attivita = s.attivita.find((a) => a.codice === codice);

  function modificaVoce(key: string, f: (v: VoceIstanza) => VoceIstanza) {
    aggiorna((x) => ({ ...x, voci: x.voci.map((v) => (v.key === key ? f(v) : v)) }));
  }

  function eliminaVoce(key: string) {
    aggiorna((x) => ({ ...x, voci: x.voci.filter((v) => v.key !== key) }));
  }

  function aggiungi() {
    const v = nuovaVocePersonalizzata(codice, catalogo.umOptions[0]);
    aggiorna((x) => ({ ...x, voci: [...x.voci, v] }));
    setAperta(v.key);
  }

  return (
    <section>
      <h2 className="titolo-passo">{codice ? `Voci ${codice}` : 'Prescrizioni generali'}</h2>
      <p className="muto piccolo">
        {attivita?.descrizione || (codice ? '' : 'Voci personalizzate non legate a una specifica attività.')}
      </p>
      {voci.length === 0 && <p className="muto">Nessuna voce in questa sezione.</p>}
      <ul className="lista-voci">
        {voci.map((v) => (
          <VoceCard
            key={v.key}
            voce={v}
            sopralluogoId={s.id}
            catalogo={catalogo}
            aperta={aperta === v.key}
            onApri={() => setAperta(aperta === v.key ? null : v.key)}
            onModifica={(f) => modificaVoce(v.key, f)}
            onElimina={() => eliminaVoce(v.key)}
          />
        ))}
      </ul>
      <button className="btn btn-grande btn-blocco btn-tratteggiato" onClick={aggiungi}>
        + Aggiungi voce personalizzata
      </button>
    </section>
  );
}
