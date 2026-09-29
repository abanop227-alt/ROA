"""Costruisce i modelli dei moduli VV.F. (public/moduli/*.docx) dai moduli ufficiali VUOTI.

Sorgenti: i file "PIN_*.dot/.dotx" scaricati dal sito dei Vigili del Fuoco, convertiti in .docx
(cartella indicata, predefinita %TEMP%\\roa\\moduli). Nessun dato di clienti: i campi da compilare sono i
riquadri vuoti sopra le etichette ("Cognome", "Nome", "indirizzo"…); lo script li sostituisce con segnaposto
{{chiave}} che l'app riempie (src/lib/moduliVvf.ts).

Uso:  python scripts/moduli/costruisci_moduli.py [cartella_docx] [--elenca modulo]
"""
import copy
import io
import os
import re
import sys
import zipfile

from lxml import etree

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
NS = {'w': W}
q = lambda t: '{%s}%s' % (W, t)
XML_SPACE = '{http://www.w3.org/XML/1998/namespace}space'
USCITA = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'moduli')
DEFAULT_SRC = os.path.join(os.environ.get('TEMP', '.'), 'roa', 'moduli')


def norm(t):
    return re.sub(r'\s+', ' ', t.replace(' ', ' ')).strip()


def ptext(p):
    return norm(''.join(n.text or '' for n in p.iter(q('t'))))


def ctext(tc):
    return norm(''.join(n.text or '' for n in tc.iter(q('t'))))


def righe_di(tbl):
    return [r for r in tbl if r.tag == q('tr')]


def celle_di(tr):
    return [c for c in tr if c.tag == q('tc')]


def span(tc):
    g = tc.find('w:tcPr/w:gridSpan', NS)
    return int(g.get(q('val'))) if g is not None else 1


def posizioni(tr):
    out, x = [], 0
    for c in celle_di(tr):
        s = span(c)
        out.append((x, x + s, c))
        x += s
    return out


class Modulo:
    def __init__(self, percorso):
        self.percorso = percorso
        self.zip = zipfile.ZipFile(percorso)
        self.doc = etree.fromstring(self.zip.read('word/document.xml'))
        self.par = list(self.doc.iter(q('p')))
        self.usati = []  # chiavi inserite
        self.testi_fissi = []

    # ---- ricerca ----
    def etichette(self, testo):
        """Paragrafi (dentro celle di tabella) il cui testo è esattamente `testo`, in ordine di documento."""
        return [p for p in self.par if ptext(p) == testo and p.getparent().tag == q('tc')]

    def sopra(self, tc):
        """Celle della riga precedente che stanno sopra la cella tc."""
        tr = tc.getparent()
        prec = tr.getprevious()
        while prec is not None and prec.tag != q('tr'):
            prec = prec.getprevious()
        if prec is None:
            return []
        a = [(s, e) for s, e, c in posizioni(tr) if c is tc][0]
        return [c for s, e, c in posizioni(prec) if s < a[1] and e > a[0]]

    # ---- scrittura ----
    def _token(self, p, key, dopo_testo=None):
        seg = '{{%s}}' % key
        ts = list(p.iter(q('t')))
        if dopo_testo is not None:
            ts[-1].text = (ts[-1].text or '') + dopo_testo + seg
            ts[-1].set(XML_SPACE, 'preserve')
        elif ts and any((t.text or '').strip() for t in ts):
            # riquadro con trattini bassi: si sostituisce tutto il testo
            ts[0].text = seg
            ts[0].set(XML_SPACE, 'preserve')
            for t in ts[1:]:
                t.text = ''
        else:
            r = etree.SubElement(p, q('r'))
            rpr = p.find('w:pPr/w:rPr', NS)
            if rpr is not None:
                r.append(copy.deepcopy(rpr))
            t = etree.SubElement(r, q('t'))
            t.text = seg
            t.set(XML_SPACE, 'preserve')
        self.usati.append(key)

    def campo(self, etichetta, n, chiave):
        """Riquadro vuoto sopra la n-esima etichetta `etichetta`."""
        ets = self.etichette(etichetta)
        assert len(ets) > n, f'{os.path.basename(self.percorso)}: etichetta {etichetta!r} #{n} non trovata ({len(ets)} presenti)'
        cand = self.sopra(ets[n].getparent())
        assert len(cand) == 1, f'etichetta {etichetta!r} #{n}: {len(cand)} riquadri sopra'
        p = cand[0].find('.//w:p', NS)
        assert ctext(cand[0]) in ('', '_'), f'etichetta {etichetta!r} #{n}: riquadro non vuoto ({ctext(cand[0])!r})'
        self._token(p, chiave)

    def codice_fiscale(self, etichetta='codice fiscale della persona fisica', n=0):
        ets = self.etichette(etichetta)
        cand = [c for c in self.sopra(ets[n].getparent()) if ctext(c) != 'C.F.']
        assert len(cand) == 16, f'codice fiscale: {len(cand)} caselle invece di 16'
        for k, c in enumerate(cand):
            self._token(c.find('.//w:p', NS), f'cf{k}')

    def dopo_riga(self, testo_riga, chiave, n=0):
        """Il riquadro (trattini bassi o paragrafo vuoto) che segue il paragrafo `testo_riga`."""
        pp = [i for i, p in enumerate(self.par) if ptext(p) == testo_riga]
        assert len(pp) > n, f'riga {testo_riga!r} non trovata'
        for j in range(pp[n] + 1, pp[n] + 4):
            t = ptext(self.par[j])
            if t == '' or re.fullmatch(r'[_ ;.]*_[_ ;.]*', t):
                self._token(self.par[j], chiave)
                return
        raise AssertionError(f'nessun riquadro dopo {testo_riga!r}')

    def dopo_par(self, testo_par, chiave, n=0):
        """Riempie il paragrafo vuoto che segue il paragrafo `testo_par`."""
        idx = [i for i, p in enumerate(self.par) if ptext(p) == testo_par]
        assert len(idx) > n, f'paragrafo {testo_par!r} non trovato'
        succ = self.par[idx[n] + 1]
        assert ptext(succ) == '', f'dopo {testo_par!r} manca un paragrafo vuoto ({ptext(succ)!r})'
        self._token(succ, chiave)

    def dopo_par_inizia(self, inizia, chiave, n=0):
        """Come dopo_par, per un paragrafo lungo di cui si conosce solo l'inizio."""
        idx = [i for i, p in enumerate(self.par) if ptext(p).startswith(inizia)]
        assert len(idx) > n, f'paragrafo che inizia con {inizia!r} non trovato'
        succ = self.par[idx[n] + 1]
        assert ptext(succ) == '', f'dopo {inizia!r} manca un paragrafo vuoto ({ptext(succ)!r})'
        self._token(succ, chiave)

    def trattini(self, inizia, chiave, n=0):
        """Sostituisce la sequenza di trattini bassi dentro il paragrafo che inizia con `inizia`."""
        pp = [p for p in self.par if ptext(p).startswith(inizia)]
        assert len(pp) > n, f'paragrafo {inizia!r} non trovato'
        for t in pp[n].iter(q('t')):
            if t.text and re.search(r'_{4,}', t.text):
                t.text = re.sub(r'_{4,}', '{{%s}}' % chiave, t.text, count=1)
                t.set(XML_SPACE, 'preserve')
                self.usati.append(chiave)
                return
        raise AssertionError(f'nessun trattino in {inizia!r}')

    def testo_in(self, contiene, chiave, dopo, n=0):
        """Aggiunge `dopo{{chiave}}` al fondo del n-esimo paragrafo che contiene `contiene`."""
        pp = [p for p in self.par if ptext(p) == contiene]
        assert len(pp) > n, f'paragrafo {contiene!r} non trovato'
        self._token(pp[n], chiave, dopo_testo=dopo)

    def casella(self, inizia, chiave, n=0):
        """Casella di controllo (campo modulo) del paragrafo che inizia con `inizia`: stato = {{chiave}} (1/0)."""
        pp = [p for p in self.par if ptext(p).startswith(inizia) and p.find('.//w:checkBox', NS) is not None]
        assert len(pp) > n, f'casella {inizia!r} non trovata'
        cb = pp[n].find('.//w:checkBox', NS)
        for c in cb.findall('w:checked', NS):
            cb.remove(c)
        d = cb.find('w:default', NS)
        if d is None:
            d = etree.SubElement(cb, q('default'))
        d.set(q('val'), '{{%s}}' % chiave)
        self.usati.append(chiave)

    def importi(self, chiavi):
        """I paragrafi che contengono solo il simbolo dell'euro, in ordine, ricevono l'importo (chiavi in ordine)."""
        pp = [p for p in self.par if re.fullmatch(r'€', ptext(p))]
        assert len(pp) >= len(chiavi), f'importi: {len(pp)} simboli euro per {len(chiavi)} chiavi'
        for p, k in zip(pp, chiavi):
            self._token(p, k, dopo_testo=' ')

    # ---- uscita ----
    def scrivi(self, nome_file):
        buf = io.BytesIO()
        pulisci = {
            'docProps/core.xml': lambda x: re.sub(rb'<(dc:creator|cp:lastModifiedBy)>[^<]*</\1>', rb'<\1></\1>', x),
            'docProps/app.xml': lambda x: re.sub(rb'<(Company|Manager)>[^<]*</\1>', rb'<\1></\1>', x),
        }
        with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as out:
            for info in self.zip.infolist():
                dati = self.zip.read(info.filename)
                if info.filename == 'word/document.xml':
                    dati = etree.tostring(self.doc, xml_declaration=True, encoding='UTF-8', standalone=True)
                elif info.filename in pulisci:
                    dati = pulisci[info.filename](dati)
                out.writestr(info, dati)
        os.makedirs(USCITA, exist_ok=True)
        dest = os.path.join(USCITA, nome_file)
        with open(dest, 'wb') as f:
            f.write(buf.getvalue())
        print('scritto', os.path.relpath(dest), '- segnaposto:', len(self.usati), '-', ' '.join(sorted(set(k for k in self.usati if not re.fullmatch(r'cf\d+', k)))))


def elenca(percorso):
    """Stampa ogni etichetta con il suo numero d'ordine e il riquadro sopra (per scrivere le specifiche)."""
    m = Modulo(percorso)
    visti = {}
    for p in m.par:
        t = ptext(p)
        if not t or p.getparent().tag != q('tc'):
            continue
        cand = m.sopra(p.getparent())
        if not cand or any(ctext(c) not in ('', '_', 'C.F.') for c in cand):
            continue
        k = visti.get(t, 0)
        visti[t] = k + 1
        print(f'{t[:60]!r} #{k}  riquadri sopra: {len(cand)}')


# ---------------------------------------------------------------------------------------------
# blocchi comuni

def blocco_titolare(m):
    """Il sottoscritto … (titolare/responsabile dell'attività) come in PIN 2 e PIN 3."""
    m.campo('Cognome', 0, 'tCognome')
    m.campo('Nome', 0, 'tNome')
    m.campo('indirizzo', 0, 'tIndirizzo')
    m.campo('n. civico', 0, 'tCivico')
    m.campo('c.a.p.', 0, 'tCap')
    m.campo('comune', 0, 'tComune')
    m.campo('provincia', 0, 'tProv')
    m.campo('telefono', 0, 'tTel')
    m.codice_fiscale()
    m.campo('qualifica rivestita (titolare, legale rappresentante, amministratore, etc.)', 0, 'qualifica')
    m.campo('ragione sociale ditta, impresa, ente, società, associazione, etc.', 0, 'ragione')
    m.campo('indirizzo', 1, 'sIndirizzo')
    m.campo('n. civico', 1, 'sCivico')
    m.campo('c.a.p.', 1, 'sCap')
    m.campo('comune', 1, 'sComune')
    m.campo('provincia', 1, 'sProv')
    m.campo('telefono', 1, 'sTel')
    m.campo('indirizzo di posta elettronica', 0, 'email')
    m.campo('indirizzo di posta elettronica certificata', 0, 'pec')


def blocco_attivita(m, prima_etichetta='Indirizzo'):
    m.campo('tipo di attività (albergo, scuola, centrale termica, etc.)', 0, 'tipoAttivita')
    m.campo(prima_etichetta, 0, 'aIndirizzo')
    m.campo('n. civico', 2, 'aCivico')
    m.campo('c.a.p.', 2, 'aCap')
    m.campo('Comune', 0, 'aComune')
    m.campo('provincia', 2, 'aProv')
    m.campo('telefono', 2, 'aTel')


def blocco_versamento(m, righe=8):
    m.importi(['totale'] + [f'vaImporto{k}' for k in range(righe)])
    for k in range(righe):
        m.campo('attività n.', k, f'vaN{k}')
        m.campo('Sottocl./ categoria', k, f'vaSotto{k}')


def blocco_corrispondenza(m):
    m.campo('Cognome', 1, 'cCognome')
    m.campo('Nome', 1, 'cNome')
    m.campo('indirizzo', 2, 'cIndirizzo')
    m.campo('n. civico', 3, 'cCivico')
    m.campo('c.a.p.', 3, 'cCap')
    m.campo('comune', 2, 'cComune')
    m.campo('Provincia', 0, 'cProv')
    m.campo('telefono', 3, 'cTel')
    m.campo('indirizzo di posta elettronica', 1, 'cEmail')
    m.campo('indirizzo di posta elettronica certificata', 1, 'cPec')


def blocco_delegato(m):
    m.campo('Titolo professionale', 0, 'dTitolo')
    m.campo('cognome', 0, 'dCognome')
    m.campo('nome', 0, 'dNome')
    m.campo('via – piazza', 0, 'dIndirizzo')
    m.campo('n. civico', 4, 'dCivico')
    m.campo('c.a.p.', 4, 'dCap')
    m.campo('comune', 3, 'dComune')
    m.campo('provincia', 3, 'dProv')
    m.campo('telefono', 4, 'dTel')


# ---------------------------------------------------------------------------------------------

def pin3(src):
    m = Modulo(os.path.join(src, 'PIN_3_2023_Rinnovo_FV.docx'))
    m.dopo_riga('Rif. Pratica VV.F. n.', 'rifPratica')
    m.dopo_riga('AL COMANDO DEI VIGILI DEL FUOCO DI', 'comando')
    blocco_titolare(m)
    m.testo_in('il', 'sciaPrecedente', ' ', 0)
    blocco_attivita(m)
    m.dopo_par('individuata al n./sotto classe/ cat.', 'classe')
    m.dopo_par('nn./sottoclasse/cat :', 'altreAttivita')
    m.casella('Allega', 'allegaAsseverazione', 0)
    m.casella('Non allega', 'nonAllegaAsseverazione', 0)
    blocco_versamento(m)
    blocco_corrispondenza(m)
    blocco_delegato(m)
    return m, 'pin3-rinnovo.docx'


def pin31(src):
    m = Modulo(os.path.join(src, 'PIN_3_1-2014AsseverazionePerRinnovo.docx'))
    m.dopo_riga('Rif. Pratica VV.F. n.', 'rifPratica')
    m.dopo_riga('AL COMANDO PROVINCIALE DEI VIGILI DEL FUOCO DI', 'comando')
    m.campo('Titolo professionale', 0, 'pTitolo')
    m.campo('Cognome', 0, 'pCognome')
    m.campo('Nome', 0, 'pNome')
    m.campo('ordine / collegio professionale', 0, 'pCollegio')
    m.dopo_par('della Provincia di', 'pAlboProv')
    m.dopo_par('con numero', 'pAlboNumero')
    m.campo('n° codice iscrizione M.I.', 0, 'pCodiceMI')
    m.campo('via - piazza', 0, 'pIndirizzo')
    m.campo('n. civico', 0, 'pCivico')
    m.campo('c.a.p.', 0, 'pCap')
    m.campo('comune', 0, 'pComune')
    m.campo('provincia', 0, 'pProv')
    m.campo('telefono', 0, 'pTel')
    m.campo('tipo di attività (albergo, scuola, centrale termica, etc.)', 0, 'tipoAttivita')
    m.campo('via - piazza', 1, 'aIndirizzo')
    m.campo('n. civico', 1, 'aCivico')
    m.campo('c.a.p.', 1, 'aCap')
    m.campo('comune', 1, 'aComune')
    m.campo('provincia', 1, 'aProv')
    m.campo('telefono', 1, 'aTel')
    m.testo_in('a firma di', 'sciaFirma', ' ', 0)
    m.campo('Data presentazione', 0, 'sciaData')
    m.trattini('ha effettuato in data', 'dataSopralluogo')
    for k in range(5):
        m.casella('estinzione o controllo|controllo del|rivelazione di|segnalazione e|altro, specificare'.split('|')[k], f'chkA{k}')
        m.dopo_riga(next(ptext(p) for p in m.par if ptext(p).startswith(('estinzione o controllo', 'controllo del', 'rivelazione di', 'segnalazione e', 'altro, specificare')[k])), f'testoA{k}')
    m.campo('Data', 0, 'dataFirma')
    return m, 'pin31-asseverazione-rinnovo.docx'


COSTRUTTORI = {'pin3': pin3, 'pin31': pin31}

if __name__ == '__main__':
    argv = sys.argv[1:]
    file_elenca = None
    if '--elenca' in argv:
        i = argv.index('--elenca')
        file_elenca = argv[i + 1]
        del argv[i:i + 2]
    src = argv[0] if argv else DEFAULT_SRC
    if file_elenca:
        elenca(os.path.join(src, file_elenca))
        sys.exit(0)
    for nome, costruttore in COSTRUTTORI.items():
        modulo, file = costruttore(src)
        modulo.scrivi(file)
