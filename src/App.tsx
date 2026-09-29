import { useCallback, useEffect, useState } from 'react';
import Home from './components/Home';
import Wizard from './components/Wizard';
import { catalogoPredefinito } from './lib/catalogo';
import { leggiCatalogoPersonalizzato } from './lib/db';
import type { Catalogo } from './lib/types';

export interface Rotta {
  id: string | null;
  passo: number;
}

function leggiRotta(): Rotta {
  const m = /^#\/s\/([^/]+)(?:\/(\d))?/.exec(location.hash);
  return m ? { id: decodeURIComponent(m[1]), passo: Math.min(4, Math.max(0, Number(m[2] ?? 0))) } : { id: null, passo: 0 };
}

export function vaiA(r: Rotta, sostituisci = false): void {
  const hash = r.id ? `#/s/${encodeURIComponent(r.id)}/${r.passo}` : '#/';
  if (sostituisci) history.replaceState(null, '', hash);
  else history.pushState(null, '', hash);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export default function App() {
  const [rotta, setRotta] = useState<Rotta>(leggiRotta);
  const [catalogo, setCatalogo] = useState<Catalogo>(catalogoPredefinito);
  const [personalizzato, setPersonalizzato] = useState(false);

  const ricaricaCatalogo = useCallback(async () => {
    const c = await leggiCatalogoPersonalizzato().catch(() => undefined);
    // una libreria caricata con la prima versione dell'app (senza "famiglie") non è più valida
    const valido = c && (c as Catalogo).versione === 2 ? c : undefined;
    setCatalogo(valido ?? catalogoPredefinito);
    setPersonalizzato(!!valido);
  }, []);

  useEffect(() => {
    ricaricaCatalogo();
    const agg = () => setRotta(leggiRotta());
    window.addEventListener('hashchange', agg);
    window.addEventListener('popstate', agg);
    return () => {
      window.removeEventListener('hashchange', agg);
      window.removeEventListener('popstate', agg);
    };
  }, [ricaricaCatalogo]);

  if (rotta.id) {
    return (
      <Wizard
        key={rotta.id}
        id={rotta.id}
        passo={rotta.passo}
        catalogo={catalogo}
        onPasso={(p) => vaiA({ id: rotta.id, passo: p }, true)}
        onEsci={() => vaiA({ id: null, passo: 0 }, true)}
      />
    );
  }
  return (
    <Home
      catalogo={catalogo}
      catalogoPersonalizzato={personalizzato}
      onCatalogoCambiato={ricaricaCatalogo}
      onApri={(id) => vaiA({ id, passo: 0 })}
    />
  );
}
