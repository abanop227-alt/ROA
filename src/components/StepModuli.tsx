import { useEffect, useState } from 'react';
import { condividi, fileDaBlob, isMobile, puoCondividere, scarica } from '../lib/condividi';
import { leggiAmministratore, leggiTecnico, salvaAmministratore } from '../lib/db';
import { generaModulo, moduliPredefiniti, nomeFileModulo, valoriPin2, valoriPin21, valoriPin3, valoriPin31, type ModelloModulo } from '../lib/moduliVvf';
import { documentiPratica, praticaDi } from '../lib/pratiche';
import type { DatiModuli, Sopralluogo, Tecnico } from '../lib/types';
import { Campo } from './Campo';

interface Props {
  s: Sopralluogo;
  aggiorna: (f: (s: Sopralluogo) => Sopralluogo) => void;
}

/** Imposta un valore in un oggetto annidato ("titolare.cognome") senza modificare l'originale. */
function impostaPercorso<T>(o: T, percorso: string, valore: unknown): T {
  const [k, ...resto] = percorso.split('.');
  const corrente = (o as Record<string, unknown>)[k];
  return { ...o, [k]: resto.length ? impostaPercorso(corrente, resto.join('.'), valore) : valore } as T;
}

const MODULI_PER_TIPO: Record<'rinnovo' | 'scia', { id: ModelloModulo['id']; documento: string; testo: string }[]> = {
  rinnovo: [
    { id: 'pin3', documento: 'pin3', testo: 'MOD. PIN 3 – attestazione di rinnovo' },
    { id: 'pin31', documento: 'pin31', testo: 'MOD. PIN 3.1 – asseverazione' },
  ],
  scia: [
    { id: 'pin2', documento: 'pin2', testo: 'MOD. PIN 2 – SCIA' },
    { id: 'pin21', documento: 'pin21', testo: 'MOD. PIN 2.1 – asseverazione' },
  ],
};

/** Controlli sui dati prima di generare i moduli: cosa manca per non consegnare un modulo con riquadri vuoti. */
function daCompletare(s: Sopralluogo, m: DatiModuli, tecnico: Tecnico): string[] {
  const out: string[] = [];
  if (!praticaDi(s).nPraticaVvf.trim()) out.push('numero pratica VV.F. (passo Pratica)');
  if (!m.titolare.cognome.trim() || !m.titolare.nome.trim()) out.push('cognome e nome del titolare (amministratore)');
  if (m.titolare.codiceFiscale.replace(/\s/g, '').length !== 16) out.push('codice fiscale del titolare (16 caratteri)');
  if (!m.attivita.classe.trim()) out.push('attività (classe)');
  const p = tecnico.vvf;
  if (!p?.cognome.trim() || !p.codiceMI.trim()) out.push('dati del professionista (impostazioni del tecnico, schermata iniziale)');
  return out;
}

export default function StepModuli({ s, aggiorna }: Props) {
  const p = praticaDi(s);
  const [tecnico, setTecnico] = useState<Tecnico | null>(null);
  const [generando, setGenerando] = useState<string | null>(null);
  const [esito, setEsito] = useState<string | null>(null);

  // primo accesso: dati dei moduli ricavati da condominio e attività, titolare dalla rubrica
  useEffect(() => {
    leggiTecnico().then(setTecnico).catch(() => {});
    if (s.moduli) return;
    (async () => {
      const iniziali = moduliPredefiniti(s);
      const noto = await leggiAmministratore(s.condominio.pressoAmministrazione).catch(() => undefined);
      aggiorna((x) => (x.moduli ? x : { ...x, moduli: noto ? { ...moduliPredefiniti(x), titolare: noto } : iniziali }));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const m = s.moduli;
  const moduli = p.tipo === 'rinnovo' ? MODULI_PER_TIPO.rinnovo : p.tipo === 'scia' ? MODULI_PER_TIPO.scia : [];
  const documenti = documentiPratica(s);
  const fatti = s.documenti ?? {};
  const mancanti = documenti.filter((d) => !fatti[d.chiave]).length;
  const imposta = (chiave: string, v: boolean) => aggiorna((x) => ({ ...x, documenti: { ...(x.documenti ?? {}), [chiave]: v } }));
  const set = (percorso: string, v: unknown) => aggiorna((x) => ({ ...x, moduli: impostaPercorso(x.moduli ?? moduliPredefiniti(x), percorso, v) }));
  const campo = (etichetta: string, percorso: string, opz: { inputMode?: 'numeric' | 'tel'; aiuto?: string } = {}) => {
    const valore = percorso.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], m) as string | undefined;
    return <Campo key={percorso} etichetta={etichetta} valore={valore ?? ''} onValore={(v) => set(percorso, v)} autoComplete="off" {...opz} />;
  };

  async function genera(id: ModelloModulo['id']) {
    if (!m || !tecnico) return;
    setGenerando(id);
    setEsito(null);
    try {
      const valori = { pin3: valoriPin3, pin31: valoriPin31, pin2: valoriPin2, pin21: valoriPin21 }[id](s, m, tecnico);
      const blob = await generaModulo(id, valori);
      const file = fileDaBlob(blob, nomeFileModulo(id, s));
      await salvaAmministratore(s.condominio.pressoAmministrazione, m.titolare).catch(() => {});
      if (isMobile() && puoCondividere(file)) await condividi(file, file.name).catch(() => scarica(file, file.name));
      else scarica(file, file.name);
      setEsito(`✓ ${file.name}`);
    } catch (e) {
      setEsito(`Errore: ${(e as Error).message}`);
    } finally {
      setGenerando(null);
    }
  }

  const mancano = m && tecnico ? daCompletare(s, m, tecnico) : [];
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
      <h2 className="titolo-passo">Moduli e documenti {p.tipo === 'scia' ? 'della SCIA' : 'del rinnovo'}</h2>

      {moduli.length > 0 && m && (
        <>
          <h3 className="titolo-sezione">Moduli VV.F. da compilare</h3>
          <details className="card" open>
            <summary>Titolare (amministratore)</summary>
            <div className="griglia-2">
              {campo('Cognome', 'titolare.cognome')}
              {campo('Nome', 'titolare.nome')}
            </div>
            {campo('Codice fiscale', 'titolare.codiceFiscale')}
            {campo('In qualità di', 'titolare.qualifica')}
            <div className="griglia-2">
              {campo('Via / piazza', 'titolare.indirizzo')}
              {campo('N. civico', 'titolare.civico')}
              {campo('CAP', 'titolare.cap', { inputMode: 'numeric' })}
              {campo('Comune', 'titolare.comune')}
              {campo('Provincia', 'titolare.provincia')}
              {campo('Telefono', 'titolare.telefono', { inputMode: 'tel' })}
              {campo('Email', 'titolare.email')}
              {campo('PEC', 'titolare.pec')}
            </div>
            <p className="muto piccolo">Il titolare si ricorda per questa amministrazione: la prossima volta si precompila.</p>
          </details>
          <details className="card">
            <summary>Condominio e attività</summary>
            {campo('Ragione sociale (della)', 'ragione')}
            <div className="griglia-2">
              {campo('Sede: via', 'sede.indirizzo')}
              {campo('N. civico', 'sede.civico')}
              {campo('CAP', 'sede.cap', { inputMode: 'numeric' })}
              {campo('Comune', 'sede.comune')}
              {campo('Provincia', 'sede.provincia')}
              {campo('Telefono', 'sede.telefono', { inputMode: 'tel' })}
            </div>
            {campo('Tipo di attività', 'attivita.tipo', { aiuto: 'es. AUTORIMESSA, CENTRALE TERMICA, EDIFICIO DI CIVILE ABITAZIONE' })}
            <div className="griglia-2">
              {campo('Classe (n./sottoclasse/cat.)', 'attivita.classe')}
              {campo('Altre attività', 'attivita.altre')}
              {campo('Attività sita in: via', 'attivita.indirizzo')}
              {campo('N. civico', 'attivita.civico')}
              {campo('CAP', 'attivita.cap', { inputMode: 'numeric' })}
              {campo('Comune', 'attivita.comune')}
              {campo('Provincia', 'attivita.provincia')}
              {campo('Telefono', 'attivita.telefono', { inputMode: 'tel' })}
            </div>
            {campo('Comando VV.F. di', 'comando')}
          </details>
          <details className="card">
            <summary>{p.tipo === 'rinnovo' ? 'Rinnovo: SCIA precedente e versamento' : 'Versamento'}</summary>
            {p.tipo === 'rinnovo' && (
              <>
                {campo('SCIA / rinnovo precedente', 'sciaPrecedente', { aiuto: 'es. RINNOVO CPI DEL 28/04/2021' })}
                <label className="riga-check">
                  <input type="checkbox" checked={m.allegaAsseverazione} onChange={(e) => set('allegaAsseverazione', e.target.checked)} />
                  <span>Allega l’asseverazione (MOD. PIN 3.1)</span>
                </label>
              </>
            )}
            {campo('Totale versamento (€)', 'versamentoTotale')}
            {m.versamento.map((_, i) => (
              <div key={i} className="griglia-2">
                {campo(`Attività ${i + 1}: n.`, `versamento.${i}.n`)}
                {campo('Sottoclasse', `versamento.${i}.sotto`)}
                {campo('Importo €', `versamento.${i}.importo`)}
              </div>
            ))}
          </details>
          {p.tipo === 'rinnovo' && (
          <details className="card">
            <summary>Asseverazione (MOD. PIN 3.1)</summary>
            {campo('SCIA a firma di', 'sciaFirma')}
            <Campo etichetta="Data del sopralluogo" type="date" valore={m.dataSopralluogo} onValore={(v) => set('dataSopralluogo', v)} />
            {m.impianti.map((imp, i) => (
              <div key={i}>
                <label className="riga-check">
                  <input type="checkbox" checked={imp.attivo} onChange={(e) => set(`impianti.${i}.attivo`, e.target.checked)} />
                  <span>{['Estinzione o controllo incendi', 'Controllo del fumo e del calore', 'Rivelazione di fumo, calore, gas, incendio', 'Segnalazione e allarme incendio', 'Altro'][i]}</span>
                </label>
                {imp.attivo && campo('Tipologia', `impianti.${i}.testo`)}
              </div>
            ))}
          </details>
          )}

          {mancano.length > 0 && (
            <p className="promemoria">
              Da completare: {mancano.join('; ')}. I riquadri vuoti restano vuoti nel modulo.
            </p>
          )}
          <div className="riga-pulsanti">
            {moduli.map((mod) => (
              <button key={mod.id} className="btn btn-primario" onClick={() => genera(mod.id)} disabled={!!generando || !tecnico}>
                {generando === mod.id ? 'Genero…' : mod.testo}
              </button>
            ))}
          </div>
          {esito && <p className="promemoria">{esito}</p>}
          <p className="muto piccolo">Il Word è il modulo ufficiale compilato: controllalo, firmalo e convertilo in PDF come fai oggi.</p>
        </>
      )}

      <h3 className="titolo-sezione">Documenti</h3>
      <p className="muto piccolo">
        {mancanti === 0 ? '✓ Tutti i documenti sono pronti: puoi presentare la pratica e passarla a “presentata”.' : `Mancano ${mancanti} documenti su ${documenti.length}.`}
      </p>
      {gruppo('studio', 'Preparati dallo studio')}
      {gruppo('esterno', 'Da ricevere (certificazioni, bollettino, documenti)')}
    </section>
  );
}
