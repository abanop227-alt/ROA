---
name: nuova-frase-roa
description: Aggiunge frasi tipo, sezioni o gruppi alla libreria ROA modificando scripts/libreria.py e rigenerando src/data/roa-dati.json.
disable-model-invocation: true
argument-hint: "[gruppo o sezione] [testo della frase]"
---

`src/data/roa-dati.json` è generato: **non modificarlo a mano**.

1. Leggi `scripts/libreria.py` e individua il gruppo/sezione giusti (74, 75, 77 o nuovo gruppo).
2. Aggiungi la voce con gli helper esistenti (`V`, `L`, `C`), con id univoco, titolo, testo,
   didascalia foto e lavorazioni di computo. Le parti da completare in sopralluogo vanno tra [parentesi quadre].
3. Rigenera: `python3 scripts/libreria.py` (stampa il numero di voci).
4. Esegui `npm test` per verificare che l'istanziazione delle voci non si rompa.
5. Riassumi in italiano cosa hai aggiunto e dove.
