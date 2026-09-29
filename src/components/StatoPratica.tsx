import { NOME_STATO, STATI, TIPI, praticaDi } from '../lib/pratiche';
import type { Pratica, Sopralluogo, StatoPratica as Stato } from '../lib/types';
import { Campo } from './Campo';

interface Props {
  s: Sopralluogo;
  aggiorna: (f: (s: Sopralluogo) => Sopralluogo) => void;
  /** mostra anche i dati di presentazione (SCIA e rinnovo) */
  presentazione?: boolean;
}

/** Stato e riferimenti della pratica: referente, stato, numero VV.F., presentazione. */
export default function StatoPratica({ s, aggiorna, presentazione }: Props) {
  const p = praticaDi(s);
  const imposta = (c: Partial<Pratica>) => aggiorna((x) => ({ ...x, pratica: { ...praticaDi(x), ...c } }));
  const cambiaStato = (stato: Stato) =>
    aggiorna((x) => {
      const corrente = praticaDi(x);
      const oggi = new Date().toISOString().slice(0, 10);
      return {
        ...x,
        pratica: {
          ...corrente,
          stato,
          dataStato: oggi,
          ...(stato === 'presentata' && !corrente.dataPresentazione ? { dataPresentazione: oggi } : {}),
        },
      };
    });

  return (
    <div className="card">
      <div className="griglia-2">
        <label className="campo">
          <span className="campo-etichetta">Stato {TIPI[p.tipo]}</span>
          <select value={p.stato} onChange={(e) => cambiaStato(e.target.value as Stato)}>
            {STATI[p.tipo].map((st) => (
              <option key={st} value={st}>
                {NOME_STATO[p.tipo][st]}
              </option>
            ))}
          </select>
        </label>
        <Campo etichetta="Referente" valore={p.referente} onValore={(v) => imposta({ referente: v })} autoComplete="off" />
      </div>
      {presentazione && (
        <>
          <div className="griglia-2">
            <Campo etichetta="N. pratica VV.F. (NOP)" valore={p.nPraticaVvf} onValore={(v) => imposta({ nPraticaVvf: v })} inputMode="numeric" autoComplete="off" />
            <Campo etichetta="Data presentazione" type="date" valore={p.dataPresentazione} onValore={(v) => imposta({ dataPresentazione: v })} />
          </div>
          <Campo etichetta="Protocollo PEC" valore={p.protocolloPec} onValore={(v) => imposta({ protocolloPec: v })} autoComplete="off" />
        </>
      )}
      {p.tipo === 'roa' && p.stato === 'eseguiti' && <p className="muto piccolo">Lavori eseguiti: dall’elenco puoi ora creare la SCIA.</p>}
    </div>
  );
}
