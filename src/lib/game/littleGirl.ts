// Niña: espiar durante el turno de los malos.
import type { Theme } from '../tematicas';
import { defaultRng, pick, type Rng } from './random';
import { kindOf, type GamePlayer } from './state';

export const LITTLE_GIRL_DISCOVERY_CHANCE = 0.5;

export type SpyResult =
  | { ok: false; error: string }
  | { ok: true; discovered: true }
  | { ok: true; discovered: false; seen: { playerId: string; role: string } };

/**
 * La Niña espía. Con un 50 % la descubren y muere; si no, ve el rol de un
 * jugador vivo al azar entre los malos y los buenos sin rol.
 * PENDIENTE de confirmar: no puede espiar dos noches seguidas.
 */
export function spy(
  theme: Theme,
  players: GamePlayer[],
  round: number,
  lastSpyRound: number | null,
  rng: Rng = defaultRng,
): SpyResult {
  if (lastSpyRound !== null && lastSpyRound === round - 1) {
    return { ok: false, error: 'No puedes espiar dos noches seguidas.' };
  }
  if (rng() < LITTLE_GIRL_DISCOVERY_CHANCE) return { ok: true, discovered: true };

  const candidates = players.filter((p) => {
    const kind = kindOf(theme, p);
    return p.alive && (kind === 'bad' || kind === 'plain_good');
  });
  const seen = pick(candidates, rng);
  return { ok: true, discovered: false, seen: { playerId: seen.id, role: seen.role } };
}
