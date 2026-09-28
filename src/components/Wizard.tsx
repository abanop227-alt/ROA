import { useCallback, useEffect, useRef, useState } from 'react';
import { migraSopralluogo, sincronizza, titoloBreve } from '../lib/catalogo';
import { condividi, fileDaBlob, isMobile, puoCondividere, scarica } from '../lib/condividi';
import { leggiCartaIntestata, leggiFoto, leggiSopralluogo, leggiTecnico, salvaSopralluogo } from '../lib/db';
import type { Catalogo, Sopralluogo } from '../lib/types';
import Step1Attivita from './Step1Attivita';
import Step2Condominio from './Step2Condominio';
import Step3Voci, { TabsAttivita, CARTELLI } from './Step3Voci';
import Step4Riepilogo from './Step4Riepilogo';

const PASSI = ['Attività', 'Condominio', 'Voci', 'Riepilogo'];

type StatoSalvataggio = 'salvato' | 'modificato' | 'errore';

export interface DocGenerato {
  file: File;
  condivisibile: boolean;
}

interface Props {
  id: string;
  passo: number;
  catalogo: Catalogo;
  onPasso: (p: number) => void;
  onEsci: () => void;
}

export default function Wizard({ id, passo, catalogo, onPasso, onEsci }: Props) {
  const [s, setS] = useState<Sopralluogo | null | undefined>(undefined);
  const [stato, setStato] = useState<StatoSalvataggio>('salvato');
  const [tab, setTab] = useState<string>('');
  const [generazione, setGenerazione] = useState<'no' | 'in-corso'>('no');
  const [doc, setDoc] = useState<DocGenerato | null>(null);
  const [erroreDoc, setErroreDoc] = useState<string | null>(null);
  const daSalvare = useRef<Sopralluogo | null>(null);
  const timer = useRef<number | undefined>(undefined);

  // ---- caricamento ----
  useEffect(() => {
    leggiSopralluogo(id)
      .then((x) => setS(x ? sincronizza(migraSopralluogo(x, catalogo), catalogo) : null))
      .catch(() => setS(null));
  }, [id, catalogo]);

  // ---- salvataggio automatico ----
  const salvaOra = useCallback(async () => {
    window.clearTimeout(timer.current);
    const x = daSalvare.current;
    if (!x) return;
    daSalvare.current = null;
    try {
      await salvaSopralluogo(x);
      setStato((st) => (daSalvare.current ? st : 'salvato'));
    } catch {
      setStato('errore');
    }
  }, []);

  const aggiorna = useCallback(
    (f: (x: Sopralluogo) => Sopralluogo) => {
      setS((prec) => {
        if (!prec) return prec;
        const nuovo = sincronizza({ ...f(prec), modificato: Date.now() }, catalogo);
        daSalvare.current = nuovo;
        return nuovo;
      });
      setStato('modificato');
      setDoc(null);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(salvaOra, 400);
    },
    [catalogo, salvaOra],
  );

  useEffect(() => {
    const suNascondi = () => {
      if (document.visibilityState === 'hidden') salvaOra();
    };
    document.addEventListener('visibilitychange', suNascondi);
    window.addEventListener('pagehide', salvaOra);
    return () => {
      document.removeEventListener('visibilitychange', suNascondi);
      window.removeEventListener('pagehide', salvaOra);
      salvaOra();
    };
  }, [salvaOra]);

  // tab attivo valido
  useEffect(() => {
    if (!s) return;
    const codici = s.attivita.map((a) => a.codice);
    if (tab !== CARTELLI && !codici.includes(tab)) setTab(codici[0] ?? '');
  }, [s, tab]);

  // torna in cima quando cambia passo
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [passo]);

  async function generaWord() {
    if (!s) return;
    setGenerazione('in-corso');
    setErroreDoc(null);
    try {
      await salvaOra();
      const { generaDocxBlob, nomeFileDocx } = await import('../lib/docx');
      const tecnico = await leggiTecnico();
      const carta = await leggiCartaIntestata().catch(() => undefined);
      const cartaIntestata = carta
        ? { data: new Uint8Array(await carta.blob.arrayBuffer()), width: carta.width, height: carta.height }
        : null;
      const blob = await generaDocxBlob(
        s,
        catalogo,
        tecnico,
        async (fid) => {
          const f = await leggiFoto(fid);
          return f ? { data: new Uint8Array(await f.blob.arrayBuffer()), width: f.width, height: f.height } : null;
        },
        { cartaIntestata },
      );
      const file = fileDaBlob(blob, nomeFileDocx(s));
      const condivisibile = isMobile() && puoCondividere(file);
      setDoc({ file, condivisibile });
      if (condivisibile) {
        try {
          await condividi(file, file.name);
        } catch {
          /* gesto utente scaduto: resta il pulsante "Condividi" */
        }
      } else {
        scarica(file, file.name);
      }
    } catch (e) {
      console.error(e);
      setErroreDoc(`Errore nella generazione del documento: ${(e as Error).message}`);
    } finally {
      setGenerazione('no');
    }
  }

  if (s === undefined) return <div className="caricamento">Caricamento…</div>;
  if (s === null) {
    return (
      <div className="contenuto">
        <p>Sopralluogo non trovato.</p>
        <button className="btn btn-primario" onClick={onEsci}>
          Torna all'elenco
        </button>
      </div>
    );
  }

  const ultimo = passo === PASSI.length - 1;

  return (
    <div className="wizard">
      <header className="appbar">
        <div className="appbar-riga">
          <button className="btn-icona btn-indietro" onClick={onEsci} aria-label="Torna all'elenco">
            ‹
          </button>
          <h1 className="titolo-sopralluogo">{titoloBreve(s) || 'Nuovo sopralluogo'}</h1>
          <span className={`stato-salvataggio ${stato}`} aria-live="polite">
            {stato === 'salvato' ? '✓ Salvato' : stato === 'modificato' ? 'Salvataggio…' : '⚠ Non salvato'}
          </span>
        </div>
        <nav className="stepper" aria-label="Passi">
          {PASSI.map((nome, i) => (
            <button
              key={nome}
              className={`passo ${i === passo ? 'attivo' : ''} ${i < passo ? 'fatto' : ''}`}
              aria-current={i === passo ? 'step' : undefined}
              onClick={() => onPasso(i)}
            >
              <span className="passo-num">{i < passo ? '✓' : i + 1}</span>
              <span className="passo-nome">{nome}</span>
            </button>
          ))}
        </nav>
        {passo === 2 && s.attivita.length > 0 && <TabsAttivita s={s} tab={tab} onTab={setTab} />}
      </header>

      <main className="contenuto con-barra">
        {passo === 0 && <Step1Attivita s={s} catalogo={catalogo} aggiorna={aggiorna} />}
        {passo === 1 && <Step2Condominio s={s} aggiorna={aggiorna} />}
        {passo === 2 && (
          <Step3Voci s={s} catalogo={catalogo} tab={tab} aggiorna={aggiorna} onVaiAttivita={() => onPasso(0)} />
        )}
        {passo === 3 && (
          <Step4Riepilogo
            s={s}
            catalogo={catalogo}
            aggiorna={aggiorna}
            onGenera={generaWord}
            generazione={generazione === 'in-corso'}
            doc={doc}
            erroreDoc={erroreDoc}
            onCondividi={() => doc && condividi(doc.file, doc.file.name).catch((e) => setErroreDoc(String(e)))}
            onScarica={() => doc && scarica(doc.file, doc.file.name)}
          />
        )}
      </main>

      <footer className="barra-navigazione">
        <button className="btn btn-grande" onClick={() => (passo === 0 ? onEsci() : onPasso(passo - 1))}>
          ‹ {passo === 0 ? 'Elenco' : 'Indietro'}
        </button>
        {ultimo ? (
          <button className="btn btn-grande btn-primario" onClick={generaWord} disabled={generazione === 'in-corso'}>
            {generazione === 'in-corso' ? 'Genero…' : 'Genera Word'}
          </button>
        ) : (
          <button className="btn btn-grande btn-primario" onClick={() => onPasso(passo + 1)}>
            Avanti ›
          </button>
        )}
      </footer>
    </div>
  );
}
