import { committente } from '../lib/catalogo';
import { eliminaFoto } from '../lib/db';
import type { DatiCondominio, Sopralluogo } from '../lib/types';
import { Campo } from './Campo';
import FotoVoce from './FotoVoce';

interface Props {
  s: Sopralluogo;
  aggiorna: (f: (s: Sopralluogo) => Sopralluogo) => void;
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

export default function Step2Condominio({ s, aggiorna }: Props) {
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
