# ROA Antincendio

App web mobile-first (PWA, funziona offline) per i sopralluoghi delle ROA antincendio
(D.P.R. 151/2011): selezione delle lavorazioni, foto e generazione della bozza Word (.docx)
con il computo metrico.

App pubblicata: https://abanop227-alt.github.io/ROA/

## Avvio in locale

```bash
npm install
npm run dev -- --host    # apri dal telefono l'indirizzo "Network" (stessa rete Wi-Fi)
npm test                 # test: istanziazione voci, computo, .docx, backup
npm run build            # build di produzione in dist/
```

Nota: service worker, installazione come app e condivisione richiedono HTTPS; con
`npm run dev -- --host` (http://192.168.x.x) si prova il flusso, mentre installazione e uso
offline si provano sulla versione pubblicata su GitHub Pages.

## Libreria frasi tipo

`src/data/roa-dati.json` è la libreria. Contiene attività (classificazione D.P.R. 151/11), gruppi 74 / 75 / 77
con regole tecniche, sezioni (es. "Vano scala", "Mezzi di estinzione"), frasi tipo con didascalia foto e
lavorazioni di computo, certificazioni per attività, suggerimenti per cartelli e "nota bene", testi fissi.
Le parti da completare in sopralluogo sono tra [parentesi quadre].

Il JSON si genera da `scripts/libreria.py` (`python3 scripts/libreria.py`), più comodo da modificare:
si possono aggiungere frasi, sezioni o un nuovo gruppo (es. "49" per i gruppi elettrogeni) senza toccare il codice.
Un codice attività usa le frasi del gruppo con lo stesso numero (75.3.C → gruppo 75).
Dall'app si può anche caricare un `roa-dati.json` modificato (Home → Libreria voci → Carica libreria).

## Struttura

```
src/
  data/roa-dati.json      libreria
  lib/types.ts            modello dati
  lib/catalogo.ts         libreria, sezioni e frasi per attività, testi composti (titolo, scopo, conclusioni)
  lib/computo.ts          computo metrico per zona (una tabella per attività)
  lib/numeri.ts           numeri in formato italiano
  lib/docx.ts             generazione del documento Word
  lib/db.ts               IndexedDB (sopralluoghi, foto come Blob, libreria)
  lib/foto.ts             ridimensionamento foto (1600 px, JPEG 0,8)
  lib/backup.ts           esporta/importa backup .json (foto in base64)
  components/             Home, Wizard e i 4 passi
tests/                    test Vitest
.github/workflows/        build e deploy su GitHub Pages a ogni push su main
```

## Pubblicazione

A ogni push su `main` la GitHub Action "Pubblica su GitHub Pages" esegue test, build e deploy.
Una tantum: GitHub → Settings → Pages → Build and deployment → Source: **GitHub Actions**.
