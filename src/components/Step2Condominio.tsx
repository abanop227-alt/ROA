import type { DatiCondominio, Sopralluogo } from '../lib/types';
import { Campo } from './Campo';

interface Props {
  s: Sopralluogo;
  aggiorna: (f: (s: Sopralluogo) => Sopralluogo) => void;
}

const CAMPI: { k: keyof DatiCondominio; etichetta: string; tipo?: string; inputMode?: 'tel' | 'numeric' | 'text' }[] = [
  { k: 'committente', etichetta: 'Committente / condominio' },
  { k: 'indirizzo', etichetta: 'Indirizzo immobile' },
  { k: 'comune', etichetta: 'Comune' },
  { k: 'codiceFiscale', etichetta: 'C.F. condominio' },
  { k: 'dataSopralluogo', etichetta: 'Data sopralluogo', tipo: 'date' },
  { k: 'pressoAmministrazione', etichetta: 'c/o amministrazione' },
  { k: 'indirizzoAmministrazione', etichetta: 'Indirizzo amministrazione' },
  { k: 'telefono', etichetta: 'Telefono', tipo: 'tel', inputMode: 'tel' },
  { k: 'commessa', etichetta: 'N. commessa' },
];

export default function Step2Condominio({ s, aggiorna }: Props) {
  return (
    <section>
      <h2 className="titolo-passo">Dati condominio</h2>
      <div className="card">
        {CAMPI.map((c) => (
          <Campo
            key={c.k}
            etichetta={c.etichetta}
            type={c.tipo ?? 'text'}
            inputMode={c.inputMode}
            autoCapitalize={c.k === 'codiceFiscale' ? 'characters' : 'sentences'}
            autoComplete="off"
            valore={s.condominio[c.k]}
            onValore={(v) => aggiorna((x) => ({ ...x, condominio: { ...x.condominio, [c.k]: v } }))}
          />
        ))}
      </div>
    </section>
  );
}
