import { useEffect, useRef, useState } from 'react';
import { esportaBackup, importaBackup } from '../lib/backup';
import { nuovoSopralluogo, validaCatalogo, vociVisibili } from '../lib/catalogo';
import { scarica } from '../lib/condividi';
import {
  duplicaSopralluogo,
  elencaSopralluoghi,
  eliminaSopralluogo,
  salvaCatalogoPersonalizzato,
  salvaSopralluogo,
} from '../lib/db';
import type { Catalogo, Sopralluogo } from '../lib/types';
import { dataItaliana, oggiISO } from '../lib/util';

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
  const inputBackup = useRef<HTMLInputElement>(null);
  const inputLibreria = useRef<HTMLInputElement>(null);

  const ricarica = () => elencaSopralluoghi().then(setElenco).catch(() => setElenco([]));
  useEffect(() => {
    ricarica();
  }, []);

  async function nuovo() {
    const s = nuovoSopralluogo(catalogo);
    await salvaSopralluogo(s);
    onApri(s.id);
  }

  async function duplica(id: string) {
    setMenuAperto(null);
    const c = await duplicaSopralluogo(id);
    await ricarica();
    if (c) setMessaggio(`Creata la copia “${c.condominio.committente}”.`);
  }

  async function elimina(s: Sopralluogo) {
    setMenuAperto(null);
    const nome = s.condominio.committente || 'senza nome';
    if (!confirm(`Eliminare definitivamente il sopralluogo “${nome}” con tutte le sue foto?`)) return;
    await eliminaSopralluogo(s.id);
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
      setMessaggio(`Libreria caricata: ${c.attivita.length} attività, ${c.voci.length} voci.`);
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
          <h1>ROA Antincendio</h1>
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
        <ul className="lista-sopralluoghi">
          {elenco?.map((s) => {
            const sel = vociVisibili(s).filter((v) => v.selezionata);
            const foto = sel.reduce((n, v) => n + v.fotoIds.length, 0);
            return (
              <li key={s.id} className="card sopralluogo">
                <button className="sopralluogo-apri" onClick={() => onApri(s.id)}>
                  <strong>{s.condominio.committente || 'Senza nome'}</strong>
                  <span className="muto">
                    {[s.condominio.indirizzo, s.condominio.comune].filter(Boolean).join(', ') || 'Indirizzo non indicato'}
                  </span>
                  <span className="meta">
                    {dataItaliana(s.condominio.dataSopralluogo)}
                    {s.attivita.length > 0 && ` · ${s.attivita.map((a) => a.codice).join(', ')}`}
                    {` · ${sel.length} voci · ${foto} foto`}
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

        <h2 className="titolo-sezione">Backup</h2>
        <p className="muto piccolo">
          Salva tutti i sopralluoghi (foto comprese) in un file .json per passarli dal telefono al PC, o viceversa.
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
          {catalogo.voci.length} voci. Puoi caricare un roa-dati.json modificato per aggiungere voci e attività.
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
