// Tutti i file che l'app tiene aggiornati: elenco lavori, elenchi stabili di ogni amministrazione, resoconti del mese.
import { elencoLavori, esportaElencoLavoriXlsx, type Commessa } from './commesse';
import { amministrazioni, creaResoconto, mesePrecedente } from './resoconto';
import { nomeFileResoconto, resocontoDocx, resocontoXlsx } from './resocontoDocs';
import type { Stabile } from './stabili';
import { applicaModifiche, modifichePerFile, type Modifica } from './stabiliAggiornati';
import type { Sopralluogo, Tecnico } from './types';

export const CARTELLA_AGGIORNAMENTI = '_AGGIORNAMENTI';

export interface FileGenerato {
  cartella: string[];
  nome: string;
  blob: Blob;
  descrizione: string;
}

export interface DatiAggiornamenti {
  commesseImportate: Commessa[];
  sopralluoghi: Sopralluogo[];
  stabili: Stabile[];
  /** file Excel originali degli elenchi stabili, per nome */
  fileStabili: Map<string, Blob>;
  tecnico: Tecnico;
  /** mese del resoconto (yyyy-mm), predefinito il mese precedente */
  mese?: string;
}

export interface EsitoAggiornamenti {
  file: FileGenerato[];
  /** modifiche fatte agli elenchi stabili, per file */
  modifiche: Record<string, Modifica[]>;
  avvisi: string[];
}

const senzaEstensione = (n: string) => n.replace(/\.xlsx$/i, '');

export async function generaAggiornamenti(d: DatiAggiornamenti): Promise<EsitoAggiornamenti> {
  const mese = d.mese ?? mesePrecedente();
  const file: FileGenerato[] = [];
  const modifiche: Record<string, Modifica[]> = {};
  const avvisi: string[] = [];

  const lavori = elencoLavori(d.commesseImportate, d.sopralluoghi);
  if (lavori.length) {
    file.push({ cartella: [CARTELLA_AGGIORNAMENTI], nome: 'ELENCO LAVORI aggiornato.xlsx', blob: await esportaElencoLavoriXlsx(lavori), descrizione: `${lavori.length} commesse` });
  } else avvisi.push('Elenco lavori: importa “ELENCO LAVORI 2026.xlsx” o crea pratiche con il numero di commessa.');

  const origini = [...new Set(d.stabili.map((s) => s.origine))];
  for (const origine of origini) {
    const originale = d.fileStabili.get(origine);
    if (!originale) {
      avvisi.push(`${origine}: file originale non disponibile, reimportalo per poterlo aggiornare.`);
      continue;
    }
    const daFile = d.stabili.filter((s) => s.origine === origine);
    const m = await modifichePerFile(originale, daFile, d.sopralluoghi);
    modifiche[origine] = m;
    file.push({
      cartella: [CARTELLA_AGGIORNAMENTI, 'Elenchi stabili'],
      nome: `${senzaEstensione(origine)} (aggiornato).xlsx`,
      blob: await applicaModifiche(originale, m),
      descrizione: m.length ? `${m.length} celle aggiornate` : 'nessuna modifica',
    });
  }

  for (const amm of amministrazioni(lavori, d.stabili)) {
    const r = creaResoconto(amm, mese, lavori, d.stabili);
    if (!r.totale.completati && !r.totale.consegnati && !r.totale.inCorso && !r.scadenze.length) continue;
    const cartella = [CARTELLA_AGGIORNAMENTI, 'Resoconti', mese];
    file.push({ cartella, nome: nomeFileResoconto(r, 'docx'), blob: await resocontoDocx(r, d.tecnico), descrizione: `${r.totale.completati} completati, ${r.totale.inCorso} in corso` });
    file.push({ cartella, nome: nomeFileResoconto(r, 'xlsx'), blob: await resocontoXlsx(r), descrizione: 'tabella' });
  }
  return { file, modifiche, avvisi };
}
