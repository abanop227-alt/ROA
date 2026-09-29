import { useCallback, useEffect, useRef, useState } from 'react';
import { generaAggiornamenti, type EsitoAggiornamenti } from '../lib/aggiornamenti';
import { cartellaSupportata, permessoScrittura, scegliCartella, scriviNellArchivio, zipDeiFile } from '../lib/archivio';
import { elencoLavori, esportaElencoLavoriXlsx, leggiCommesseXlsx } from '../lib/commesse';
import { scarica } from '../lib/condividi';
import {
  elencaSopralluoghi,
  elencaStabili,
  leggiCartellaArchivio,
  leggiCommesseImportate,
  leggiFileStabili,
  leggiImpostazione,
  leggiTecnico,
  salvaImpostazione,
  salvaCartellaArchivio,
  salvaCommesseImportate,
  type CommesseImportate,
} from '../lib/db';
import { amministrazioni, creaResoconto, mesePrecedente, nomeMese } from '../lib/resoconto';
import { nomeFileResoconto, resocontoDocx, resocontoXlsx } from '../lib/resocontoDocs';
import type { Stabile } from '../lib/stabili';
import type { Sopralluogo } from '../lib/types';
import { dataItaliana } from '../lib/util';

/** Elenco lavori sempre aggiornato, resoconto mensile per amministrazione e aggiornamento dei file dell'archivio. */
export default function ElencoLavoriResoconti() {
  const input = useRef<HTMLInputElement>(null);
  const [importate, setImportate] = useState<CommesseImportate | undefined>();
  const [sopralluoghi, setSopralluoghi] = useState<Sopralluogo[]>([]);
  const [stabili, setStabili] = useState<Stabile[]>([]);
  const [amm, setAmm] = useState('');
  const [mese, setMese] = useState(mesePrecedente());
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [cartella, setCartella] = useState<FileSystemDirectoryHandle | undefined>();
  const [esito, setEsito] = useState<EsitoAggiornamenti | null>(null);
  const [occupato, setOccupato] = useState(false);
  const [automatico, setAutomatico] = useState(false);
  const avviato = useRef(false);

  const carica = useCallback(async () => {
    const [i, s, st, c] = await Promise.all([leggiCommesseImportate(), elencaSopralluoghi(), elencaStabili(), leggiCartellaArchivio().catch(() => undefined)]);
    setImportate(i);
    setSopralluoghi(s);
    setStabili(st);
    setCartella(c);
  }, []);
  useEffect(() => {
    carica().catch(() => {});
    leggiImpostazione<boolean>('archivioAuto').then((v) => setAutomatico(!!v)).catch(() => {});
  }, [carica]);

  const righe = elencoLavori(importate?.righe ?? [], sopralluoghi);
  const elenco = amministrazioni(righe, stabili);
  const scelta = amm || elenco[0] || '';

  // aggiornamento automatico all'apertura (solo dove il permesso di scrittura è già concesso)
  useEffect(() => {
    if (!automatico || !cartella || avviato.current || !importate) return;
    avviato.current = true;
    permessoScrittura(cartella, false).then((ok) => {
      if (ok) void aggiornaArchivio(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [automatico, cartella, importate]);

  async function importa(file: File) {
    try {
      const c = await leggiCommesseXlsx(await file.arrayBuffer());
      await salvaCommesseImportate({ righe: c, file: file.name, importato: Date.now() });
      await carica();
      setMessaggio(`Elenco lavori importato: ${c.length} commesse da ${file.name}.`);
    } catch (e) {
      setMessaggio((e as Error).message);
    }
  }

  async function scaricaResoconto(tipo: 'docx' | 'xlsx') {
    const r = creaResoconto(scelta, mese, righe, stabili);
    if (tipo === 'docx') scarica(await resocontoDocx(r, await leggiTecnico()), nomeFileResoconto(r, 'docx'));
    else scarica(await resocontoXlsx(r), nomeFileResoconto(r, 'xlsx'));
  }

  async function preparaFile(): Promise<EsitoAggiornamenti> {
    const fileStabili = new Map<string, Blob>();
    for (const o of new Set(stabili.map((s) => s.origine))) {
      const b = await leggiFileStabili(o);
      if (b) fileStabili.set(o, b);
    }
    return generaAggiornamenti({ commesseImportate: importate?.righe ?? [], sopralluoghi, stabili, fileStabili, tecnico: await leggiTecnico(), mese });
  }

  async function aggiornaArchivio(conGesto: boolean) {
    setOccupato(true);
    setMessaggio(null);
    try {
      const e = await preparaFile();
      setEsito(e);
      if (cartella && (await permessoScrittura(cartella, conGesto))) {
        const scritti = await scriviNellArchivio(cartella, e.file);
        setMessaggio(`Archivio aggiornato: ${scritti.length} file scritti in “${cartella.name}/_AGGIORNAMENTI”.`);
      } else if (!cartella) setMessaggio('Scegli prima la cartella dell’archivio (oppure scarica lo ZIP).');
      else setMessaggio('Serve il permesso di scrittura nella cartella: premi di nuovo “Aggiorna archivio”.');
    } catch (err) {
      setMessaggio(`Errore: ${(err as Error).message}`);
    } finally {
      setOccupato(false);
    }
  }

  async function scaricaZip() {
    setOccupato(true);
    try {
      const e = await preparaFile();
      setEsito(e);
      scarica(await zipDeiFile(e.file), `AGGIORNAMENTI ${new Date().toISOString().slice(0, 10)}.zip`);
    } finally {
      setOccupato(false);
    }
  }

  const modificheTotali = esito ? Object.values(esito.modifiche).reduce((n, l) => n + l.length, 0) : 0;

  return (
    <>
      <h2 className="titolo-sezione">Elenco lavori e resoconti</h2>
      <p className="muto piccolo">
        L’elenco lavori si aggiorna da solo con lo stato delle pratiche (ROA, SCIA, rinnovi con numero di commessa). Importa una volta
        “ELENCO LAVORI 2026.xlsx” per avere anche le commesse precedenti.
      </p>
      {messaggio && (
        <p className="promemoria" role="status">
          {messaggio}
        </p>
      )}
      <div className="card">
        <p>
          <strong>{righe.length}</strong> commesse
          {importate ? ` (${importate.righe.length} importate da ${importate.file} il ${dataItaliana(new Date(importate.importato).toISOString().slice(0, 10))})` : ' (nessun file importato)'}
        </p>
        <div className="riga-pulsanti">
          <button className="btn" onClick={() => input.current?.click()}>
            Importa elenco lavori (Excel)
          </button>
          <button className="btn" disabled={!righe.length} onClick={async () => scarica(await esportaElencoLavoriXlsx(righe), 'ELENCO LAVORI aggiornato.xlsx')}>
            Scarica elenco aggiornato
          </button>
        </div>
        <input
          ref={input}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) importa(f);
          }}
        />
      </div>

      <h3 className="titolo-sezione">Resoconto mensile per amministrazione</h3>
      <div className="card">
        <div className="griglia-2">
          <label className="campo">
            <span className="campo-etichetta">Amministrazione</span>
            <select value={scelta} onChange={(e) => setAmm(e.target.value)}>
              {elenco.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span className="campo-etichetta">Mese ({nomeMese(mese)})</span>
            <input type="month" value={mese} onChange={(e) => setMese(e.target.value)} />
          </label>
        </div>
        <div className="riga-pulsanti">
          <button className="btn btn-primario" disabled={!scelta} onClick={() => scaricaResoconto('docx')}>
            Resoconto Word
          </button>
          <button className="btn" disabled={!scelta} onClick={() => scaricaResoconto('xlsx')}>
            Resoconto Excel
          </button>
        </div>
        <p className="muto piccolo">Lavori completati e consegnati nel mese, lavori in corso e scadenze dei 12 mesi successivi: da discutere con l’amministrazione.</p>
      </div>

      <h3 className="titolo-sezione">Aggiornamento dell’archivio</h3>
      <div className="card">
        <p className="muto piccolo">
          Genera elenco lavori, elenchi stabili di ogni amministrazione (copia con ROA, SCIA, rinnovo e scadenza aggiornati) e resoconti del mese.
          Gli originali non vengono toccati: i file nuovi vanno nella cartella <code>_AGGIORNAMENTI</code>.
        </p>
        <div className="riga-pulsanti">
          {cartellaSupportata() && (
            <button
              className="btn"
              onClick={async () => {
                try {
                  const h = await scegliCartella();
                  await salvaCartellaArchivio(h);
                  setCartella(h);
                } catch {
                  /* scelta annullata */
                }
              }}
            >
              {cartella ? `Cartella: ${cartella.name}` : 'Scegli cartella archivio'}
            </button>
          )}
          {cartella && (
            <button className="btn btn-primario" disabled={occupato} onClick={() => aggiornaArchivio(true)}>
              {occupato ? 'Aggiorno…' : 'Aggiorna archivio'}
            </button>
          )}
          <button className="btn" disabled={occupato} onClick={scaricaZip}>
            Scarica tutto (ZIP)
          </button>
        </div>
        {cartella && (
          <label className="riga-check">
            <input
              type="checkbox"
              checked={automatico}
              onChange={(e) => {
                setAutomatico(e.target.checked);
                salvaImpostazione('archivioAuto', e.target.checked).catch(() => {});
              }}
            />
            <span>Aggiorna da solo quando apro l’app su questo computer</span>
          </label>
        )}
        {esito && (
          <div className="esito-aggiornamenti">
            <p>
              <strong>{esito.file.length}</strong> file · {modificheTotali} celle aggiornate negli elenchi stabili
            </p>
            {esito.avvisi.map((a) => (
              <p key={a} className="piccolo errore">
                ⚠ {a}
              </p>
            ))}
            <ul className="lista-file">
              {esito.file.map((f) => (
                <li key={[...f.cartella, f.nome].join('/')}>
                  <span>
                    {f.nome} <span className="muto">({f.descrizione})</span>
                  </span>
                </li>
              ))}
            </ul>
            {modificheTotali > 0 && (
              <details>
                <summary>Modifiche agli elenchi stabili</summary>
                {Object.entries(esito.modifiche).flatMap(([file, l]) =>
                  l.map((m) => (
                    <p key={`${file}${m.foglio}${m.riga}${m.colonna}`} className="piccolo">
                      {m.indirizzo} · {m.colonna.toUpperCase()}: <span className="muto">{m.prima || '(vuoto)'}</span> → <strong>{m.dopo}</strong>
                    </p>
                  )),
                )}
              </details>
            )}
          </div>
        )}
      </div>
    </>
  );
}
