import { useEffect, useRef, useState } from 'react';
import { eliminaFoto, leggiFoto, salvaFoto } from '../lib/db';
import { ridimensionaFoto } from '../lib/foto';
import { nuovoId } from '../lib/util';

interface Props {
  sopralluogoId: string;
  fotoIds: string[];
  onAggiunte: (ids: string[]) => void;
  onRimossa: (id: string) => void;
}

function Miniatura({ id, onElimina }: { id: string; onElimina: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [ingrandita, setIngrandita] = useState(false);
  useEffect(() => {
    let u: string | null = null;
    let vivo = true;
    leggiFoto(id).then((f) => {
      if (!f || !vivo) return;
      u = URL.createObjectURL(f.blob);
      setUrl(u);
    });
    return () => {
      vivo = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [id]);
  return (
    <div className="miniatura">
      {url ? (
        <img src={url} alt="Foto del sopralluogo" onClick={() => setIngrandita(true)} />
      ) : (
        <div className="miniatura-vuota" />
      )}
      <button className="miniatura-elimina" aria-label="Elimina foto" onClick={onElimina}>
        ×
      </button>
      {ingrandita && url && (
        <div className="lightbox" onClick={() => setIngrandita(false)} role="dialog" aria-label="Foto ingrandita">
          <img src={url} alt="" />
        </div>
      )}
    </div>
  );
}

export default function FotoVoce({ sopralluogoId, fotoIds, onAggiunte, onRimossa }: Props) {
  const camera = useRef<HTMLInputElement>(null);
  const galleria = useRef<HTMLInputElement>(null);
  const [inCorso, setInCorso] = useState(0);
  const [errore, setErrore] = useState<string | null>(null);

  async function aggiungi(files: FileList | null) {
    if (!files?.length) return;
    const lista = Array.from(files);
    setErrore(null);
    setInCorso(lista.length);
    const ids: string[] = [];
    // una alla volta: con molte foto da 12 MP il telefono esaurirebbe la memoria
    for (const file of lista) {
      try {
        const r = await ridimensionaFoto(file);
        const id = nuovoId('f-');
        await salvaFoto({ id, sopralluogoId, blob: r.blob, type: r.type, width: r.width, height: r.height, creato: Date.now() });
        ids.push(id);
      } catch (e) {
        console.error(e);
        setErrore('Una o più foto non sono state lette (formato non supportato?).');
      }
      setInCorso((n) => n - 1);
    }
    if (ids.length) onAggiunte(ids);
    setInCorso(0);
  }

  async function elimina(id: string) {
    if (!confirm('Eliminare questa foto?')) return;
    onRimossa(id);
    await eliminaFoto(id);
  }

  const input = (ref: React.RefObject<HTMLInputElement | null>, conCamera: boolean) => (
    <input
      ref={ref}
      type="file"
      accept="image/*"
      {...(conCamera ? { capture: 'environment' as const } : {})}
      multiple
      hidden
      onChange={(e) => {
        const f = e.target.files;
        aggiungi(f).finally(() => (e.target.value = ''));
      }}
    />
  );

  return (
    <div className="foto">
      <span className="campo-etichetta">Foto</span>
      <div className="riga-pulsanti">
        <button className="btn btn-primario btn-grande" onClick={() => camera.current?.click()} disabled={inCorso > 0}>
          📷 Scatta foto
        </button>
        <button className="btn btn-grande" onClick={() => galleria.current?.click()} disabled={inCorso > 0}>
          Galleria
        </button>
      </div>
      {input(camera, true)}
      {input(galleria, false)}
      {inCorso > 0 && <p className="muto piccolo">Elaboro {inCorso} foto…</p>}
      {errore && <p className="errore">{errore}</p>}
      {fotoIds.length > 0 && (
        <div className="miniature">
          {fotoIds.map((id) => (
            <Miniatura key={id} id={id} onElimina={() => elimina(id)} />
          ))}
        </div>
      )}
    </div>
  );
}
