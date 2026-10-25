// Utilidades compartidas por los tests del motor.
import type { Rng } from './random';
import type { GamePlayer } from './state';

/** Generador con semilla (mulberry32) para tests reproducibles. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const fixedRng = (value: number): Rng => () => value;

/** Crea jugadores a partir de una lista de roles: p1, p2... */
export function playersWith(roles: string[], dead: number[] = []): GamePlayer[] {
  return roles.map((role, i) => ({
    id: `p${i + 1}`,
    name: `Jugador ${i + 1}`,
    alive: !dead.includes(i + 1),
    role,
  }));
}
