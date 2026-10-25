// Qué puede ver cada jugador de los roles de la partida.
import { getRole, type RoleCard, type Theme } from '../tematicas';
import { teamOf, type GamePlayer } from './state';

export interface MyRoleView {
  card: RoleCard;
  /** Solo para los malos: sus compañeros malos. */
  badTeammates?: { id: string; name: string }[];
}

/**
 * Vista de "Ver mi rol": la ficha propia y, si es malo, sus compañeros.
 * Nunca incluye el rol de ningún otro jugador.
 */
export function myRoleView(theme: Theme, players: GamePlayer[], viewerId: string): MyRoleView {
  const me = players.find((p) => p.id === viewerId);
  if (!me) throw new Error('Jugador no encontrado');
  const card = getRole(theme, me.role);
  if (card.bando !== 'bad') return { card };
  return {
    card,
    badTeammates: players
      .filter((p) => p.id !== me.id && teamOf(theme, p) === 'bad')
      .map((p) => ({ id: p.id, name: p.name })),
  };
}
