// Reparto de roles. Es el mismo algoritmo que iniciar_partida en SQL; en la app
// real el reparto lo hace siempre el servidor.
import { roleByKind, type Theme } from '../tematicas';
import type { Composition } from './composition';
import { defaultRng, shuffle, type Rng } from './random';

/** Cartas extra que entran en la baraja cuando hay Ladrón. */
export const THIEF_EXTRA_CARDS = 2;

export interface Deal {
  /** Rol de cada jugador, por id de jugador. */
  roles: Map<string, string>;
  /** Cartas sin repartir (solo con Ladrón). */
  undealt: string[];
}

export function buildDeck(theme: Theme, c: Composition): string[] {
  const hasThief = c.specials.some((id) => theme.roles.find((r) => r.id === id)?.tipo === 'swap');
  const extra = hasThief ? THIEF_EXTRA_CARDS : 0;
  return [
    ...Array<string>(c.bad).fill(roleByKind(theme, 'bad').id),
    ...c.specials,
    ...Array<string>(c.plain + extra).fill(roleByKind(theme, 'plain_good').id),
  ];
}

export function dealRoles(
  theme: Theme,
  c: Composition,
  playerIds: string[],
  rng: Rng = defaultRng,
): Deal {
  if (playerIds.length !== c.players) {
    throw new Error(`La composición es para ${c.players} jugadores y hay ${playerIds.length}.`);
  }
  const deck = shuffle(buildDeck(theme, c), rng);
  // El Ladrón siempre se reparte: se pone al principio de la baraja.
  const thiefIndex = deck.findIndex((id) => theme.roles.find((r) => r.id === id)?.tipo === 'swap');
  if (thiefIndex > 0) deck.unshift(...deck.splice(thiefIndex, 1));

  const seats = shuffle(playerIds, rng);
  const roles = new Map(seats.map((id, i) => [id, deck[i]!]));
  return { roles, undealt: deck.slice(playerIds.length) };
}
