// Word della prova idranti (verifica funzionalità rete idranti), con la struttura dei documenti dello studio
// (modello: "NAGO, 22_PROVA IDRANTI"): parte generale, esposizione con foto, strumentazione, misurazioni, conclusioni.
import { AlignmentType, ImageRun, Packer, Paragraph, type Table } from 'docx';
import { committente } from './catalogo';
import {
  assemblaDocumento,
  bloccoFirma,
  bloccoFoto,
  caricaImmagini,
  conImpaginazione,
  copertina,
  datiGenerali,
  nomeBase,
  par,
  paragrafi,
  PX_CM,
  saltoPagina,
  testoConRiferimentoFoto,
  titolo,
  vuoto,
  type CaricaFoto,
  type OpzioniDocumento,
} from './docx';
import { formatPortata, valutaProva, type ValutazioneProva } from './idranti';
import { formatNumero } from './numeri';
import type { Catalogo, ProvaIdranti, Sopralluogo, Tecnico } from './types';
import { dataItaliana } from './util';

const S = AlignmentType.LEFT;

function frontespizioIdranti(s: Sopralluogo): Paragraph[] {
  const c = s.condominio;
  const indirizzo = [c.indirizzo.trim(), c.comune.trim()].filter(Boolean).join(' – ').toUpperCase() || '[INDIRIZZO – COMUNE]';
  const testo = ['VERIFICA FUNZIONALITA’ RETE IDRANTI', `CONDOMINIO${c.nome.trim() ? ' ' + c.nome.trim().toUpperCase() : ''}`, indirizzo].join(' ');
  return [paragrafiTitolo(testo)];
}

function paragrafiTitolo(testo: string): Paragraph {
  return par(testo, { bold: true, size: 40, after: 120, align: AlignmentType.JUSTIFIED });
}

/** "dell'autorimessa" / "dell'edificio" / "della zona X" dal titolo della zona. */
function servizio(zona: string): string {
  const z = zona.trim().toLowerCase();
  if (!z) return 'della zona [zona]';
  if (z.startsWith('autorimess')) return 'dell’autorimessa';
  if (z.startsWith('edific')) return 'dell’edificio';
  return `della zona ${z}`;
}

function sezioneMisure(p: ProvaIdranti, v: ValutazioneProva): Paragraph[] {
  const out: Paragraph[] = [];
  const molte = v.misure.length > 1;
  const ordinale = (n: number) => (molte ? `${n}° ` : '1° ');
  for (const m of v.misure) {
    out.push(par(`${ordinale(m.n)}misura pressione statica          P(st) = ${m.pStaticaTesto || '[valore]'} Bar`, { after: 0, align: S }));
    out.push(par(`${ordinale(m.n)}misura pressione di efflusso    P(ef) = ${m.pEfflussoTesto || '[valore]'} Bar`, { after: molte ? 120 : 240, align: S }));
  }
  if (v.misure.some((m) => m.calcolata)) {
    out.push(par('Utilizzando la formula:', { after: 0, align: S }));
    out.push(par('Q = K x √(10 x P)', { bold: true, after: 0, align: S }));
    out.push(par('Q = Portata – espressa in (l/min)', { after: 0, align: S }));
    out.push(par(`K = ${p.coefficienteK.trim() || '[K]'} – coefficiente indicato dalla tabella dello strumento in uso`, { after: 0, align: S }));
    out.push(par('P = Pressione di efflusso – espressa in megapascal (Mpa) 1 Mpa = 10 bar', { after: 240, align: S }));
    out.push(par('Si ottiene:', { after: 0, align: S }));
  }
  for (const m of v.misure) {
    const pre = molte ? `${m.n}° misura: ` : '';
    if (m.portata === null) {
      out.push(par(`${pre}[portata da calcolare: inserire la pressione di efflusso]`, { after: 0, align: S }));
    } else if (m.calcolata && m.pEfflusso !== null) {
      out.push(par(`${pre}Q= ${p.coefficienteK.trim()} x √(10 x ${formatNumero(m.pEfflusso / 10, 3).replace(/,?0+$/, '')} Mpa)= ${formatPortata(m.portata)} l/min.`, { after: 0, align: S }));
    } else {
      out.push(par(`${pre}Portata misurata dallo strumento = ${formatPortata(m.portata)} l/min.`, { after: 0, align: S }));
    }
    if (m.portata !== null) out.push(par(`${pre}Q= ${formatPortata(m.portata)} l/min. Portata idrica all’ idrante più sfavorito`, { bold: true, after: 240, align: S }));
  }
  return out;
}

function conclusioniIdranti(p: ProvaIdranti, v: ValutazioneProva, catalogo: Catalogo): Paragraph[] {
  const minima = p.portataMinima.trim() || '[portata minima]';
  const intro = `Considerando che la portata minima necessaria in efflusso, misurata all’idrante più sfavorito, con la contemporanea apertura di almeno il 50% degli idranti presenti, deve essere almeno di ${minima} l/min.`;
  const out: Paragraph[] = [titolo('3', 'CONCLUSIONI', 1)];
  if (v.esito === 'incompleto' || v.minimoRiscontrato === null) {
    out.push(...paragrafi(`${intro} [Esito della prova da completare: inserire le pressioni misurate.]`));
  } else {
    const positivo = v.esito === 'positivo';
    out.push(...paragrafi(`${intro} la prova effettuata ha dato esito ${positivo ? 'positivo' : 'negativo'}, in quanto:`));
    out.push(par(`Portata minima richiesta = ${minima} l/min.`, { bold: true, after: 0, align: S }));
    out.push(par(`Portata riscontrata = ${formatPortata(v.minimoRiscontrato)} l/min${positivo ? '.' : ', inferiore al minimo richiesto.'}`, { bold: true, align: S }));
    if (!positivo) {
      out.push(
        ...paragrafi(
          'Sarà pertanto necessario far verificare l’impianto idrico antincendio da parte di un impiantista, per individuare e rimuovere la causa dell’insufficiente portata, e ripetere la prova.',
        ),
      );
    }
  }
  out.push(...paragrafi(catalogo.testi.chiusura));
  return out;
}

async function esposizioneIdranti(s: Sopralluogo, p: ProvaIdranti, v: ValutazioneProva, carica: CaricaFoto): Promise<Paragraph[]> {
  const out: Paragraph[] = [saltoPagina(), titolo('2', 'ESPOSIZIONE DELLA CONSULENZA', 1)];
  if (p.riferimento.trim()) out.push(...paragrafi(p.riferimento.trim()));
  const attivita = s.attivita.find((a) => a.codice === p.attivita);
  const codice = p.attivita.trim() || attivita?.codice;
  if (codice) out.push(titolo('2.1', `ATTIVITA’ “${codice}”`, 2));
  if (attivita?.regolaTecnicaTesto.trim()) out.push(...paragrafi(attivita.regolaTecnicaTesto, { italics: true }));
  out.push(titolo(codice ? '2.1.1' : '2.1', p.zona.trim().toUpperCase() || 'IMPIANTO', 3));
  if (p.descrizioneImpianto.trim()) out.push(...paragrafi(p.descrizioneImpianto));

  let conta = 0;
  const attacco = await caricaImmagini(p.fotoAttaccoIds, carica);
  if (attacco.length) {
    const n = attacco.map(() => ++conta);
    out.push(...bloccoFoto(attacco, n, 'Attacco di mandata VV.F.'));
  }
  const prova = await caricaImmagini(p.fotoProvaIds, carica);
  const nProva = prova.map(() => ++conta);
  const aperti = p.idrantiAperti.trim();
  out.push(
    ...paragrafi(
      testoConRiferimentoFoto(
        `Al momento del sopralluogo è stato effettuato il collaudo dell’impianto rilevando la pressione statica e dinamica della rete idranti con la contemporanea apertura di n° ${aperti || '[n°]'} presidi tra i più svantaggiati per distanza dal punto di consegna.`,
        nProva,
      ),
    ),
  );
  if (prova.length) out.push(...bloccoFoto(prova, nProva, 'Prova di pressione.'));

  if (p.eseguitaDa.trim()) {
    out.push(...paragrafi(`La prova è stata eseguita da ${p.eseguitaDa.trim()}: i rilievi sono riportati nel rapporto in allegato.`));
  } else {
    out.push(par('Strumentazione', { bold: true, after: 120, keepNext: true, align: S }));
    out.push(...paragrafi(`Lo strumento utilizzato è ${p.strumento.trim() || '[strumento]'}`));
    out.push(par('Misurazioni', { bold: true, after: 120, keepNext: true, align: S }));
    out.push(
      ...paragrafi(
        'La prova viene effettuata in due tempi, dapprima misurando la pressione statica e successivamente la portata idrica, rilevando cioè, mediante idonea attrezzatura, le pressioni statica e di efflusso all’uscita del bocchello della lancia.',
      ),
    );
  }
  const tot = p.idrantiTotali.trim();
  out.push(par(`Prova – con ${aperti || '[n°]'} idranti aperti`, { bold: true, after: 120, keepNext: true, align: S }));
  out.push(
    ...paragrafi(
      `La misurazione viene effettuata sull’idrante idraulicamente più sfavorito, con l’apertura contemporanea di n° ${aperti || '[n°]'} idranti${tot ? ` sui n° ${tot} totali` : ''}:`,
    ),
  );
  out.push(...sezioneMisure(p, v));
  if (p.note.trim()) out.push(...paragrafi(p.note));
  return out;
}

/** Rapporto della ditta: una foto per pagina, larga fino a 16 cm. */
async function allegatoRapporto(p: ProvaIdranti, carica: CaricaFoto): Promise<Paragraph[]> {
  const immagini = await caricaImmagini(p.fotoRapportoIds, carica);
  if (!immagini.length) return [];
  const out: Paragraph[] = [saltoPagina(), titolo('4', 'ALLEGATO – RAPPORTO DELLA DITTA', 1)];
  immagini.forEach(({ f, tipo }, i) => {
    const r = f.height / f.width;
    let w = 16 * PX_CM;
    let h = w * r;
    if (h > 21 * PX_CM) {
      h = 21 * PX_CM;
      w = h / r;
    }
    if (i) out.push(saltoPagina());
    out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 120 }, children: [new ImageRun({ type: tipo, data: f.data, transformation: { width: Math.round(w), height: Math.round(h) } })] }));
  });
  return out;
}

export async function creaDocumentoIdranti(s: Sopralluogo, catalogo: Catalogo, tecnico: Tecnico, carica: CaricaFoto, opz: OpzioniDocumento = {}) {
  const p = s.provaIdranti;
  if (!p) throw new Error('Nessuna prova idranti nel sopralluogo.');
  const v = valutaProva(p);
  const { risultato: corpo, stima } = await conImpaginazione(async () => {
    const out: (Paragraph | Table)[] = [...datiGenerali(s, tecnico)];
    out.push(par('Lo scopo del presente elaborato consiste in:', { after: 120 }));
    out.push(par(`Verificare il corretto funzionamento dell’impianto idrico antincendio presente a servizio ${servizio(p.zona)}.`));
    const quando = p.circostanza.trim() ? ` ${p.circostanza.trim()}` : '';
    out.push(par(`La prova di pressione è stata effettuata${quando} in data ${dataItaliana(p.dataProva) || '[data]'}.`));
    out.push(vuoto(240), bloccoFirma(tecnico, p.dataProva));
    out.push(...(await esposizioneIdranti(s, p, v, carica)));
    out.push(...conclusioniIdranti(p, v, catalogo));
    out.push(vuoto(240), bloccoFirma(tecnico, p.dataProva));
    out.push(...(await allegatoRapporto(p, carica)));
    return out;
  });
  return assemblaDocumento({
    s,
    tecnico,
    titolo: `Prova idranti ${committente(s)}`.trim(),
    frontespizio: frontespizioIdranti(s),
    copertina: await copertina(s, carica),
    corpo,
    stima,
    opz,
    dataPiede: p.dataProva,
  });
}

export async function generaDocxIdrantiBlob(s: Sopralluogo, catalogo: Catalogo, tecnico: Tecnico, carica: CaricaFoto, opz: OpzioniDocumento = {}): Promise<Blob> {
  return Packer.toBlob(await creaDocumentoIdranti(s, catalogo, tecnico, carica, opz));
}

export function nomeFileIdranti(s: Sopralluogo): string {
  const data = s.provaIdranti?.dataProva || s.condominio.dataRelazione || new Date().toISOString().slice(0, 10);
  return `PROVA_IDRANTI_${nomeBase(s)}_${data}.docx`;
}
