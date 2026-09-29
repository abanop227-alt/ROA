---
name: verifica
description: Esegue test e build come la CI (npm test, npm run build) e riassume gli errori. Da usare prima di ogni push.
disable-model-invocation: true
---

Esegui, in quest'ordine, dalla radice del progetto:

1. `npm test`
2. `npm run build`

Se un passo fallisce, fermati e riassumi in italiano: comando fallito, file e riga degli errori
(TypeScript o test), causa probabile. Non modificare codice a meno che l'utente lo chieda.
Se entrambi passano, conferma in una riga che la CI dovrebbe essere verde.
