import { useCallback, useEffect, useRef, useState } from 'react';
import { migraSopralluogo, sincronizza, titoloBreve } from '../lib/catalogo';
import { condividi, fileDaBlob, isMobile, puoCondividere, scarica } from '../lib/condividi';
import { impostaAperto, programmaSync } from '../lib/autosync';
import { leggiCartaIntestata, leggiFoto, leggiSopralluogo, leggiTecnico, salvaSopralluogo } from '../lib/db';
import { praticaDi } from '../lib/pratiche';
import type { Catalogo, Sopralluogo, TipoPratica } from '../lib/types';
import Step1Attivita from './Step1Attivita';
import Step2Condominio from './Step2Condominio';
import Step3Voci, { TabsAttivita, CARTELLI } from './Step3Voci';
import Step4Riepilogo from './Step4Riepilogo';
import StatoPratica from './StatoPratica';
import StepIdranti from './StepIdranti';
import StepModuli from './StepModuli';
import StepPratica from './StepPratica';

type IdPasso = 'attivita' | 'condominio' | 'voci' | 'idranti' | 'riepilogo' | 'pratica' | 'moduli';
const NOME_PASSO: Record<IdPasso, string> = {
  attivita: 'Attività',
  condominio: 'Condominio',
  voci: 'Voci',
  idranti: 'Idranti',
  riepilogo: 'Riepilogo',
  pratica: 'Pratica',
  moduli: 'Moduli',
};
/** Passi del wizard per tipo di pratica. */
const PASSI_TIPO: Record<TipoPratica, IdPasso[]> = {
  roa: ['attivita', 'condominio', 'voci', 'idranti', 'riepilogo'],
  rinnovo: ['attivita', 'condominio', 'pratica', 'idranti', 'moduli'],
  scia: ['attivita', 'condominio', 'pratica', 'moduli'],
};

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
  const [docIdranti, setDocIdranti] = useState<DocGenerato | null>(null);
  const [generazioneIdranti, setGenerazioneIdranti] = useState(false);
  const [erroreDoc, setErroreDoc] = useState<string | null>(null);
  const daSalvare = useRef<Sopralluogo | null>(null);
  const timer = useRef<number | undefined>(undefined);

  // aperto nell'editor: le versioni in arrivo da altri dispositivi lo aggiornano alla chiusura
  useEffect(() => {
    impostaAperto(id);
    return () => {
      impostaAperto(null);
      programmaSync(1000);
    };
  }, [id]);

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
      programmaSync(5000);
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
      setDocIdranti(null);
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

  /** Genera un Word (ROA o prova idranti), lo scarica o lo condivide dal telefono. */
  async function generaDocumento(tipo: 'roa' | 'idranti') {
    if (!s) return;
    const idranti = tipo === 'idranti';
    (idranti ? setGenerazioneIdranti : (v: boolean) => setGenerazione(v ? 'in-corso' : 'no'))(true);
    setErroreDoc(null);
    try {
      await salvaOra();
      const [{ generaDocxBlob, nomeFileDocx }, { generaDocxIdrantiBlob, nomeFileIdranti }] = await Promise.all([import('../lib/docx'), import('../lib/docxIdranti')]);
      const tecnico = await leggiTecnico();
      const carta = await leggiCartaIntestata().catch(() => undefined);
      const cartaIntestata = carta
        ? { data: new Uint8Array(await carta.blob.arrayBuffer()), width: carta.width, height: carta.height }
        : null;
      const caricaFoto = async (fid: string) => {
        const f = await leggiFoto(fid);
        return f ? { data: new Uint8Array(await f.blob.arrayBuffer()), width: f.width, height: f.height } : null;
      };
      const blob = await (idranti ? generaDocxIdrantiBlob : generaDocxBlob)(s, catalogo, tecnico, caricaFoto, { cartaIntestata });
      const file = fileDaBlob(blob, idranti ? nomeFileIdranti(s) : nomeFileDocx(s));
      const condivisibile = isMobile() && puoCondividere(file);
      (idranti ? setDocIdranti : setDoc)({ file, condivisibile });
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
      (idranti ? setGenerazioneIdranti : (v: boolean) => setGenerazione(v ? 'in-corso' : 'no'))(false);
    }
  }
  const generaWord = () => generaDocumento('roa');

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

  const passi = PASSI_TIPO[praticaDi(s).tipo];
  const corrente: IdPasso = passi[Math.min(passo, passi.length - 1)];
  const ultimo = passo >= passi.length - 1;

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
          {passi.map((id, i) => (
            <button
              key={id}
              className={`passo ${i === passo ? 'attivo' : ''} ${i < passo ? 'fatto' : ''}`}
              aria-current={i === passo ? 'step' : undefined}
              onClick={() => onPasso(i)}
            >
              <span className="passo-num">{i < passo ? '✓' : i + 1}</span>
              <span className="passo-nome">{NOME_PASSO[id]}</span>
            </button>
          ))}
        </nav>
        {corrente === 'voci' && s.attivita.length > 0 && <TabsAttivita s={s} tab={tab} onTab={setTab} />}
      </header>

      <main className="contenuto con-barra">
        {corrente === 'attivita' && <Step1Attivita s={s} catalogo={catalogo} aggiorna={aggiorna} />}
        {corrente === 'condominio' && <Step2Condominio s={s} catalogo={catalogo} aggiorna={aggiorna} />}
        {corrente === 'voci' && (
          <Step3Voci s={s} catalogo={catalogo} tab={tab} aggiorna={aggiorna} onVaiAttivita={() => onPasso(0)} />
        )}
        {corrente === 'idranti' && <StepIdranti s={s} aggiorna={aggiorna} />}
        {corrente === 'pratica' && <StepPratica s={s} aggiorna={aggiorna} />}
        {corrente === 'moduli' && <StepModuli s={s} aggiorna={aggiorna} />}
        {corrente === 'riepilogo' && (
          <>
          <section>
            <h2 className="titolo-passo">Stato della pratica</h2>
            <StatoPratica s={s} aggiorna={aggiorna} />
          </section>
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
            onVaiPasso={onPasso}
            onGeneraIdranti={() => generaDocumento('idranti')}
            generazioneIdranti={generazioneIdranti}
            docIdranti={docIdranti}
          />
          </>
        )}
      </main>

      <footer className="barra-navigazione">
        <button className="btn btn-grande" onClick={() => (passo === 0 ? onEsci() : onPasso(passo - 1))}>
          ‹ {passo === 0 ? 'Elenco' : 'Indietro'}
        </button>
        {ultimo && corrente === 'riepilogo' ? (
          <button className="btn btn-grande btn-primario" onClick={generaWord} disabled={generazione === 'in-corso'}>
            {generazione === 'in-corso' ? 'Genero…' : 'Genera Word'}
          </button>
        ) : ultimo ? (
          <button className="btn btn-grande btn-primario" onClick={onEsci}>
            Fine
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
