// Eventos de Broadcast. Solo llevan cambios y nunca datos de rol.
import type { Theme } from '../tematicas';

export type GameEvent =
  | { type: 'jugador_unido'; version: number; id: string; name: string }
  | { type: 'partida_iniciada'; version: number }
  | { type: 'fase_cambiada'; version: number; phase: string; round: number; nightStep: string | null }
  | { type: 'jugador_eliminado'; version: number; id: string; revealedRole: string | null }
  | { type: 'partida_terminada'; version: number; winner: string };

/**
 * Lanza un error si un evento contiene datos de rol que no estén revelados.
 * Solo se permite el rol en `revealedRole` (linchados y fin de partida).
 */
export function assertNoRoleData(theme: Theme, event: GameEvent): void {
  const { revealedRole: _allowed, ...rest } = event as GameEvent & { revealedRole?: unknown };
  const text = JSON.stringify(rest);
  for (const role of theme.roles) {
    if (text.includes(`"${role.id}"`)) {
      throw new Error(`El evento ${event.type} contiene el rol ${role.id}`);
    }
  }
}
