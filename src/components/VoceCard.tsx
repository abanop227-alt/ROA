import { useRef, useState } from 'react';
import { contaSegnaposto, famigliaDi } from '../lib/catalogo';
import type { Catalogo, RigaComputo, VoceIstanza } from '../lib/types';
import { nuovoId } from '../lib/util';
import { AreaTesto, Campo } from './Campo';
import FotoVoce from './FotoVoce';

/** Voci di computo collegate alla frase: spuntando la frase entrano nel computo metrico. */
function ComputoVoce({
  voce,
  catalogo,
  onModifica,
}: {
  voce: VoceIstanza;
  catalogo: Catalogo;
  onModifica: (f: (v: VoceIstanza) => VoceIstanza) => void;
}) {
  const [nuova, setNuova] = useState('');
  const set = (key: string, campi: Partial<RigaComputo>) =>
    onModifica((v) => ({ ...v, lavorazioni: v.lavorazioni.map((l) => (l.key === key ? { ...l, ...campi } : l)) }));
  const tutte = [...catalogo.lavorazioniComuni, ...catalogo.famiglie.flatMap((f) => f.sezioni.flatMap((s) => s.voci.flatMap((x) => x.lavorazioni)))];

  function aggiungi() {
    const d = nuova.trim();
    if (!d) return;
    const um = tutte.find((l) => l.descrizione === d)?.um ?? 'a corpo';
    onModifica((v) => ({
      ...v,
      lavorazioni: [...v.lavorazioni, { key: nuovoId('l-'), descrizione: d, um, quantita: '', prezzo: '', inclusa: true }],
    }));
    setNuova('');
  }

  return (
    <fieldset className="computo-voce">
      <legend>Voce del computo</legend>
      {!voce.selezionata && voce.lavorazioni.length > 0 && (
        <p className="muto piccolo">Entra nel computo quando spunti la frase.</p>
      )}
      {voce.lavorazioni.map((l) => (
        <div key={l.key} className={`lavorazione ${l.inclusa ? '' : 'esclusa'}`}>
          <label className="riga-check">
            <input type="checkbox" checked={l.inclusa} onChange={(e) => set(l.key, { inclusa: e.target.checked })} />
            <span>{l.descrizione}</span>
          </label>
          {l.inclusa && (
            <div className="lavorazione-numeri">
              <label className="campo">
                <span className="campo-etichetta">U.M.</span>
                <select value={l.um} onChange={(e) => set(l.key, { um: e.target.value })}>
                  {(catalogo.umOptions.includes(l.um) ? catalogo.umOptions : [...catalogo.umOptions, l.um]).map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              </label>
              <label className="campo">
                <span className="campo-etichetta">Q.tà</span>
                <input inputMode="decimal" value={l.quantita} onChange={(e) => set(l.key, { quantita: e.target.value })} />
              </label>
              <label className="campo">
                <span className="campo-etichetta">Prezzo €</span>
                <input inputMode="decimal" value={l.prezzo} placeholder="—" onChange={(e) => set(l.key, { prezzo: e.target.value })} />
              </label>
            </div>
          )}
        </div>
      ))}
      <div className="aggiungi-riga">
        <input
          list="lavorazioni-libreria"
          value={nuova}
          onChange={(e) => setNuova(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && aggiungi()}
          placeholder="Aggiungi voce di computo…"
          aria-label="Nuova voce di computo"
        />
        <button className="btn" onClick={aggiungi} disabled={!nuova.trim()}>
          Aggiungi
        </button>
      </div>
      <datalist id="lavorazioni-libreria">
        {Array.from(new Set(tutte.map((l) => l.descrizione))).map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>
    </fieldset>
  );
}

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
            {voce.selezionata && lavorazioni > 0 && <span className="badge">€ computo · {lavorazioni}</span>}
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

          <ComputoVoce voce={voce} catalogo={catalogo} onModifica={onModifica} />
          {lavorazioni === 0 && voce.lavorazioni.length === 0 && (
            <p className="muto piccolo">Questa frase non ha voci di computo: aggiungine una se prevede un intervento.</p>
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
