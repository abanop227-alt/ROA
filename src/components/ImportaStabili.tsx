import { useEffect, useRef, useState } from 'react';
import { elencaStabili, eliminaFileStabili, eliminaStabiliDi, importaStabiliDb, salvaFileStabili } from '../lib/db';
import { leggiStabiliXlsx } from '../lib/stabili';

/** Importazione degli elenchi "Stabili <amministrazione>.xlsx": restano solo su questo dispositivo. */
export default function ImportaStabili() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ origine: string; n: number }[]>([]);
  const [messaggio, setMessaggio] = useState<string | null>(null);

  const ricarica = () =>
    elencaStabili()
      .then((l) => {
        const per = new Map<string, number>();
        for (const s of l) per.set(s.origine, (per.get(s.origine) ?? 0) + 1);
        setFile([...per.entries()].map(([origine, n]) => ({ origine, n })));
      })
      .catch(() => setFile([]));
  useEffect(() => {
    ricarica();
  }, []);

  async function importa(files: FileList) {
    const esiti: string[] = [];
    for (const f of Array.from(files)) {
      try {
        const stabili = await leggiStabiliXlsx(await f.arrayBuffer(), f.name);
        await importaStabiliDb(stabili, f.name);
        await salvaFileStabili(f.name, f);
        esiti.push(`${f.name}: ${stabili.length} stabili`);
      } catch (e) {
        esiti.push(`${f.name}: ${(e as Error).message}`);
      }
    }
    setMessaggio(esiti.join(' · '));
    await ricarica();
  }

  return (
    <>
      <h2 className="titolo-sezione">Stabili</h2>
      <p className="muto piccolo">
        Importa gli elenchi Excel dei tuoi clienti (“Stabili … 2026.xlsx”): nel passo Condominio potrai cercare lo stabile e
        precompilare indirizzo, CAP, comune, codice fiscale e attività. Restano solo su questo dispositivo.
      </p>
      {messaggio && (
        <p className="promemoria" role="status">
          {messaggio}
        </p>
      )}
      <ul className="lista-file">
        {file.map((f) => (
          <li key={f.origine}>
            <span>
              {f.origine} <span className="muto">({f.n})</span>
            </span>
            <button
              className="btn btn-piccolo"
              onClick={async () => {
                if (confirm(`Togliere gli stabili importati da “${f.origine}”?`)) {
                  await eliminaStabiliDi(f.origine);
                  await eliminaFileStabili(f.origine);
                  ricarica();
                }
              }}
            >
              Togli
            </button>
          </li>
        ))}
      </ul>
      <div className="riga-pulsanti">
        <button className="btn" onClick={() => input.current?.click()}>
          Importa elenco stabili (Excel)
        </button>
        <input
          ref={input}
          type="file"
          multiple
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hidden
          onChange={(e) => {
            const f = e.target.files;
            if (f?.length) importa(f).finally(() => (e.target.value = ''));
          }}
        />
      </div>
    </>
  );
}
