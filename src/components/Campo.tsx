import { useLayoutEffect, useRef, type InputHTMLAttributes, type TextareaHTMLAttributes, type Ref } from 'react';

interface CampoProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  etichetta: string;
  valore: string;
  onValore: (v: string) => void;
  aiuto?: string;
}

export function Campo({ etichetta, valore, onValore, aiuto, ...resto }: CampoProps) {
  return (
    <label className="campo">
      <span className="campo-etichetta">{etichetta}</span>
      <input {...resto} value={valore} onChange={(e) => onValore(e.target.value)} />
      {aiuto && <span className="campo-aiuto">{aiuto}</span>}
    </label>
  );
}

interface AreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> {
  valore: string;
  onValore: (v: string) => void;
  areaRef?: Ref<HTMLTextAreaElement>;
}

/** Textarea che si allunga col contenuto (niente doppio scroll sul telefono). */
export function AreaTesto({ valore, onValore, areaRef, ...resto }: AreaProps) {
  const interno = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = interno.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [valore]);
  return (
    <textarea
      {...resto}
      ref={(el) => {
        interno.current = el;
        if (typeof areaRef === 'function') areaRef(el);
        else if (areaRef) (areaRef as { current: HTMLTextAreaElement | null }).current = el;
      }}
      value={valore}
      onChange={(e) => onValore(e.target.value)}
    />
  );
}
