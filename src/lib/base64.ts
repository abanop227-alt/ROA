export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const PASSO = 0x8000;
  for (let i = 0; i < bytes.length; i += PASSO) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + PASSO)));
  }
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
