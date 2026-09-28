import { useState } from 'react';
import { contaSegnaposto, nonAggravioEffettivo, nuovaRigaExtra, testoConclusioni, vociSelezionate } from '../lib/catalogo';
import { totaleComplessivo, zoneComputo, type RigaCalcolata } from '../lib/computo';
import { formatNumero } from '../lib/numeri';
import type { Catalogo, RigaComputo, Sopralluogo } from '../lib/types';
import { AreaTesto } from './Campo';
import type { DocGenerato } from './Wizard';

interface Props {
  s: Sopralluogo;
  catalogo: Catalogo;
  aggiorna: (f: (s: Sopralluogo) => Sopralluogo) => void;
  onGenera: () => void;
  generazione: boolean;
  doc: DocGenerato | null;
  erroreDoc: string | null;
  onCondividi: () => void;
  onScarica: () => void;
}

export default function Step4Riepilogo(p: Props) {
  const { s, catalogo, aggiorna } = p;
  const [nuovaRiga, setNuovaRiga] = useState<Record<string, string>>({});
  const voci = vociSelezionate(s);
  const zone = zoneComputo(s, catalogo);
  const totale = totaleComplessivo(zone);
  const foto = voci.reduce((n, v) => n + v.fotoIds.length, 0);
  const daCompletare = voci.filter((v) => contaSegnaposto(v.testo) > 0);
  const tutteLav = Array.from(
    new Set([...catalogo.lavorazioniComuni, ...catalogo.famiglie.flatMap((f) => f.sezioni.flatMap((x) => x.voci.flatMap((v) => v.lavorazioni)))].map((l) => l.descrizione)),
  );

  /** Modifica una riga del computo, che sia di una voce o aggiuntiva. */
  function modificaRiga(r: RigaCalcolata, campi: Partial<RigaComputo>) {
    aggiorna((x) =>
      r.origine === 'voce'
        ? { ...x, voci: x.voci.map((v) => (v.key === r.voceKey ? { ...v, lavorazioni: v.lavorazioni.map((l) => (l.key === r.key ? { ...l, ...campi } : l)) } : v)) }
        : { ...x, righeExtra: x.righeExtra.map((l) => (l.key === r.key ? { ...l, ...campi } : l)) },
    );
  }

  function aggiungiRiga(codice: string) {
    const d = (nuovaRiga[codice] ?? '').trim();
    const nota = [...catalogo.lavorazioniComuni, ...catalogo.famiglie.flatMap((f) => f.sezioni.flatMap((x) => x.voci.flatMap((v) => v.lavorazioni)))].find(
      (l) => l.descrizione === d,
    );
    aggiorna((x) => ({ ...x, righeExtra: [...x.righeExtra, nuovaRigaExtra(codice, { descrizione: d, um: nota?.um ?? 'a corpo' })] }));
    setNuovaRiga({ ...nuovaRiga, [codice]: '' });
  }

  // righe tolte (inclusa = false) restano visibili per poterle rimettere
  const escluse = (codice: string) => [
    ...s.voci
      .filter((v) => v.selezionata && v.attivita === codice)
      .flatMap((v) => v.lavorazioni.filter((l) => !l.inclusa).map((l) => ({ l, voceKey: v.key }))),
    ...s.righeExtra.filter((l) => l.zona === codice && !l.inclusa).map((l) => ({ l, voceKey: undefined })),
  ];

  const zoneVisibili = s.attivita.map((a) => ({
    codice: a.codice,
    zona: zone.find((z) => z.codice === a.codice),
  }));

  return (
    <section>
      <h2 className="titolo-passo">Riepilogo</h2>
      <div className="tiles">
        <div className="tile">
          <span className="tile-num">{voci.length}</span>
          <span className="tile-nome">frasi spuntate</span>
        </div>
        <div className="tile">
          <span className="tile-num">{s.attivita.length}</span>
          <span className="tile-nome">attività</span>
        </div>
        <div className="tile">
          <span className="tile-num">{foto}</span>
          <span className="tile-nome">foto</span>
        </div>
        <div className="tile">
          <span className="tile-num tile-euro">{totale ? `€ ${formatNumero(totale)}` : '—'}</span>
          <span className="tile-nome">totale computo</span>
        </div>
      </div>

      {daCompletare.length > 0 && (
        <div className="promemoria">
          <span>
            {daCompletare.length === 1 ? '1 frase contiene' : `${daCompletare.length} frasi contengono`} ancora parti tra <b>[parentesi]</b>{' '}
            (evidenziate in giallo nel Word): {daCompletare.map((v) => v.titolo).join('; ')}.
          </span>
        </div>
      )}

      <h3 className="titolo-sezione">Computo metrico</h3>
      <p className="muto piccolo">Righe proposte dalle frasi spuntate. Prezzi facoltativi: se vuoti restano vuoti nel Word.</p>
      {zoneVisibili.map(({ codice, zona }) => (
        <div key={codice} className="zona-computo">
          <h4 className="zona-titolo">
            {codice}
            {zona && <span className="muto piccolo"> · {zona.etichetta}</span>}
          </h4>
          {!zona && <p className="muto piccolo">Nessuna lavorazione: spunta delle frasi al passo 3 o aggiungi una riga.</p>}
          <ul className="computo">
            {zona?.righe.map((r, i) => (
              <li key={r.key} className="card riga-computo">
                <div className="riga-testa">
                  <span className="riga-num">{i + 1}</span>
                  <AreaTesto rows={1} valore={r.descrizione} onValore={(v) => modificaRiga(r, { descrizione: v })} aria-label="Descrizione" />
                  <button className="btn-icona" aria-label="Togli dal computo" onClick={() => modificaRiga(r, { inclusa: false })}>
                    ×
                  </button>
                </div>
                <div className="computo-numeri">
                  <label className="campo">
                    <span className="campo-etichetta">U.M.</span>
                    <select value={r.um} onChange={(e) => modificaRiga(r, { um: e.target.value })}>
                      {(catalogo.umOptions.includes(r.um) ? catalogo.umOptions : [...catalogo.umOptions, r.um]).map((u) => (
                        <option key={u}>{u}</option>
                      ))}
                    </select>
                  </label>
                  <label className="campo">
                    <span className="campo-etichetta">Q.tà</span>
                    <input inputMode="decimal" value={r.quantitaTesto} onChange={(e) => modificaRiga(r, { quantita: e.target.value })} />
                  </label>
                  <label className="campo">
                    <span className="campo-etichetta">Prezzo €</span>
                    <input inputMode="decimal" value={r.prezzoTesto} placeholder="—" onChange={(e) => modificaRiga(r, { prezzo: e.target.value })} />
                  </label>
                </div>
                {r.importo !== null && (
                  <div className="importo">
                    Importo <strong>€ {formatNumero(r.importo)}</strong>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {escluse(codice).length > 0 && (
            <details className="escluse">
              <summary className="muto piccolo">{escluse(codice).length} righe tolte o alternative</summary>
              {escluse(codice).map(({ l, voceKey }) => (
                <button
                  key={l.key}
                  className="chip-testo"
                  onClick={() =>
                    modificaRiga(
                      { key: l.key, origine: voceKey ? 'voce' : 'extra', voceKey } as RigaCalcolata,
                      { inclusa: true },
                    )
                  }
                >
                  + {l.descrizione}
                </button>
              ))}
            </details>
          )}
          <div className="aggiungi-riga">
            <input
              list="lavorazioni-note"
              value={nuovaRiga[codice] ?? ''}
              onChange={(e) => setNuovaRiga({ ...nuovaRiga, [codice]: e.target.value })}
              placeholder="Aggiungi lavorazione…"
              aria-label={`Nuova lavorazione ${codice}`}
            />
            <button className="btn" disabled={!(nuovaRiga[codice] ?? '').trim()} onClick={() => aggiungiRiga(codice)}>
              Aggiungi
            </button>
          </div>
          {zona?.conPrezzi && (
            <div className="totale">
              <span>Totale {codice}</span>
              <strong>€ {formatNumero(zona.totale)}</strong>
            </div>
          )}
        </div>
      ))}
      <datalist id="lavorazioni-note">
        {tutteLav.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>

      <h3 className="titolo-sezione">Nota bene (sotto il computo)</h3>
      <AreaTesto rows={3} valore={s.notaBene} onValore={(v) => aggiorna((x) => ({ ...x, notaBene: v }))} placeholder="Facoltativa" />
      <div className="suggerimenti">
        {catalogo.notaBeneSuggerimenti.map((t) => (
          <button
            key={t}
            className="chip-testo"
            onClick={() => aggiorna((x) => ({ ...x, notaBene: [x.notaBene.trim(), t].filter(Boolean).join('\n') }))}
          >
            + {t.length > 90 ? t.slice(0, 90) + '…' : t}
          </button>
        ))}
      </div>

      <h3 className="titolo-sezione">Conclusioni</h3>
      <div className="segmentato" role="radiogroup" aria-label="Esito">
        <button role="radio" aria-checked={!s.esitoConforme} className={!s.esitoConforme ? 'attivo' : ''} onClick={() => aggiorna((x) => ({ ...x, esitoConforme: false }))}>
          Non conforme
        </button>
        <button role="radio" aria-checked={s.esitoConforme} className={s.esitoConforme ? 'attivo' : ''} onClick={() => aggiorna((x) => ({ ...x, esitoConforme: true }))}>
          Conforme
        </button>
      </div>
      <label className="riga-check">
        <input type="checkbox" checked={nonAggravioEffettivo(s)} onChange={(e) => aggiorna((x) => ({ ...x, nonAggravio: e.target.checked }))} />
        <span>Dichiarazione di non aggravio del rischio in fase di S.C.I.A.</span>
      </label>
      <AreaTesto rows={6} valore={testoConclusioni(s, catalogo)} onValore={(v) => aggiorna((x) => ({ ...x, conclusioni: v }))} />
      {s.conclusioni !== null ? (
        <button className="btn btn-piccolo btn-testo" onClick={() => confirm('Rigenerare il testo automatico delle conclusioni?') && aggiorna((x) => ({ ...x, conclusioni: null }))}>
          Torna al testo automatico
        </button>
      ) : (
        <p className="muto piccolo">Testo automatico: si aggiorna con esito, attività e non aggravio. Se lo modifichi resta come l’hai scritto.</p>
      )}
      <p className="muto piccolo">Segue sempre, in grassetto: “{catalogo.testi.sanzioni}”</p>

      <div className="genera">
        <button className="btn btn-primario btn-grande btn-blocco" onClick={p.onGenera} disabled={p.generazione}>
          {p.generazione ? 'Generazione in corso…' : 'Genera documento Word'}
        </button>
        {p.erroreDoc && <p className="errore">{p.erroreDoc}</p>}
        {p.doc && (
          <div className="card doc-pronto">
            <p>
              ✓ Documento pronto: <b>{p.doc.file.name}</b>
            </p>
            <p className="muto piccolo">All’apertura Word chiede di aggiornare i campi: rispondi Sì per compilare l’indice.</p>
            <div className="riga-pulsanti">
              {p.doc.condivisibile && (
                <button className="btn btn-primario btn-grande" onClick={p.onCondividi}>
                  Condividi…
                </button>
              )}
              <button className="btn btn-grande" onClick={p.onScarica}>
                Scarica
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
