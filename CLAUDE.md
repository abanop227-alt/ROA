# ROA Antincendio

PWA mobile-first e offline (React 19 + Vite + TypeScript strict) per i sopralluoghi ROA antincendio
(D.P.R. 151/2011): selezione lavorazioni, foto, generazione della bozza Word (.docx) con computo metrico.
Pubblicata su GitHub Pages a ogni push su `main`.

## Comandi

- `npm run dev -- --host` — sviluppo locale
- `npm test` — Vitest (`tests/`)
- `npm run build` — `tsc --noEmit` + build di produzione (stesso controllo della CI)
- `python3 scripts/libreria.py` — rigenera `src/data/roa-dati.json`

Prima di ogni push: `npm test && npm run build` (la CI esegue esattamente questi due comandi).

## Regole

- **`src/data/roa-dati.json` è un file generato**: non modificarlo a mano. Si modifica
  `scripts/libreria.py` e si rigenera. Un hook blocca le modifiche dirette.
- TypeScript `strict` con `noUnusedLocals` / `noUnusedParameters`: niente variabili o parametri inutilizzati.
- Le parti da completare in sopralluogo, nei testi della libreria, vanno tra [parentesi quadre].
- Testi e interfaccia in italiano.
- Il codice attività usa le frasi del gruppo con lo stesso numero (es. 75.3.C → gruppo 75).

## Struttura

- `src/lib/catalogo.ts` — libreria, sezioni e frasi per attività, testi composti
- `src/lib/computo.ts` — computo metrico (logica critica, coperta da `tests/computo.test.ts`)
- `src/lib/docx.ts` — generazione del documento Word (`tests/docx.test.ts`)
- `src/lib/db.ts`, `sync.ts`, `backup.ts` — IndexedDB, sincronizzazione, backup
- `src/components/` — Home, Wizard e i 4 passi

## Strumenti Claude Code del progetto

- `/verifica` — esegue test e build come la CI
- `/nuova-frase-roa` — aggiunge frasi/sezioni alla libreria e rigenera il JSON
- subagente `test-writer` — scrive test Vitest
- MCP: `context7` (documentazione librerie), `playwright` (prova nel browser)
