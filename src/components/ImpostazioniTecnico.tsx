import { useEffect, useRef, useState } from 'react';
import { tecnicoVuoto } from '../lib/catalogo';
import { leggiCartaIntestata, leggiTecnico, salvaCartaIntestata, salvaTecnico } from '../lib/db';
import { ridimensionaFoto } from '../lib/foto';
import type { Tecnico } from '../lib/types';
import { AreaTesto, Campo } from './Campo';
import ProfessionistaVvfForm from './ProfessionistaVvfForm';

/** Carta intestata dello studio: immagine a pagina intera messa dietro al testo del Word. */
function CartaIntestata() {
  const [url, setUrl] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function carica() {
    const c = await leggiCartaIntestata().catch(() => undefined);
    setUrl((vecchio) => {
      if (vecchio) URL.revokeObjectURL(vecchio);
      return c ? URL.createObjectURL(c.blob) : null;
    });
  }

  useEffect(() => {
    carica();
  }, []);

  async function scegli(file: File | undefined) {
    if (!file) return;
    setErrore(null);
    try {
      const r = await ridimensionaFoto(file, 2400);
      await salvaCartaIntestata({ blob: r.blob, width: r.width, height: r.height });
      await carica();
    } catch {
      setErrore('Immagine non leggibile: usa un file JPG o PNG.');
    }
  }

  return (
    <div className="carta-intestata">
      <span className="campo-etichetta">Carta intestata (facoltativa)</span>
      <p className="muto piccolo">
        Immagine della pagina intestata dello studio (A4 verticale, logo e dati): viene messa dietro al testo di ogni
        pagina. Da Word: apri l’intestazione del tuo modello, clic destro sull’immagine → “Salva come immagine”.
      </p>
      {url && <img src={url} alt="Carta intestata" className="anteprima-carta" />}
      <div className="riga-pulsanti">
        <button className="btn" onClick={() => input.current?.click()}>
          {url ? 'Sostituisci' : 'Carica immagine'}
        </button>
        {url && (
          <button
            className="btn btn-pericolo"
            onClick={async () => {
              if (!confirm('Togliere la carta intestata?')) return;
              await salvaCartaIntestata(null);
              await carica();
            }}
          >
            Togli
          </button>
        )}
      </div>
      {errore && <p className="errore">{errore}</p>}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          scegli(f);
        }}
      />
    </div>
  );
}

/** Dati del tecnico per intestazione, firma e piè di pagina. Restano solo su questo dispositivo. */
export default function ImpostazioniTecnico() {
  const [t, setT] = useState<Tecnico>(tecnicoVuoto);
  const [stato, setStato] = useState<'' | 'salvato'>('');
  const [aperta, setAperta] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    leggiTecnico()
      .then((x) => {
        setT(x);
        if (!x.firma.trim()) setAperta(true); // da compilare: aperta la prima volta
      })
      .catch(() => {});
  }, []);

  function set<K extends keyof Tecnico>(k: K, v: Tecnico[K]) {
    const nuovo = { ...t, [k]: v };
    setT(nuovo);
    setStato('');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => salvaTecnico(nuovo).then(() => setStato('salvato')), 400);
  }

  const vuoto = !t.firma.trim();
  return (
    <details className="card impostazioni" open={aperta} onToggle={(e) => setAperta(e.currentTarget.open)}>
      <summary>
        <span>Impostazioni tecnico</span>
        {vuoto ? <span className="badge badge-avviso">da compilare</span> : stato && <span className="badge">✓ salvato</span>}
      </summary>
      <p className="muto piccolo">
        Compaiono nella parte generale, nella firma e nel piè di pagina di ogni relazione. Restano salvati solo su questo
        dispositivo.
      </p>
      <label className="campo">
        <span className="campo-etichetta">Intestazione (una riga per ogni riga del Word)</span>
        <AreaTesto
          rows={5}
          valore={t.intestazione}
          onValore={(v) => set('intestazione', v)}
          placeholder={'Tecnico: Geom. …\nIscritto all’albo del Collegio dei Geometri della Provincia di … n° …\n…\nTel …\nemail …'}
        />
      </label>
      <Campo etichetta="Nome per la firma" valore={t.firma} onValore={(v) => set('firma', v)} placeholder="Geom. …" />
      <div className="griglia-2">
        <Campo etichetta="Luogo (data e firma)" valore={t.luogo} onValore={(v) => set('luogo', v)} />
        <Campo etichetta="Società (piè di pagina)" valore={t.societa} onValore={(v) => set('societa', v)} placeholder="es. STUDIO SRL" />
        <Campo etichetta="Iniziali redattore" valore={t.iniziali} onValore={(v) => set('iniziali', v)} placeholder="es. F.D." />
        <Campo etichetta="Revisione" valore={t.revisione} onValore={(v) => set('revisione', v)} />
      </div>
      <ProfessionistaVvfForm tecnico={t} onCambia={(v) => set('vvf', v)} />
      <CartaIntestata />
    </details>
  );
}
