export interface FotoRidotta {
  blob: Blob;
  width: number;
  height: number;
  type: string;
}

const LATO_MAX = 1600;
const QUALITA = 0.8;

async function decodifica(file: Blob): Promise<{ img: CanvasImageSource; w: number; h: number; chiudi: () => void }> {
  if ('createImageBitmap' in window) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { img: bmp, w: bmp.width, h: bmp.height, chiudi: () => bmp.close() };
    } catch {
      /* fallback sotto (es. HEIC su browser vecchi) */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { img, w: img.naturalWidth, h: img.naturalHeight, chiudi: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

/** Ridimensiona lato client (lato lungo max 1600 px) e ricomprime in JPEG ~0,8. */
export async function ridimensionaFoto(file: Blob): Promise<FotoRidotta> {
  const { img, w, h, chiudi } = await decodifica(file);
  try {
    const k = Math.min(1, LATO_MAX / Math.max(w, h));
    const width = Math.max(1, Math.round(w * k));
    const height = Math.max(1, Math.round(h * k));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas non disponibile');
    ctx.fillStyle = '#fff'; // eventuali trasparenze (PNG) diventano bianche
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob>((ok, ko) =>
      canvas.toBlob((b) => (b ? ok(b) : ko(new Error('Conversione JPEG non riuscita'))), 'image/jpeg', QUALITA),
    );
    canvas.width = canvas.height = 0; // libera memoria (Safari)
    return { blob, width, height, type: 'image/jpeg' };
  } finally {
    chiudi();
  }
}
