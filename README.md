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

## Libreria voci

`src/data/roa-dati.json` è la libreria: attività, voci, unità di misura e conclusioni.
Per aggiungere voci o attività basta modificare il JSON (nessuna modifica al codice).
Dall'app si può anche caricare un `roa-dati.json` modificato (Home → Libreria voci → Carica libreria),
senza ripubblicare.

## Struttura

```
src/
  data/roa-dati.json      libreria
  lib/types.ts            modello dati
  lib/catalogo.ts         istanziazione voci per attività, certificazioni
  lib/computo.ts          computo metrico
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
