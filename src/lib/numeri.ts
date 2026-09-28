/** Interpreta un numero digitato all'italiana ("1.234,56", "1,5") o all'inglese ("1.5"). */
export function parseNumero(testo: string | number | null | undefined): number {
  if (typeof testo === 'number') return Number.isFinite(testo) ? testo : 0;
  let s = String(testo ?? '').trim().replace(/\s|€/g, '');
  if (!s) return 0;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // "1.234" o "1.234.567" = separatore delle migliaia
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Formato italiano: 1.234,56 */
export function formatNumero(n: number, decimali = 2): string {
  const neg = n < 0;
  const [intero, dec] = Math.abs(n).toFixed(decimali).split('.');
  const conPunti = intero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '-' : '') + conPunti + (dec ? ',' + dec : '');
}

/** Quantità: senza decimali inutili (2 → "2", 2,5 → "2,5") */
export function formatQuantita(n: number): string {
  const arrot = Math.round(n * 1000) / 1000;
  const dec = (String(arrot).split('.')[1] || '').length;
  return formatNumero(arrot, dec);
}
