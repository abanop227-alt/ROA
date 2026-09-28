import { useRef, useState } from 'react';
import { contaSegnaposto, istanziaVoce } from '../lib/catalogo';
import type { Catalogo, VoceIstanza } from '../lib/types';
import { AreaTesto, Campo } from './Campo';
import FotoVoce from './FotoVoce';

interface Props {
  voce: VoceIstanza;
  sopralluogoId: string;
  catalogo: Catalogo;
  aperta: boolean;
  onApri: () => void;
  onModifica: (f: (v: VoceIstanza) => VoceIstanza) => void;
  onElimina: () => void;
}

export default function VoceCard({ voce, sopralluogoId, catalogo, aperta, onApri, onModifica, onElimina }: Props) {
  const areaTesto = useRef<HTMLTextAreaElement | null>(null);
  const [nuovaCert, setNuovaCert] = useState('');
  const segnaposto = contaSegnaposto(voce.testo);
  const originale = voce.voceId ? catalogo.voci.find((x) => x.id === voce.voceId) : undefined;
  const set = <K extends keyof VoceIstanza>(k: K, val: VoceIstanza[K]) => onModifica((v) => ({ ...v, [k]: val }));

  /** Seleziona la prossima parte tra [parentesi] nel testo, così si sovrascrive subito. */
  function prossimaParentesi() {
    const el = areaTesto.current;
    if (!el) return;
    const re = /\[[^\]]*\]/g;
    const da = el.selectionEnd ?? 0;
    re.lastIndex = da;
    let m = re.exec(voce.testo);
    if (!m) {
      re.lastIndex = 0;
      m = re.exec(voce.testo);
    }
    if (!m) return;
    el.focus();
    el.setSelectionRange(m.index, m.index + m[0].length);
  }

  function ripristina() {
    if (!originale || !voce.attivita) return;
    if (!confirm('Sostituire il testo con quello standard della libreria?')) return;
    set('testo', istanziaVoce(originale, voce.attivita).testo);
  }

  function aggiungiCert() {
    const t = nuovaCert.trim();
    if (!t) return;
    onModifica((v) => ({ ...v, certificazioni: [...v.certificazioni, { testo: t, richiesta: true }] }));
    setNuovaCert('');
  }

  return (
    <li className={`card voce ${voce.selezionata ? 'selezionata' : ''} ${aperta ? 'aperta' : ''}`}>
      <div className="voce-testa">
        <label className="spunta" aria-label={`Seleziona ${voce.titolo}`}>
          <input type="checkbox" checked={voce.selezionata} onChange={(e) => set('selezionata', e.target.checked)} />
          <span className="spunta-box" aria-hidden />
        </label>
        <button className="voce-titolo" onClick={onApri} aria-expanded={aperta}>
          <strong>{voce.titolo || 'Voce senza titolo'}</strong>
          {voce.rifNormativo && <span className="rif">{voce.rifNormativo}</span>}
          <span className="badges">
            {voce.personalizzata && <span className="badge">personalizzata</span>}
            {voce.selezionata && segnaposto > 0 && <span className="badge badge-avviso">{segnaposto} [ ] da completare</span>}
            {voce.fotoIds.length > 0 && <span className="badge">📷 {voce.fotoIds.length}</span>}
            {voce.note.trim() && <span className="badge">nota</span>}
          </span>
        </button>
        <span className="chevron" aria-hidden onClick={onApri}>
          {aperta ? '▴' : '▾'}
        </span>
      </div>

      {aperta && (
        <div className="voce-corpo">
          {voce.personalizzata && (
            <>
              <Campo etichetta="Titolo" valore={voce.titolo} onValore={(v) => set('titolo', v)} />
              <Campo etichetta="Riferimento normativo" valore={voce.rifNormativo} onValore={(v) => set('rifNormativo', v)} />
            </>
          )}

          <label className="campo">
            <span className="campo-etichetta">Testo relazione</span>
            <AreaTesto areaRef={areaTesto} valore={voce.testo} onValore={(v) => set('testo', v)} rows={6} />
          </label>
          {segnaposto > 0 ? (
            <div className="promemoria">
              <span>
                Ricorda di sostituire le parti tra <b>[parentesi]</b>: {segnaposto} rimaste.
              </span>
              <button className="btn btn-piccolo" onClick={prossimaParentesi}>
                Vai alla prossima [ ]
              </button>
            </div>
          ) : (
            voce.testo.trim() && <p className="ok piccolo">✓ Nessuna parte tra [parentesi] da completare.</p>
          )}
          {originale && voce.testo !== originale.testo && (
            <button className="btn btn-piccolo btn-testo" onClick={ripristina}>
              Ripristina testo standard
            </button>
          )}

          <label className="campo">
            <span className="campo-etichetta">Note dal sopralluogo</span>
            <AreaTesto valore={voce.note} onValore={(v) => set('note', v)} rows={2} placeholder="Annotazioni sul posto…" />
          </label>

          <fieldset className="certificazioni">
            <legend>Certificazioni da richiedere</legend>
            {voce.certificazioni.length === 0 && <p className="muto piccolo">Nessuna certificazione per questa voce.</p>}
            {voce.certificazioni.map((c, i) => (
              <label key={i} className="riga-check">
                <input
                  type="checkbox"
                  checked={c.richiesta}
                  onChange={(e) =>
                    onModifica((v) => ({
                      ...v,
                      certificazioni: v.certificazioni.map((x, j) => (j === i ? { ...x, richiesta: e.target.checked } : x)),
                    }))
                  }
                />
                <span>{c.testo}</span>
              </label>
            ))}
            <div className="aggiungi-riga">
              <input
                value={nuovaCert}
                onChange={(e) => setNuovaCert(e.target.value)}
                placeholder="Altra certificazione…"
                onKeyDown={(e) => e.key === 'Enter' && aggiungiCert()}
                aria-label="Nuova certificazione"
              />
              <button className="btn" onClick={aggiungiCert} disabled={!nuovaCert.trim()}>
                Aggiungi
              </button>
            </div>
          </fieldset>

          <FotoVoce
            sopralluogoId={sopralluogoId}
            fotoIds={voce.fotoIds}
            onAggiunte={(ids) => onModifica((v) => ({ ...v, selezionata: true, fotoIds: [...v.fotoIds, ...ids] }))}
            onRimossa={(id) => onModifica((v) => ({ ...v, fotoIds: v.fotoIds.filter((x) => x !== id) }))}
          />

          {voce.personalizzata && (
            <button
              className="btn btn-pericolo btn-blocco"
              onClick={() => confirm('Eliminare questa voce personalizzata?') && onElimina()}
            >
              Elimina voce
            </button>
          )}
        </div>
      )}
    </li>
  );
}
