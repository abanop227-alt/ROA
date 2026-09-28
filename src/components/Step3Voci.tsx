import { useState } from 'react';
import {
  duplicaSezione,
  famigliaDi,
  spostaSezione,
  spostaVoce,
  nuovaSezionePersonalizzata,
  nuovaVocePersonalizzata,
  sezioniDiAttivita,
  vociDiSezione,
} from '../lib/catalogo';
import type { AttivitaSelezionata, Catalogo, SezioneIstanza, Sopralluogo, VoceIstanza } from '../lib/types';
import { nuovoId } from '../lib/util';
import VoceCard from './VoceCard';

export const CARTELLI = '__cartelli__';

type Aggiorna = (f: (s: Sopralluogo) => Sopralluogo) => void;

export function TabsAttivita({ s, tab, onTab }: { s: Sopralluogo; tab: string; onTab: (t: string) => void }) {
  const conta = (codice: string) => s.voci.filter((v) => v.attivita === codice && v.selezionata).length;
  return (
    <div className="tabs" role="tablist" aria-label="Attività">
      {s.attivita.map((a) => (
        <button
          key={a.codice}
          role="tab"
          aria-selected={tab === a.codice}
          className={`tab ${tab === a.codice ? 'attivo' : ''}`}
          onClick={() => onTab(a.codice)}
        >
          {a.codice} · {conta(a.codice)}
        </button>
      ))}
      <button role="tab" aria-selected={tab === CARTELLI} className={`tab ${tab === CARTELLI ? 'attivo' : ''}`} onClick={() => onTab(CARTELLI)}>
        Cartelli · {s.cartelli.length}
      </button>
    </div>
  );
}

function Sezione({
  s,
  sezione,
  catalogo,
  aggiorna,
}: {
  s: Sopralluogo;
  sezione: SezioneIstanza;
  catalogo: Catalogo;
  aggiorna: Aggiorna;
}) {
  const [chiusa, setChiusa] = useState(false);
  const [menu, setMenu] = useState(false);
  const [aperta, setAperta] = useState<string | null>(null);
  const [riordina, setRiordina] = useState(false);
  const voci = vociDiSezione(s, sezione.key);
  const sezioniAttivita = s.sezioni.filter((x) => x.attivita === sezione.attivita);
  const posSezione = sezioniAttivita.indexOf(sezione);
  const spuntate = voci.filter((v) => v.selezionata).length;
  const eliminabile = !sezione.sezioneId || sezione.key.includes('#');

  function modificaVoce(key: string, f: (v: VoceIstanza) => VoceIstanza) {
    aggiorna((x) => ({ ...x, voci: x.voci.map((v) => (v.key === key ? f(v) : v)) }));
  }

  function rinomina() {
    setMenu(false);
    const t = prompt('Titolo della sezione', sezione.titolo);
    if (t?.trim()) aggiorna((x) => ({ ...x, sezioni: x.sezioni.map((z) => (z.key === sezione.key ? { ...z, titolo: t.trim() } : z)) }));
  }

  function duplica() {
    setMenu(false);
    const t = prompt('Titolo della nuova sezione (es. “Vano scala B”, “Filtro vano scala C”)', `${sezione.titolo} B`);
    if (t?.trim()) aggiorna((x) => duplicaSezione(x, catalogo, sezione.key, t.trim()));
  }

  function elimina() {
    setMenu(false);
    if (!confirm(`Eliminare la sezione “${sezione.titolo}” con le sue frasi e foto?`)) return;
    aggiorna((x) => ({ ...x, sezioni: x.sezioni.filter((z) => z.key !== sezione.key), voci: x.voci.filter((v) => v.sezioneKey !== sezione.key) }));
  }

  function aggiungiFrase() {
    const v = nuovaVocePersonalizzata(sezione);
    aggiorna((x) => ({ ...x, voci: [...x.voci, v] }));
    setChiusa(false);
    setAperta(v.key);
  }

  return (
    <div className="sezione">
      <div className="sezione-testa">
        <button className="sezione-titolo" onClick={() => setChiusa(!chiusa)} aria-expanded={!chiusa}>
          <span className="chevron-sez" aria-hidden>
            {chiusa ? '▸' : '▾'}
          </span>
          <strong>{sezione.titolo}</strong>
          <span className={`badge ${spuntate ? 'badge-ok' : ''}`}>
            {spuntate}/{voci.length}
          </span>
        </button>
        <button className="btn-icona" aria-label="Azioni sezione" aria-expanded={menu} onClick={() => setMenu(!menu)}>
          ⋯
        </button>
      </div>
      {menu && (
        <div className="menu-azioni">
          <button className="btn" onClick={rinomina}>
            Rinomina
          </button>
          <button className="btn" onClick={duplica}>
            Duplica sezione
          </button>
          <button
            className="btn"
            disabled={posSezione <= 0}
            onClick={() => aggiorna((x) => spostaSezione(x, sezione.key, -1))}
          >
            ▲ Sposta su
          </button>
          <button
            className="btn"
            disabled={posSezione >= sezioniAttivita.length - 1}
            onClick={() => aggiorna((x) => spostaSezione(x, sezione.key, 1))}
          >
            ▼ Sposta giù
          </button>
          <button
            className={`btn ${riordina ? 'btn-primario' : ''}`}
            onClick={() => {
              setRiordina(!riordina);
              setChiusa(false);
              setMenu(false);
            }}
          >
            {riordina ? '✓ Fine riordino' : '⇅ Riordina frasi'}
          </button>
          {eliminabile && (
            <button className="btn btn-pericolo" onClick={elimina}>
              Elimina
            </button>
          )}
        </div>
      )}
      {!chiusa && (
        <>
          {riordina && (
            <div className="promemoria riordino">
              <span>Usa ▲ ▼ per cambiare l’ordine delle frasi: nel Word diventa a), b), c)…</span>
              <button className="btn btn-piccolo" onClick={() => setRiordina(false)}>
                Fine
              </button>
            </div>
          )}
          <ul className="lista-voci">
            {voci.map((v, i) => (
              <VoceCard
                key={v.key}
                voce={v}
                sopralluogoId={s.id}
                catalogo={catalogo}
                aperta={aperta === v.key}
                onApri={() => setAperta(aperta === v.key ? null : v.key)}
                onModifica={(f) => modificaVoce(v.key, f)}
                onElimina={() => aggiorna((x) => ({ ...x, voci: x.voci.filter((y) => y.key !== v.key) }))}
                riordina={riordina}
                primo={i === 0}
                ultimo={i === voci.length - 1}
                onSposta={(verso) => aggiorna((x) => spostaVoce(x, v.key, verso))}
              />
            ))}
          </ul>
          <button className="btn btn-blocco btn-tratteggiato" onClick={aggiungiFrase}>
            + Aggiungi frase in “{sezione.titolo}”
          </button>
        </>
      )}
    </div>
  );
}

function Certificazioni({ a, aggiorna }: { a: AttivitaSelezionata; aggiorna: Aggiorna }) {
  const [nuova, setNuova] = useState('');
  const set = (f: (c: AttivitaSelezionata['certificazioni']) => AttivitaSelezionata['certificazioni']) =>
    aggiorna((x) => ({ ...x, attivita: x.attivita.map((y) => (y.codice === a.codice ? { ...y, certificazioni: f(y.certificazioni) } : y)) }));
  const richieste = a.certificazioni.filter((c) => c.richiesta).length;
  return (
    <details className="card certificazioni-attivita">
      <summary>
        <span>Certificazioni da produrre</span>
        <span className="badge">
          {richieste}/{a.certificazioni.length}
        </span>
      </summary>
      {a.certificazioni.map((c, i) => (
        <label key={i} className="riga-check">
          <input type="checkbox" checked={c.richiesta} onChange={(e) => set((l) => l.map((x, j) => (j === i ? { ...x, richiesta: e.target.checked } : x)))} />
          <span>
            {c.testo}
            {c.sotto.length > 0 && <span className="muto piccolo"> ({c.sotto.length} sottopunti)</span>}
          </span>
        </label>
      ))}
      <div className="aggiungi-riga">
        <input value={nuova} onChange={(e) => setNuova(e.target.value)} placeholder="Altra certificazione…" aria-label="Nuova certificazione" />
        <button
          className="btn"
          disabled={!nuova.trim()}
          onClick={() => {
            set((l) => [...l, { testo: nuova.trim(), sotto: [], richiesta: true }]);
            setNuova('');
          }}
        >
          Aggiungi
        </button>
      </div>
    </details>
  );
}

function Cartelli({ s, catalogo, aggiorna }: { s: Sopralluogo; catalogo: Catalogo; aggiorna: Aggiorna }) {
  const set = (key: string, campo: 'quantita' | 'descrizione', v: string) =>
    aggiorna((x) => ({ ...x, cartelli: x.cartelli.map((c) => (c.key === key ? { ...c, [campo]: v } : c)) }));
  const aggiungi = (descrizione: string) =>
    aggiorna((x) => ({ ...x, cartelli: [...x.cartelli, { key: nuovoId('c-'), quantita: '', descrizione }] }));
  const totale = s.cartelli.reduce((n, c) => n + (parseInt(c.quantita, 10) || 0), 0);
  return (
    <section>
      <h2 className="titolo-passo">Ordine cartelli e segnaletica</h2>
      <p className="muto piccolo">Diventa il capitolo 2.2 del Word. Totale: {totale} cartelli.</p>
      {s.cartelli.map((c) => (
        <div key={c.key} className="card riga-cartello">
          <label className="campo campo-qta">
            <span className="campo-etichetta">n°</span>
            <input inputMode="numeric" value={c.quantita} onChange={(e) => set(c.key, 'quantita', e.target.value)} />
          </label>
          <label className="campo">
            <span className="campo-etichetta">Descrizione</span>
            <input value={c.descrizione} onChange={(e) => set(c.key, 'descrizione', e.target.value)} />
          </label>
          <button className="btn-icona" aria-label="Elimina cartello" onClick={() => aggiorna((x) => ({ ...x, cartelli: x.cartelli.filter((y) => y.key !== c.key) }))}>
            ×
          </button>
        </div>
      ))}
      <h3 className="titolo-sezione">Aggiungi</h3>
      <div className="suggerimenti">
        {catalogo.cartelliSuggeriti.map((t) => (
          <button key={t} className="chip-testo" onClick={() => aggiungi(t)}>
            + {t}
          </button>
        ))}
        <button className="chip-testo" onClick={() => aggiungi('')}>
          + riga libera
        </button>
      </div>
    </section>
  );
}

interface Props {
  s: Sopralluogo;
  catalogo: Catalogo;
  tab: string;
  aggiorna: Aggiorna;
  onVaiAttivita: () => void;
}

export default function Step3Voci({ s, catalogo, tab, aggiorna, onVaiAttivita }: Props) {
  if (!s.attivita.length) {
    return (
      <section className="vuoto">
        <p>Non hai ancora selezionato nessuna attività.</p>
        <p className="muto piccolo">Le frasi tipo compaiono in base alle attività scelte al passo 1.</p>
        <button className="btn btn-primario btn-grande btn-blocco" onClick={onVaiAttivita}>
          ‹ Scegli le attività
        </button>
      </section>
    );
  }
  if (tab === CARTELLI) return <Cartelli s={s} catalogo={catalogo} aggiorna={aggiorna} />;

  const a = s.attivita.find((x) => x.codice === tab) ?? s.attivita[0];
  const f = famigliaDi(catalogo, a.codice);
  const sezioni = sezioniDiAttivita(s, a.codice);

  return (
    <section>
      <h2 className="titolo-passo">
        Attività {a.codice}
        {f && <span className="muto piccolo"> · {f.nome}</span>}
      </h2>
      <p className="muto piccolo">Spunta le frasi che valgono per questo sopralluogo, completa le [parentesi] e scatta le foto.</p>
      {!f && sezioni.length === 0 && <p className="muto">Nessuna frase tipo in libreria per questa attività: aggiungi una sezione.</p>}
      {sezioni.map((sez) => (
        <Sezione key={sez.key} s={s} sezione={sez} catalogo={catalogo} aggiorna={aggiorna} />
      ))}
      <button
        className="btn btn-grande btn-blocco btn-tratteggiato"
        onClick={() => {
          const t = prompt('Titolo della nuova sezione', 'Nuova sezione');
          if (t?.trim()) aggiorna((x) => ({ ...x, sezioni: [...x.sezioni, nuovaSezionePersonalizzata(a.codice, t.trim())] }));
        }}
      >
        + Aggiungi sezione
      </button>
      <Certificazioni a={a} aggiorna={aggiorna} />
    </section>
  );
}
