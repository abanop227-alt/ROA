import { committente, nuovaAttivita } from '../lib/catalogo';
import { eliminaFoto } from '../lib/db';
import { indirizzoStabile, type Stabile } from '../lib/stabili';
import type { Catalogo, DatiCondominio, Sopralluogo } from '../lib/types';
import { Campo } from './Campo';
import FotoVoce from './FotoVoce';
import RicercaStabile from './RicercaStabile';

interface Props {
  s: Sopralluogo;
  catalogo: Catalogo;
  aggiorna: (f: (s: Sopralluogo) => Sopralluogo) => void;
}

/** Precompila condominio, amministrazione, NOP e attività da uno stabile importato (non tocca ciò che è già compilato). */
export function applicaStabile(x: Sopralluogo, st: Stabile, catalogo: Catalogo): Sopralluogo {
  const c = x.condominio;
  const nome = st.nome.replace(/^condominio\s+/i, '');
  const nuove = st.attivita.filter((cod) => !x.attivita.some((a) => a.codice === cod)).map((cod) => nuovaAttivita(catalogo, cod));
  return {
    ...x,
    attivita: [...x.attivita, ...nuove],
    condominio: {
      ...c,
      nome: c.nome || (nome.toLowerCase() === st.via.toLowerCase() ? '' : nome),
      indirizzo: indirizzoStabile(st),
      cap: st.cap || c.cap,
      comune: st.comune || c.comune,
      codiceFiscale: st.codiceFiscale || c.codiceFiscale,
      pressoAmministrazione: c.pressoAmministrazione || (st.amministrazione ? `Amministrazione ${st.amministrazione}` : ''),
    },
    ...(x.pratica && /^\d{4,}$/.test(st.nop) && !x.pratica.nPraticaVvf ? { pratica: { ...x.pratica, nPraticaVvf: st.nop } } : {}),
  };
}

type Def = { k: keyof DatiCondominio; etichetta: string; tipo?: string; inputMode?: 'tel' | 'numeric'; aiuto?: string };

const CONDOMINIO: Def[] = [
  { k: 'nome', etichetta: 'Nome condominio (facoltativo)', aiuto: 'es. “Rada”: nel titolo diventa “RELATIVAMENTE AL CONDOMINIO RADA”' },
  { k: 'indirizzo', etichetta: 'Indirizzo immobile', aiuto: 'es. Via Medea, 18' },
  { k: 'cap', etichetta: 'CAP', inputMode: 'numeric' },
  { k: 'comune', etichetta: 'Comune' },
  { k: 'codiceFiscale', etichetta: 'C.F. condominio', inputMode: 'numeric' },
];
const AMMINISTRAZIONE: Def[] = [
  { k: 'pressoAmministrazione', etichetta: 'c/o amministrazione' },
  { k: 'indirizzoAmministrazione', etichetta: 'Indirizzo amministrazione' },
  { k: 'telefono', etichetta: 'Telefono', tipo: 'tel', inputMode: 'tel' },
];
const INCARICO: Def[] = [
  { k: 'commessa', etichetta: 'N. commessa', aiuto: 'va anche nel piè di pagina' },
  { k: 'dataSopralluogo', etichetta: 'Data sopralluogo', tipo: 'date' },
  { k: 'dataRelazione', etichetta: 'Data relazione (firma)', tipo: 'date' },
];

export default function Step2Condominio({ s, catalogo, aggiorna }: Props) {
  const campo = (c: Def) => (
    <Campo
      key={c.k}
      etichetta={c.etichetta}
      type={c.tipo ?? 'text'}
      inputMode={c.inputMode}
      autoComplete="off"
      aiuto={c.aiuto}
      valore={s.condominio[c.k]}
      onValore={(v) => aggiorna((x) => ({ ...x, condominio: { ...x.condominio, [c.k]: v } }))}
    />
  );
  return (
    <section>
      <h2 className="titolo-passo">Dati condominio</h2>
      <RicercaStabile onScegli={(st) => aggiorna((x) => applicaStabile(x, st, catalogo))} />
      <div className="card">
        {CONDOMINIO.map(campo)}
        <Campo
          etichetta="Committente (tabella dati)"
          valore={s.condominio.committente}
          placeholder={committente({ ...s, condominio: { ...s.condominio, committente: '' } }) || 'Condominio …'}
          aiuto="Vuoto = composto da nome, indirizzo, CAP e comune"
          onValore={(v) => aggiorna((x) => ({ ...x, condominio: { ...x.condominio, committente: v } }))}
        />
      </div>
      <h3 className="titolo-sezione">Amministrazione</h3>
      <div className="card">{AMMINISTRAZIONE.map(campo)}</div>
      <h3 className="titolo-sezione">Incarico</h3>
      <div className="card">
        {INCARICO.map(campo)}
        <FotoVoce
          singola
          etichetta="Foto di copertina (facciata)"
          sopralluogoId={s.id}
          fotoIds={s.fotoCopertinaId ? [s.fotoCopertinaId] : []}
          onAggiunte={(ids) => {
            const vecchia = s.fotoCopertinaId;
            aggiorna((x) => ({ ...x, fotoCopertinaId: ids[0] ?? x.fotoCopertinaId }));
            if (vecchia) eliminaFoto(vecchia);
          }}
          onRimossa={() => aggiorna((x) => ({ ...x, fotoCopertinaId: null }))}
        />
      </div>
    </section>
  );
}
