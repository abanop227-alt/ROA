import { useRef } from 'react';
import { contaSegnaposto, famigliaDi } from '../lib/catalogo';
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
  const segnaposto = contaSegnaposto(voce.testo);
  const originale = voce.voceId
    ? famigliaDi(catalogo, voce.attivita)
        ?.sezioni.flatMap((s) => s.voci)
        .find((x) => x.id === voce.voceId)
    : undefined;
  const set = <K extends keyof VoceIstanza>(k: K, val: VoceIstanza[K]) => onModifica((v) => ({ ...v, [k]: val }));
  const lavorazioni = voce.lavorazioni.filter((l) => l.inclusa).length;

  /** Seleziona la prossima parte tra [parentesi], così si sovrascrive subito. */
  function prossimaParentesi() {
    const el = areaTesto.current;
    if (!el) return;
    const re = /\[[^\]]*\]/g;
    re.lastIndex = el.selectionEnd ?? 0;
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
    if (!originale || !confirm('Sostituire il testo con quello standard della libreria?')) return;
    onModifica((v) => ({ ...v, testo: originale.testo, didascalia: originale.didascalia }));
  }

  return (
    <li className={`card voce ${voce.selezionata ? 'selezionata' : ''} ${aperta ? 'aperta' : ''}`}>
      <div className="voce-testa">
        <label className="spunta" aria-label={`Seleziona ${voce.titolo}`}>
          <input type="checkbox" checked={voce.selezionata} onChange={(e) => set('selezionata', e.target.checked)} />
          <span className="spunta-box" aria-hidden />
        </label>
        <button className="voce-titolo" onClick={onApri} aria-expanded={aperta}>
          <strong>{voce.titolo || 'Frase senza titolo'}</strong>
          {!aperta && voce.testo && <span className="anteprima">{voce.testo}</span>}
          <span className="badges">
            {voce.personalizzata && <span className="badge">personalizzata</span>}
            {voce.selezionata && segnaposto > 0 && <span className="badge badge-avviso">{segnaposto} [ ] da completare</span>}
            {voce.fotoIds.length > 0 && <span className="badge">📷 {voce.fotoIds.length}</span>}
            {voce.note.trim() && <span className="badge">appunti</span>}
          </span>
        </button>
        <span className="chevron" aria-hidden onClick={onApri}>
          {aperta ? '▴' : '▾'}
        </span>
      </div>

      {aperta && (
        <div className="voce-corpo">
          {voce.personalizzata && <Campo etichetta="Titolo (solo nell’app)" valore={voce.titolo} onValore={(v) => set('titolo', v)} />}

          <label className="campo">
            <span className="campo-etichetta">Testo della relazione</span>
            <AreaTesto areaRef={areaTesto} valore={voce.testo} onValore={(v) => set('testo', v)} rows={5} />
          </label>
          {segnaposto > 0 ? (
            <div className="promemoria">
              <span>
                Sostituisci le parti tra <b>[parentesi]</b>: {segnaposto} rimaste.
              </span>
              <button className="btn btn-piccolo" onClick={prossimaParentesi}>
                Vai alla prossima [ ]
              </button>
            </div>
          ) : (
            voce.testo.trim() && <p className="ok piccolo">✓ Nessuna parte tra [parentesi] da completare.</p>
          )}
          {originale && (voce.testo !== originale.testo || voce.didascalia !== originale.didascalia) && (
            <button className="btn btn-piccolo btn-testo" onClick={ripristina}>
              Ripristina testo standard
            </button>
          )}

          <FotoVoce
            sopralluogoId={sopralluogoId}
            fotoIds={voce.fotoIds}
            onAggiunte={(ids) => onModifica((v) => ({ ...v, selezionata: true, fotoIds: [...v.fotoIds, ...ids] }))}
            onRimossa={(id) => onModifica((v) => ({ ...v, fotoIds: v.fotoIds.filter((x) => x !== id) }))}
          />
          <Campo
            etichetta="Didascalia foto"
            valore={voce.didascalia}
            onValore={(v) => set('didascalia', v)}
            aiuto="Nel Word: “Foto 7 – Foto 8 – didascalia”, numerate in automatico"
          />

          <label className="campo">
            <span className="campo-etichetta">Appunti (non vanno nel Word)</span>
            <AreaTesto valore={voce.note} onValore={(v) => set('note', v)} rows={2} placeholder="Misure, promemoria…" />
          </label>

          {voce.lavorazioni.length > 0 && (
            <p className="muto piccolo">
              Computo: {lavorazioni} lavorazion{lavorazioni === 1 ? 'e' : 'i'} proposte (quantità e prezzi al passo 4).
            </p>
          )}

          {voce.personalizzata && (
            <button className="btn btn-pericolo btn-blocco" onClick={() => confirm('Eliminare questa frase?') && onElimina()}>
              Elimina frase
            </button>
          )}
        </div>
      )}
    </li>
  );
}
