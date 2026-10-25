/** Generador de números aleatorios en [0, 1). Se inyecta para poder testear. */
export type Rng = () => number;

export const defaultRng: Rng = () => {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]! / 2 ** 32;
};

/** Baraja una copia del array (Fisher-Yates). */
export function shuffle<T>(items: readonly T[], rng: Rng = defaultRng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function pick<T>(items: readonly T[], rng: Rng = defaultRng): T {
  if (items.length === 0) throw new Error('No hay elementos entre los que elegir');
  return items[Math.floor(rng() * items.length)]!;
}
