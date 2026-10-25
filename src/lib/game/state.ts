// Estado mínimo de una partida que usa el motor.
import { getRole, type RoleKind, type Team, type Theme } from '../tematicas';

export interface GamePlayer {
  id: string;
  name: string;
  alive: boolean;
  role: string;
}

/** Pareja vinculada por Cupido o el Androide. */
export type Link = readonly [string, string];

export function teamOf(theme: Theme, p: GamePlayer): Team {
  return getRole(theme, p.role).bando;
}

export function kindOf(theme: Theme, p: GamePlayer): RoleKind {
  return getRole(theme, p.role).tipo;
}
