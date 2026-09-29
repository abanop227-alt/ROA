// Identità del prodotto. Per una versione destinata a un altro studio basta impostare queste variabili
// (file .env.local o variabili della build): vedi "Versione per altri studi" nel README.
const env = import.meta.env;

export const STUDIO = {
  /** nome completo, mostrato nell'intestazione e nell'app installata */
  prodotto: (env.VITE_PRODOTTO as string | undefined) || 'Prevenzioni Incendi STEMA',
  /** nome breve sotto l'icona sul telefono */
  breve: (env.VITE_PRODOTTO_BREVE as string | undefined) || 'PI STEMA',
} as const;
