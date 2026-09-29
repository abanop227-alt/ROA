import { useEffect, useState } from 'react';
import { programmaSync, statoSync, type StatoAutoSync } from '../lib/autosync';
import { leggiConfigSync, salvaConfigSync, verificaConfig, type ConfigSync } from '../lib/sync';
import { Campo } from './Campo';

const REPO_PREDEFINITO = 'abanop227-alt/ROA-dati';

function ora(t: number): string {
  return new Date(t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

/** Stato e configurazione della sincronizzazione tra dispositivi (repository GitHub privato). */
export default function Sincronizzazione() {
  const [config, setConfig] = useState<ConfigSync | null | undefined>(undefined);
  const [modulo, setModulo] = useState<ConfigSync>({ repo: REPO_PREDEFINITO, token: '', nome: '' });
  const [stato, setStato] = useState<StatoAutoSync>(statoSync());
  const [verifica, setVerifica] = useState<'' | 'in-corso' | string>('');
  const [aperta, setAperta] = useState(false);

  useEffect(() => {
    leggiConfigSync()
      .then((c) => {
        setConfig(c ?? null);
        if (c) setModulo(c);
        else setAperta(true);
      })
      .catch(() => setConfig(null));
    const agg = (e: Event) => setStato((e as CustomEvent<StatoAutoSync>).detail);
    window.addEventListener('roa-sync', agg);
    return () => window.removeEventListener('roa-sync', agg);
  }, []);

  async function collega() {
    setVerifica('in-corso');
    const c = { repo: modulo.repo.trim(), token: modulo.token.trim(), nome: modulo.nome.trim() };
    const errore = await verificaConfig(c);
    if (errore) {
      setVerifica(errore);
      return;
    }
    await salvaConfigSync(c);
    setConfig(c);
    setVerifica('');
    setAperta(false);
    programmaSync(0);
  }

  async function scollega() {
    if (!confirm('Scollegare questo dispositivo? I sopralluoghi restano qui ma non si sincronizzano più.')) return;
    await salvaConfigSync(null);
    setConfig(null);
    setAperta(true);
  }

  const riga =
    config === undefined
      ? '…'
      : !config
        ? 'Non attiva: i sopralluoghi restano solo su questo dispositivo.'
        : stato.stato === 'in-corso'
          ? 'Sincronizzazione in corso…'
          : stato.stato === 'ok'
            ? `✓ Sincronizzato alle ${ora(stato.quando)}` +
              (stato.esito.ricevuti || stato.esito.inviati
                ? ` (${stato.esito.ricevuti} ricevuti, ${stato.esito.inviati} inviati)`
                : '')
            : stato.stato === 'errore'
              ? `⚠ ${stato.messaggio}`
              : 'In attesa…';

  return (
    <details className="card impostazioni sincronizzazione" open={aperta} onToggle={(e) => setAperta(e.currentTarget.open)}>
      <summary>
        <span>Sincronizzazione tra dispositivi</span>
        {config ? (
          <span className={`badge ${stato.stato === 'errore' ? 'badge-avviso' : 'badge-ok'}`}>
            {stato.stato === 'in-corso' ? '⟳' : stato.stato === 'errore' ? '⚠' : '☁ attiva'}
          </span>
        ) : (
          config === null && <span className="badge badge-avviso">da configurare</span>
        )}
      </summary>
      <p className={`piccolo ${stato.stato === 'errore' ? 'errore' : 'muto'}`}>{riga}</p>
      {config && (
        <div className="riga-pulsanti">
          <button className="btn btn-primario" onClick={() => programmaSync(0)} disabled={stato.stato === 'in-corso'}>
            Sincronizza ora
          </button>
          <button className="btn" onClick={scollega}>
            Scollega
          </button>
        </div>
      )}
      {!config && config !== undefined && (
        <>
          <p className="muto piccolo">
            I sopralluoghi vengono salvati nel repository GitHub privato dello studio e compaiono su tutti i dispositivi
            collegati (telefono, PC dell’ufficio, colleghi). Serve una volta per dispositivo.
          </p>
          <Campo etichetta="Repository privato" valore={modulo.repo} onValore={(v) => setModulo({ ...modulo, repo: v })} autoComplete="off" />
          <Campo
            etichetta="Chiave di accesso (token GitHub)"
            type="password"
            valore={modulo.token}
            onValore={(v) => setModulo({ ...modulo, token: v })}
            placeholder="github_pat_…"
            autoComplete="off"
          />
          <Campo
            etichetta="Il tuo nome o sigla"
            valore={modulo.nome}
            onValore={(v) => setModulo({ ...modulo, nome: v })}
            placeholder="es. L.M. oppure F.D."
            aiuto="Compare nello storico dei salvataggi"
          />
          {verifica && verifica !== 'in-corso' && <p className="errore">{verifica}</p>}
          <button className="btn btn-primario btn-blocco" onClick={collega} disabled={!modulo.repo.trim() || !modulo.token.trim() || verifica === 'in-corso'}>
            {verifica === 'in-corso' ? 'Verifico…' : 'Collega questo dispositivo'}
          </button>
        </>
      )}
    </details>
  );
}
