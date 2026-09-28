import { contaSegnaposto, gruppiSelezionati } from '../lib/catalogo';
import { righeComputo, totaleComputo } from '../lib/computo';
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
  const gruppi = gruppiSelezionati(s);
  const voci = gruppi.flatMap((g) => g.voci);
  const righe = righeComputo(s);
  const totale = totaleComputo(righe);
  const foto = voci.reduce((n, v) => n + v.fotoIds.length, 0);
  const daCompletare = voci.filter((v) => contaSegnaposto(v.testo) > 0);

  function modificaRiga(key: string, campo: keyof RigaComputo, valore: string) {
    aggiorna((x) => ({
      ...x,
      voci: x.voci.map((v) => (v.key === key ? { ...v, computo: { ...v.computo, [campo]: valore } } : v)),
    }));
  }

  return (
    <section>
      <h2 className="titolo-passo">Riepilogo</h2>
      <div className="tiles">
        <div className="tile">
          <span className="tile-num">{voci.length}</span>
          <span className="tile-nome">voci selezionate</span>
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
          <span className="tile-num tile-euro">€ {formatNumero(totale)}</span>
          <span className="tile-nome">totale computo</span>
        </div>
      </div>

      {daCompletare.length > 0 && (
        <div className="promemoria">
          <span>
            {daCompletare.length === 1 ? '1 voce contiene' : `${daCompletare.length} voci contengono`} ancora parti tra{' '}
            <b>[parentesi]</b> (evidenziate in giallo nel Word): {daCompletare.map((v) => v.titolo).join('; ')}.
          </span>
        </div>
      )}

      <h3 className="titolo-sezione">Computo metrico</h3>
      {righe.length === 0 && <p className="muto">Seleziona almeno una voce al passo 3 per generare il computo.</p>}
      <ul className="computo">
        {righe.map((r) => {
          const v = voci.find((x) => x.key === r.key)!;
          return (
            <li key={r.key} className="card riga-computo">
              <label className="campo">
                <span className="campo-etichetta">Descrizione</span>
                <AreaTesto
                  rows={1}
                  valore={v.computo.descrizione || r.descrizioneAutomatica}
                  onValore={(val) => modificaRiga(r.key, 'descrizione', val === r.descrizioneAutomatica ? '' : val)}
                />
              </label>
              <div className="computo-numeri">
                <label className="campo">
                  <span className="campo-etichetta">U.M.</span>
                  <select value={v.computo.um} onChange={(e) => modificaRiga(r.key, 'um', e.target.value)}>
                    {(catalogo.umOptions.includes(v.computo.um) ? catalogo.umOptions : [...catalogo.umOptions, v.computo.um]).map(
                      (u) => (
                        <option key={u}>{u}</option>
                      ),
                    )}
                  </select>
                </label>
                <label className="campo">
                  <span className="campo-etichetta">Q.tà</span>
                  <input
                    inputMode="decimal"
                    value={v.computo.quantita}
                    onChange={(e) => modificaRiga(r.key, 'quantita', e.target.value)}
                    onFocus={(e) => e.target.select()}
                  />
                </label>
                <label className="campo">
                  <span className="campo-etichetta">Prezzo €</span>
                  <input
                    inputMode="decimal"
                    value={v.computo.prezzo}
                    placeholder="0,00"
                    onChange={(e) => modificaRiga(r.key, 'prezzo', e.target.value)}
                    onFocus={(e) => e.target.select()}
                  />
                </label>
              </div>
              <div className="importo">
                Importo <strong>€ {formatNumero(r.importo)}</strong>
              </div>
            </li>
          );
        })}
      </ul>
      {righe.length > 0 && (
        <div className="totale">
          <span>Totale</span>
          <strong>€ {formatNumero(totale)}</strong>
        </div>
      )}

      <h3 className="titolo-sezione">Conclusioni</h3>
      <AreaTesto rows={8} valore={s.conclusioni} onValore={(v) => aggiorna((x) => ({ ...x, conclusioni: v }))} />
      {s.conclusioni !== catalogo.conclusioniDefault && (
        <button
          className="btn btn-piccolo btn-testo"
          onClick={() =>
            confirm('Ripristinare il testo standard delle conclusioni?') &&
            aggiorna((x) => ({ ...x, conclusioni: catalogo.conclusioniDefault }))
          }
        >
          Ripristina testo standard
        </button>
      )}

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
