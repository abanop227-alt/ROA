import { giorniAllaScadenza, praticaDi, scadenzaRinnovo, scadenzeDistinte } from '../lib/pratiche';
import type { Sopralluogo } from '../lib/types';
import { dataItaliana } from '../lib/util';
import StatoPratica from './StatoPratica';

interface Props {
  s: Sopralluogo;
  aggiorna: (f: (s: Sopralluogo) => Sopralluogo) => void;
}

function frase(giorni: number): string {
  if (giorni < 0) return `scaduto da ${-giorni} giorni`;
  if (giorni === 0) return 'scade oggi';
  return giorni < 90 ? `tra ${giorni} giorni` : `tra circa ${Math.round(giorni / 30)} mesi`;
}

/** Passo "Pratica" di SCIA e rinnovo: stato, riferimenti e, per il rinnovo, la scadenza. */
export default function StepPratica({ s, aggiorna }: Props) {
  const p = praticaDi(s);
  const codici = s.attivita.map((a) => a.codice);
  const rinnovo = p.tipo === 'rinnovo';
  const distinte = rinnovo && p.indipendenti ? scadenzeDistinte(codici, p.dataPresentazione) : [];
  const unica = rinnovo && !p.indipendenti ? scadenzaRinnovo(codici, p.dataPresentazione) : null;

  return (
    <section>
      <h2 className="titolo-passo">{rinnovo ? 'Rinnovo periodico' : 'SCIA'}</h2>
      <StatoPratica s={s} aggiorna={aggiorna} presentazione />

      {rinnovo && (
        <>
          <h3 className="titolo-sezione">Scadenza del prossimo rinnovo</h3>
          <div className="card">
            {codici.length > 1 && (
              <label className="riga-check">
                <input
                  type="checkbox"
                  checked={!!p.indipendenti}
                  onChange={(e) => aggiorna((x) => ({ ...x, pratica: { ...praticaDi(x), indipendenti: e.target.checked } }))}
                />
                <span>Le attività sono completamente indipendenti (scadenze distinte)</span>
              </label>
            )}
            {!p.dataPresentazione && <p className="muto">Indica la data di presentazione per calcolare la scadenza.</p>}
            {unica && (
              <p>
                <strong>{dataItaliana(unica)}</strong> <span className="muto">({frase(giorniAllaScadenza(unica))})</span>
              </p>
            )}
            {distinte.map((d) => (
              <p key={d.codice}>
                {d.codice}: <strong>{dataItaliana(d.scadenza)}</strong> <span className="muto">({frase(giorniAllaScadenza(d.scadenza))})</span>
              </p>
            ))}
            <p className="muto piccolo">
              Rinnovo ogni 5 anni; 10 anni per le attività 6, 7, 8, 64, 71, 72 e 77 (art. 5 D.P.R. 151/2011). Se le attività non sono
              indipendenti vale il termine minore; il nuovo termine decorre dalla data di presentazione, anche se anticipata.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
