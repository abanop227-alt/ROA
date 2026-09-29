import { documentiPratica, praticaDi } from '../lib/pratiche';
import type { Sopralluogo } from '../lib/types';

interface Props {
  s: Sopralluogo;
  aggiorna: (f: (s: Sopralluogo) => Sopralluogo) => void;
}

/** Elenco di controllo dei documenti della pratica: quelli dello studio e le certificazioni che arrivano da fuori. */
export default function StepModuli({ s, aggiorna }: Props) {
  const p = praticaDi(s);
  const documenti = documentiPratica(s);
  const fatti = s.documenti ?? {};
  const mancanti = documenti.filter((d) => !fatti[d.chiave]).length;
  const imposta = (chiave: string, v: boolean) => aggiorna((x) => ({ ...x, documenti: { ...(x.documenti ?? {}), [chiave]: v } }));
  const gruppo = (origine: 'studio' | 'esterno', titolo: string) => {
    const righe = documenti.filter((d) => d.origine === origine);
    if (!righe.length) return null;
    return (
      <>
        <h3 className="titolo-sezione">{titolo}</h3>
        <div className="card">
          {righe.map((d) => (
            <label key={d.chiave} className="riga-check">
              <input type="checkbox" checked={!!fatti[d.chiave]} onChange={(e) => imposta(d.chiave, e.target.checked)} />
              <span>{d.testo}</span>
            </label>
          ))}
        </div>
      </>
    );
  };

  return (
    <section>
      <h2 className="titolo-passo">Documenti {p.tipo === 'scia' ? 'della SCIA' : 'del rinnovo'}</h2>
      <p className="muto piccolo">
        {mancanti === 0
          ? '✓ Tutti i documenti sono pronti: puoi presentare la pratica e passarla a “presentata”.'
          : `Mancano ${mancanti} documenti su ${documenti.length}.`}
      </p>
      {gruppo('studio', 'Preparati dallo studio')}
      {gruppo('esterno', 'Da ricevere (certificazioni, bollettino, documenti)')}
    </section>
  );
}
