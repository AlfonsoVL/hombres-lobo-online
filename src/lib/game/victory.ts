// Condiciones de victoria.
import type { Theme } from '../tematicas';
import { kindOf, teamOf, type GamePlayer, type Link } from './state';

export type Winner = 'bad' | 'good' | 'lovers';

/**
 * Devuelve el bando ganador o null si la partida sigue.
 *  - Enamorados: los dos siguen vivos y los únicos otros vivos son Cupido
 *    (o el Androide).
 *  - Buenos: no queda ningún malo vivo.
 *  - Malos: igualan o superan en número a los vivos no malos.
 */
export function checkVictory(theme: Theme, players: GamePlayer[], link: Link | null): Winner | null {
  const alive = players.filter((p) => p.alive);

  if (link) {
    const [a, b] = link;
    const bothAlive = alive.some((p) => p.id === a) && alive.some((p) => p.id === b);
    const onlyLinkedOrLinker = alive.every(
      (p) => p.id === a || p.id === b || kindOf(theme, p) === 'link',
    );
    if (bothAlive && onlyLinkedOrLinker) return 'lovers';
  }

  const bad = alive.filter((p) => teamOf(theme, p) === 'bad').length;
  if (bad === 0) return 'good';
  if (bad >= alive.length - bad) return 'bad';
  return null;
}
