import { useEffect, useRef, useState } from 'react';
import { STUDIO } from '../config/studio';
import { esportaBackup, importaBackup } from '../lib/backup';
import { migraSopralluogo, nuovoSopralluogo, titoloBreve, validaCatalogo, vociSelezionate } from '../lib/catalogo';
import { scarica } from '../lib/condividi';
import {
  duplicaSopralluogo,
  elencaSopralluoghi,
  eliminaSopralluogo,
  salvaCatalogoPersonalizzato,
  salvaSopralluogo,
} from '../lib/db';
import type { Catalogo, Sopralluogo } from '../lib/types';
import ImpostazioniTecnico from './ImpostazioniTecnico';
import Sincronizzazione from './Sincronizzazione';
import { programmaSync, type StatoAutoSync } from '../lib/autosync';
import { leggiConfigSync, registraEliminazione } from '../lib/sync';
import { dataItaliana, oggiISO } from '../lib/util';
import { NOME_STATO, STATI, TIPI, conStato, motivoSciaBloccata, nomeStato, nuovaPraticaDa, praticaDi, praticaVuota, puoCreareScia } from '../lib/pratiche';
import type { StatoPratica, TipoPratica } from '../lib/types';

interface Props {
  catalogo: Catalogo;
  catalogoPersonalizzato: boolean;
  onCatalogoCambiato: () => void;
  onApri: (id: string) => void;
}

export default function Home({ catalogo, catalogoPersonalizzato, onCatalogoCambiato, onApri }: Props) {
  const [elenco, setElenco] = useState<Sopralluogo[] | null>(null);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [menuAperto, setMenuAperto] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'tutti' | TipoPratica>('tutti');
  const [cerca, setCerca] = useState('');
  const inputBackup = useRef<HTMLInputElement>(null);
  const inputLibreria = useRef<HTMLInputElement>(null);

  const ricarica = () =>
    elencaSopralluoghi()
      .then((l) => setElenco(l.map((x) => migraSopralluogo(x, catalogo))))
      .catch(() => setElenco([]));
  useEffect(() => {
    ricarica();
    // arrivati sopralluoghi da altri dispositivi: aggiorna l'elenco
    const agg = (e: Event) => {
      const d = (e as CustomEvent<StatoAutoSync>).detail;
      if (d.stato === 'ok' && (d.esito.ricevuti || d.esito.eliminati)) ricarica();
    };
    window.addEventListener('roa-sync', agg);
    return () => window.removeEventListener('roa-sync', agg);
  }, []);

  async function nuovo() {
    const s = nuovoSopralluogo();
    const nome = (await leggiConfigSync().catch(() => undefined))?.nome?.trim();
    if (nome) s.pratica = { ...praticaVuota('roa'), referente: nome };
    await salvaSopralluogo(s);
    onApri(s.id);
  }

  async function creaDa(s: Sopralluogo, tipo: 'scia' | 'rinnovo') {
    setMenuAperto(null);
    const nuova = nuovaPraticaDa(s, tipo);
    await salvaSopralluogo(nuova);
    programmaSync(1000);
    onApri(nuova.id);
  }

  async function cambiaStato(s: Sopralluogo, stato: StatoPratica) {
    await salvaSopralluogo({ ...conStato(s, stato), modificato: Date.now() });
    programmaSync(1000);
    await ricarica();
  }

  async function duplica(id: string) {
    setMenuAperto(null);
    const c = await duplicaSopralluogo(id);
    programmaSync();
    await ricarica();
    if (c) setMessaggio(`Creata la copia “${titoloBreve(c) || 'sopralluogo'}”.`);
  }

  async function elimina(s: Sopralluogo) {
    setMenuAperto(null);
    const nome = titoloBreve(s) || 'senza nome';
    if (!confirm(`Eliminare definitivamente il sopralluogo “${nome}” con tutte le sue foto?`)) return;
    await eliminaSopralluogo(s.id);
    await registraEliminazione(s.id);
    programmaSync(1000);
    await ricarica();
    setMessaggio('Sopralluogo eliminato.');
  }

  async function esporta(ids?: string[]) {
    setMenuAperto(null);
    const blob = await esportaBackup(ids);
    scarica(blob, `ROA_backup_${oggiISO()}.json`);
  }

  async function importa(file: File) {
    try {
      const e = await importaBackup(await file.text());
      programmaSync(1000);
      await ricarica();
      setMessaggio(
        `Importati ${e.importati} sopralluoghi (${e.foto} foto).` +
          (e.saltati ? ` ${e.saltati} già presenti in versione uguale o più recente: non modificati.` : ''),
      );
    } catch (err) {
      setMessaggio((err as Error).message);
    }
  }

  async function importaLibreria(file: File) {
    try {
      const c = validaCatalogo(JSON.parse(await file.text()));
      await salvaCatalogoPersonalizzato(c);
      onCatalogoCambiato();
      setMessaggio(`Libreria caricata: ${c.attivita.length} attività, ${c.famiglie.length} gruppi di attività.`);
    } catch (err) {
      setMessaggio(err instanceof SyntaxError ? 'Il file non è un JSON valido.' : (err as Error).message);
    }
  }

  async function ripristinaLibreria() {
    if (!confirm('Tornare alla libreria predefinita? I sopralluoghi già fatti non cambiano.')) return;
    await salvaCatalogoPersonalizzato(null);
    onCatalogoCambiato();
    setMessaggio('Ripristinata la libreria predefinita.');
  }

  return (
    <div className="home">
      <header className="appbar">
        <div className="appbar-riga">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="logo" />
          <h1>{STUDIO.prodotto}</h1>
        </div>
      </header>

      <main className="contenuto">
        {messaggio && (
          <div className="avviso" role="status" onClick={() => setMessaggio(null)}>
            {messaggio}
            <span className="avviso-chiudi" aria-hidden>
              ×
            </span>
          </div>
        )}

        <button className="btn btn-primario btn-grande btn-blocco" onClick={nuovo}>
          + Nuovo sopralluogo
        </button>

        <h2 className="titolo-sezione">Sopralluoghi</h2>
        {elenco === null && <p className="muto">Caricamento…</p>}
        {elenco?.length === 0 && <p className="muto">Nessun sopralluogo salvato. Inizia con “Nuovo sopralluogo”.</p>}
        {!!elenco?.length && (
          <div className="filtri">
            <div className="segmentato" role="radiogroup" aria-label="Tipo di pratica">
              {(['tutti', 'roa', 'scia', 'rinnovo'] as const).map((t) => (
                <button key={t} role="radio" aria-checked={filtro === t} className={filtro === t ? 'attivo' : ''} onClick={() => setFiltro(t)}>
                  {t === 'tutti' ? 'Tutte' : TIPI[t]}
                </button>
              ))}
            </div>
            <input type="search" value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca indirizzo, amministrazione, commessa…" aria-label="Cerca" />
          </div>
        )}
        <ul className="lista-sopralluoghi">
          {elenco?.filter((s) => corrisponde(s, filtro, cerca)).map((s) => {
            const sel = vociSelezionate(s);
            const foto = sel.reduce((n, v) => n + v.fotoIds.length, 0);
            const pr = praticaDi(s);
            return (
              <li key={s.id} className="card sopralluogo">
                <button className="sopralluogo-apri" onClick={() => onApri(s.id)}>
                  <strong>{titoloBreve(s) || 'Nuovo sopralluogo'}</strong>
                  <span className="badge-riga">
                    <span className={`badge stato-${pr.stato}`}>
                      {TIPI[pr.tipo]} · {nomeStato(pr)}
                    </span>
                    {pr.referente && <span className="badge">{pr.referente}</span>}
                  </span>
                  <span className="muto">{s.condominio.pressoAmministrazione || 'Amministrazione non indicata'}</span>
                  <span className="meta">
                    {dataItaliana(s.condominio.dataSopralluogo)}
                    {s.attivita.length > 0 && ` · ${s.attivita.map((a) => a.codice).join(', ')}`}
                    {` · ${sel.length} frasi · ${foto} foto`}
                  </span>
                </button>
                <button
                  className="btn-icona"
                  aria-label="Altre azioni"
                  aria-expanded={menuAperto === s.id}
                  onClick={() => setMenuAperto(menuAperto === s.id ? null : s.id)}
                >
                  ⋯
                </button>
                {menuAperto === s.id && (
                  <div className="menu-azioni">
                    <button className="btn" onClick={() => onApri(s.id)}>
                      Apri
                    </button>
                    <label className="campo">
                      <span className="campo-etichetta">Stato</span>
                      <select value={pr.stato} onChange={(e) => cambiaStato(s, e.target.value as StatoPratica)}>
                        {STATI[pr.tipo].map((st) => (
                          <option key={st} value={st}>
                            {NOME_STATO[pr.tipo][st]}
                          </option>
                        ))}
                      </select>
                    </label>
                    {pr.tipo === 'roa' && (
                      <>
                        <button className="btn" onClick={() => creaDa(s, 'scia')} disabled={!puoCreareScia(s)} title={motivoSciaBloccata(s) ?? undefined}>
                          Crea SCIA
                        </button>
                        {!puoCreareScia(s) && <span className="muto piccolo">{motivoSciaBloccata(s)}</span>}
                        <button className="btn" onClick={() => creaDa(s, 'rinnovo')}>
                          Crea rinnovo
                        </button>
                      </>
                    )}
                    <button className="btn" onClick={() => duplica(s.id)}>
                      Duplica
                    </button>
                    <button className="btn" onClick={() => esporta([s.id])}>
                      Esporta
                    </button>
                    <button className="btn btn-pericolo" onClick={() => elimina(s)}>
                      Elimina
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <Sincronizzazione />

        <ImpostazioniTecnico />

        <h2 className="titolo-sezione">Backup</h2>
        <p className="muto piccolo">
          Salva tutti i sopralluoghi (foto e dati del tecnico compresi) in un file .json per passarli dal telefono al PC, o
          viceversa.
        </p>
        <div className="riga-pulsanti">
          <button className="btn" onClick={() => esporta()} disabled={!elenco?.length}>
            Esporta backup
          </button>
          <button className="btn" onClick={() => inputBackup.current?.click()}>
            Importa backup
          </button>
          <input
            ref={inputBackup}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) importa(f);
            }}
          />
        </div>

        <h2 className="titolo-sezione">Libreria voci</h2>
        <p className="muto piccolo">
          {catalogoPersonalizzato ? 'Libreria personalizzata' : 'Libreria predefinita'}: {catalogo.attivita.length} attività,{' '}
          {catalogo.famiglie.reduce((n, f) => n + f.sezioni.reduce((m, x) => m + x.voci.length, 0), 0)} frasi tipo. Puoi
          caricare un roa-dati.json modificato per aggiungere frasi, sezioni e attività.
        </p>
        <div className="riga-pulsanti">
          <button
            className="btn"
            onClick={() =>
              scarica(new Blob([JSON.stringify(catalogo, null, 2)], { type: 'application/json' }), 'roa-dati.json')
            }
          >
            Esporta libreria
          </button>
          <button className="btn" onClick={() => inputLibreria.current?.click()}>
            Carica libreria
          </button>
          {catalogoPersonalizzato && (
            <button className="btn" onClick={ripristinaLibreria}>
              Ripristina predefinita
            </button>
          )}
          <input
            ref={inputLibreria}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) importaLibreria(f);
            }}
          />
        </div>
        <p className="muto piccolo versione">I dati restano solo su questo dispositivo. Funziona anche offline.</p>
      </main>
    </div>
  );
}

function corrisponde(s: Sopralluogo, filtro: 'tutti' | TipoPratica, cerca: string): boolean {
  if (filtro !== 'tutti' && praticaDi(s).tipo !== filtro) return false;
  const q = cerca.trim().toLowerCase();
  if (!q) return true;
  const c = s.condominio;
  return [c.nome, c.indirizzo, c.comune, c.pressoAmministrazione, c.commessa, praticaDi(s).referente].some((t) => t.toLowerCase().includes(q));
}
