// Foto propia de cada sala, solo en memoria: al recargar la página se pierde
// y se usan las iniciales.
const photos = new Map<string, string>();

export function setOwnPhoto(code: string, photo: string | null): void {
  if (photo) photos.set(code, photo);
  else photos.delete(code);
}

export function getOwnPhoto(code: string): string | null {
  return photos.get(code) ?? null;
}
