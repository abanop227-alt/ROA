import { eliminaFoto } from '../lib/db';
import { formatPortata, nuovaProvaIdranti, valutaProva } from '../lib/idranti';
import { formatQuantita } from '../lib/numeri';
import type { MisuraIdranti, ProvaIdranti, Sopralluogo } from '../lib/types';
import { AreaTesto, Campo } from './Campo';
import FotoVoce from './FotoVoce';

interface Props {
  s: Sopralluogo;
  aggiorna: (f: (s: Sopralluogo) => Sopralluogo) => void;
}

type ChiaveFoto = 'fotoAttaccoIds' | 'fotoProvaIds' | 'fotoRapportoIds';

export default function StepIdranti({ s, aggiorna }: Props) {
  const p = s.provaIdranti;

  const imposta = (f: (p: ProvaIdranti) => ProvaIdranti) => aggiorna((x) => ({ ...x, provaIdranti: x.provaIdranti ? f(x.provaIdranti) : x.provaIdranti }));
  const campi = (c: Partial<ProvaIdranti>) => imposta((x) => ({ ...x, ...c }));

  if (!p || !p.attiva) {
    return (
      <section>
        <h2 className="titolo-passo">Prova idranti</h2>
        <p className="muto">
          Facoltativa: se hai fatto la prova di pressione e portata della rete idranti, qui inserisci le misure. L’app calcola la portata e
          prepara un secondo documento Word, separato dalla ROA.
        </p>
        <button
          className="btn btn-primario btn-grande btn-blocco"
          onClick={() =>
            aggiorna((x) => ({
              ...x,
              provaIdranti: x.provaIdranti ? { ...x.provaIdranti, attiva: true } : nuovaProvaIdranti(x.attivita.find((a) => /^(75|77)/.test(a.codice))?.codice ?? x.attivita[0]?.codice ?? ''),
            }))
          }
        >
          + Aggiungi prova idranti
        </button>
      </section>
    );
  }

  const v = valutaProva(p);
  const modificaMisura = (i: number, c: Partial<MisuraIdranti>) => imposta((x) => ({ ...x, misure: x.misure.map((m, j) => (j === i ? { ...m, ...c } : m)) }));
  const foto = (chiave: ChiaveFoto, etichetta: string) => (
    <FotoVoce
      etichetta={etichetta}
      sopralluogoId={s.id}
      fotoIds={p[chiave]}
      onAggiunte={(ids) => imposta((x) => ({ ...x, [chiave]: [...x[chiave], ...ids] }))}
      onRimossa={(id) => imposta((x) => ({ ...x, [chiave]: x[chiave].filter((f) => f !== id) }))}
    />
  );

  async function rimuovi() {
    if (!confirm('Togliere la prova idranti da questo sopralluogo? I dati inseriti andranno persi.')) return;
    const ids = [...p!.fotoAttaccoIds, ...p!.fotoProvaIds, ...p!.fotoRapportoIds];
    aggiorna((x) => ({ ...x, provaIdranti: null }));
    await Promise.all(ids.map((id) => eliminaFoto(id)));
  }

  return (
    <section>
      <h2 className="titolo-passo">Prova idranti</h2>

      <div className="card">
        <label className="campo">
          <span className="campo-etichetta">Attività</span>
          <select value={p.attivita} onChange={(e) => campi({ attivita: e.target.value })}>
            <option value="">— nessuna —</option>
            {s.attivita.map((a) => (
              <option key={a.codice}>{a.codice}</option>
            ))}
            {p.attivita && !s.attivita.some((a) => a.codice === p.attivita) && <option>{p.attivita}</option>}
          </select>
        </label>
        <Campo etichetta="Riferimento (sotto “Esposizione”)" valore={p.riferimento} onValore={(x) => campi({ riferimento: x })} aiuto="es. Verifica del § 6.1.4 del D.M. 01/02/1986 per ATT. 75.2.B." />
        <div className="griglia-2">
          <Campo etichetta="Data prova" type="date" valore={p.dataProva} onValore={(x) => campi({ dataProva: x })} />
          <Campo etichetta="Zona (titolo)" valore={p.zona} onValore={(x) => campi({ zona: x })} aiuto="AUTORIMESSA, EDIFICIO…" />
        </div>
        <Campo etichetta="Circostanza (facoltativa)" valore={p.circostanza} onValore={(x) => campi({ circostanza: x })} aiuto="es. al momento del collaudo del gruppo di pompaggio" />
        <Campo
          etichetta="Prova eseguita da un’altra ditta (facoltativo)"
          valore={p.eseguitaDa}
          onValore={(x) => campi({ eseguitaDa: x })}
          aiuto="Se compilato, il documento rimanda al rapporto in allegato e non descrive lo strumento"
        />
      </div>

      <h3 className="titolo-sezione">Impianto</h3>
      <div className="card">
        <label className="campo">
          <span className="campo-etichetta">Descrizione dell’impianto</span>
          <AreaTesto rows={3} valore={p.descrizioneImpianto} onValore={(x) => campi({ descrizioneImpianto: x })} placeholder="es. L’impianto si sviluppa nei due piani interrati ed è composto da n° 4 idranti UNI 45 in cassetta; completa l’impianto n° 1 attacco di mandata per l’autopompa…" />
        </label>
        <div className="griglia-2">
          <Campo etichetta="Idranti totali" inputMode="numeric" valore={p.idrantiTotali} onValore={(x) => campi({ idrantiTotali: x })} />
          <Campo etichetta="Idranti aperti nella prova" inputMode="numeric" valore={p.idrantiAperti} onValore={(x) => campi({ idrantiAperti: x })} />
        </div>
        {foto('fotoAttaccoIds', 'Foto attacco di mandata VV.F. / impianto')}
      </div>

      {!p.eseguitaDa.trim() && (
        <>
          <h3 className="titolo-sezione">Strumento</h3>
          <div className="card">
            <label className="campo">
              <span className="campo-etichetta">Strumento utilizzato</span>
              <AreaTesto rows={3} valore={p.strumento} onValore={(x) => campi({ strumento: x })} />
            </label>
            <Campo etichetta="Coefficiente K" inputMode="decimal" valore={p.coefficienteK} onValore={(x) => campi({ coefficienteK: x })} aiuto="dalla tabella dello strumento (es. 80,82 per ugello Ø 12 mm)" />
          </div>
        </>
      )}

      <h3 className="titolo-sezione">Misure</h3>
      <div className="card">
        {p.misure.map((m, i) => {
          return (
            <div key={i} className="misura">
              <div className="riga-testa">
                <strong>{p.misure.length > 1 ? `${i + 1}ª misura` : 'Misura'}</strong>
                {p.misure.length > 1 && (
                  <button className="btn-icona" aria-label="Togli misura" onClick={() => imposta((x) => ({ ...x, misure: x.misure.filter((_, j) => j !== i) }))}>
                    ×
                  </button>
                )}
              </div>
              <div className="griglia-2">
                <Campo etichetta="Pressione statica (bar)" inputMode="decimal" valore={m.pStatica} onValore={(x) => modificaMisura(i, { pStatica: x })} />
                <Campo etichetta="Pressione di efflusso (bar)" inputMode="decimal" valore={m.pEfflusso} onValore={(x) => modificaMisura(i, { pEfflusso: x })} />
              </div>
              <Campo
                etichetta="Portata già misurata (l/min, facoltativa)"
                inputMode="decimal"
                valore={m.portataMisurata}
                onValore={(x) => modificaMisura(i, { portataMisurata: x })}
                aiuto="Se la scrivi (es. da un rapporto di una ditta) non viene calcolata"
              />
            </div>
          );
        })}
        <button className="btn" onClick={() => imposta((x) => ({ ...x, misure: [...x.misure, { pStatica: '', pEfflusso: '', portataMisurata: '' }] }))}>
          + Altra misura
        </button>
      </div>

      <div className={`card esito-prova ${v.esito}`} role="status">
        <Campo etichetta="Portata minima richiesta (l/min)" inputMode="decimal" valore={p.portataMinima} onValore={(x) => campi({ portataMinima: x })} />
        {v.misure.map((m) => (
          <p key={m.n} className="piccolo">
            {v.misure.length > 1 ? `${m.n}ª misura: ` : ''}
            {m.portata === null ? 'portata da calcolare' : `${formatPortata(m.portata)} l/min${m.calcolata ? ' (calcolata)' : ' (misurata)'}`}
          </p>
        ))}
        <p className="esito-testo">
          {v.esito === 'positivo' && `✓ Esito positivo: ${formatPortata(v.minimoRiscontrato!)} l/min ≥ ${formatQuantita(v.portataMinima)} l/min`}
          {v.esito === 'negativo' && `✗ Esito negativo: ${formatPortata(v.minimoRiscontrato!)} l/min < ${formatQuantita(v.portataMinima)} l/min`}
          {v.esito === 'incompleto' && 'Inserisci le pressioni per ottenere l’esito.'}
        </p>
        {v.avvisi.map((a) => (
          <p key={a} className="piccolo errore">
            ⚠ {a}
          </p>
        ))}
      </div>

      <h3 className="titolo-sezione">Foto e note</h3>
      <div className="card">
        {foto('fotoProvaIds', 'Foto della prova (manometro, strumento, idranti aperti)')}
        {foto('fotoRapportoIds', 'Rapporto della ditta (foto o pagine: vanno in allegato)')}
        <label className="campo">
          <span className="campo-etichetta">Note (compaiono nel documento)</span>
          <AreaTesto rows={2} valore={p.note} onValore={(x) => campi({ note: x })} />
        </label>
      </div>

      <button className="btn btn-pericolo btn-blocco" onClick={rimuovi}>
        Togli la prova idranti
      </button>
    </section>
  );
}
