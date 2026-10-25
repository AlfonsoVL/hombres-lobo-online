// Fotos de los jugadores. Viven solo en la memoria del navegador: nunca se
// guardan en Postgres, en Supabase Storage ni en localStorage.

export const PHOTO_SIZE = 96;
export const PHOTO_QUALITY = 0.5;
/**
 * Tamaño máximo de una foto en el mensaje de Broadcast. Una foto de 96 px
 * ocupa unos 3-5 KB; si alguna supera esto, no se envía y se avisa en consola
 * para revisar la estrategia antes de cambiarla.
 */
export const MAX_PHOTO_CHARS = 32_000;

/** Recorta al cuadrado central y comprime a JPEG de PHOTO_SIZE px. */
export function captureSquarePhoto(
  source: CanvasImageSource,
  width: number,
  height: number,
  mirror = true,
): string {
  const side = Math.min(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = PHOTO_SIZE;
  canvas.height = PHOTO_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('El navegador no permite procesar la foto');
  if (mirror) {
    // La cámara frontal se ve como un espejo; la foto se guarda igual que se vio.
    ctx.translate(PHOTO_SIZE, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, (width - side) / 2, (height - side) / 2, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
  return canvas.toDataURL('image/jpeg', PHOTO_QUALITY);
}

export function isSendablePhoto(dataUrl: string): boolean {
  return dataUrl.startsWith('data:image/jpeg;base64,') && dataUrl.length <= MAX_PHOTO_CHARS;
}

/** Iniciales para el avatar sin foto: «Ana María» → «AM». */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0]!, words[1]!] : [words[0] ?? '?'];
  return letters
    .map((w) => [...w][0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/** Color estable para las iniciales de cada jugador. */
export function initialsColor(id: string): string {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 45% 35%)`;
}
