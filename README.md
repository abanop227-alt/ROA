# Prevenzioni Incendi STEMA

App per la prevenzione incendi degli studi tecnici (D.P.R. 151/2011): sopralluoghi e ROA, prove idranti, SCIA e rinnovi.
Si installa sul telefono, funziona senza rete e senza server (Vite + React + TypeScript, PWA).
Nata dalla app "ROA Antincendio"; il repository e l'indirizzo di pubblicazione (`/ROA/`) restano invariati.

## Cosa fa

- **Elenco pratiche**: ROA, SCIA e rinnovi con stato, referente, filtri e ricerca. Nuovo, apri, duplica, esporta, elimina.
- **Flusso della ROA**: in compilazione → ROA emessa → lavori in corso → lavori eseguiti. La **SCIA si può creare solo a lavori
  eseguiti**; nasce dalla ROA con stabile, attività e certificazioni già indicati. Il **rinnovo** si può creare dalla ROA.
- **ROA** (4 passi + idranti): attività (74, 75, 77…), condominio, voci (frasi tipo con foto e computo), riepilogo.
  Prima del Word compare un elenco di **controlli** (dati mancanti, date incoerenti, frasi con [parentesi] o senza foto).
  Il Word ha frontespizio, indice compilato, capitoli per attività, certificazioni, conclusioni e computo.
- **Computo**: esportazione in Excel senza prezzi (per chi li inserisce) e reimportazione dei prezzi.
- **Prova idranti**: `Q = K × √(10 × P)`, esito rispetto alla portata minima, Word separato dalla ROA; se la prova l'ha fatta
  un'altra ditta si usa la portata misurata e il rapporto va in allegato.
- **SCIA e rinnovo**: stato, numero pratica VV.F., protocollo PEC, data di presentazione, scadenza del rinnovo
  (5 anni; 10 per le attività 6, 7, 8, 64, 71, 72, 77; termine minore se le attività non sono indipendenti) ed elenco di
  controllo dei documenti.
- **Moduli VV.F.**: MOD. PIN 3 e 3.1 (rinnovo) e MOD. PIN 2 e 2.1 (SCIA) compilati dai moduli ufficiali con i dati del titolare,
  del condominio, delle attività e del professionista (impostazioni del dispositivo). I modelli sono in `public/moduli/` e si costruiscono dai
  moduli ufficiali vuoti con `python scripts/moduli/costruisci_moduli.py` (vedi il file per gli altri moduli PIN).
- **Stabili**: importazione degli Excel "Stabili … .xlsx" (anagrafica, ricerca nel passo Condominio) e copia aggiornata di ogni elenco con
  ROA, SCIA, rinnovo e scadenza ricavati dalle pratiche.
- **Elenco lavori e resoconti**: import di "ELENCO LAVORI 2026.xlsx", righe aggiornate dallo stato delle pratiche, resoconto mensile per
  amministrazione (Word ed Excel) e cartella `_AGGIORNAMENTI` dell'archivio scritta dal computer (aggiornamento automatico all'apertura).
- **Foto**: ridotte a 1600 px, importate nell'ordine di scatto.
- **Backup** `.json` con foto e **sincronizzazione** tra dispositivi e colleghi tramite un repository GitHub privato
  (per ogni pratica vince la modifica più recente).
- **Libreria** di frasi sostituibile senza toccare il codice; **impostazioni del tecnico** (intestazione, firma, piè di pagina,
  carta intestata) salvate solo sul dispositivo.

## Dove sta cosa

| Cosa | File |
|---|---|
| Libreria (attività, sezioni, frasi, certificazioni) | `src/data/roa-dati.json`, generata da `scripts/libreria.py` |
| Word della ROA e assemblaggio comune | `src/lib/docx.ts` |
| Word della prova idranti e calcolo | `src/lib/docxIdranti.ts`, `src/lib/idranti.ts` |
| Pratiche, stati, scadenze, documenti | `src/lib/pratiche.ts` |
| Moduli VV.F. | `src/lib/moduliVvf.ts`, `scripts/moduli/costruisci_moduli.py`, `public/moduli/` |
| Stabili e loro aggiornamento | `src/lib/stabili.ts`, `src/lib/stabiliAggiornati.ts` |
| Elenco lavori, resoconti, archivio | `src/lib/commesse.ts`, `src/lib/resoconto.ts`, `src/lib/aggiornamenti.ts`, `src/lib/archivio.ts` |
| Controlli prima del Word | `src/lib/controlli.ts` |
| Computo e Excel | `src/lib/computo.ts`, `src/lib/computoXlsx.ts` |
| Salvataggio e backup | `src/lib/db.ts`, `src/lib/backup.ts` |
| Sincronizzazione | `src/lib/sync.ts`, `src/lib/autosync.ts` |
| Schermate | `src/components/` |
| Identità del prodotto | `src/config/studio.ts`, `vite.config.ts` |

## Sviluppo

```
npm ci
npm run dev      # http://localhost:5173/ROA/
npm test         # test automatici
npm run build    # controllo dei tipi e build
```

Ogni modifica caricata su `main` esegue i test, costruisce l'app e la pubblica su GitHub Pages.

## Versione per altri studi

Il nome dell'app si cambia con `VITE_PRODOTTO` e `VITE_PRODOTTO_BREVE` (vedi `.env.example`). Quello che è dello studio resta fuori dal
codice: intestazione, firma, piè di pagina e carta intestata sono impostazioni del dispositivo; la libreria di frasi si carica da
file (`roa-dati.json`); i dati dei clienti stanno solo sui dispositivi e nel repository privato di sincronizzazione.
La libreria predefinita contiene frasi ricavate dalle ROA dello studio STEMA: prima di distribuire l'app ad altri studi va sostituita
con una libreria neutra o con la loro.
