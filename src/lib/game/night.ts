// Orden de los turnos de la noche y qué ve cada jugador en cada turno.
import type { RoleKind, Theme } from '../tematicas';
import { kindOf, type GamePlayer } from './state';

/** Tipos de rol que solo actúan la primera noche. */
export const FIRST_NIGHT_ONLY: RoleKind[] = ['swap', 'link'];

// Orden de los turnos. El Ladrón va primero para que, si se convierte en malo,
// vote ya con los malos esa misma noche.
const NIGHT_ORDER: RoleKind[] = ['swap', 'link', 'bad', 'investigate', 'protect'];

/** Turnos de una noche (la primera es la ronda 1) según los roles repartidos. */
export function nightSteps(theme: Theme, players: GamePlayer[], round: number): RoleKind[] {
  const kinds = new Set(players.map((p) => kindOf(theme, p)));
  return NIGHT_ORDER.filter(
    (kind) => kinds.has(kind) && (round === 1 || !FIRST_NIGHT_ONLY.includes(kind)),
  );
}

/** Rondas en que la Niña ha espiado. */
export interface SpyHistory {
  lastSpyRound: number | null;
}

export type PowerButton = 'act' | 'wait' | 'sleep';

/**
 * Qué ve un jugador durante la noche:
 *  - 'act': su turno, se muestra el botón de poder.
 *  - 'wait': su rol actúa más tarde esta noche ("Espera tu turno").
 *  - 'sleep': no le toca ("Duerme").
 */
export function powerButton(
  theme: Theme,
  players: GamePlayer[],
  viewerId: string,
  round: number,
  currentStep: RoleKind,
  spy: SpyHistory = { lastSpyRound: null },
): PowerButton {
  const me = players.find((p) => p.id === viewerId);
  if (!me || !me.alive) return 'sleep';

  const steps = nightSteps(theme, players, round);
  const myKind = kindOf(theme, me);
  // La Niña actúa durante el turno de los malos, si no espió la noche anterior.
  const myStep: RoleKind = myKind === 'spy' ? 'bad' : myKind;
  if (myKind === 'spy' && spy.lastSpyRound === round - 1) return 'sleep';

  const mine = steps.indexOf(myStep);
  const current = steps.indexOf(currentStep);
  if (mine === -1 || current === -1) return 'sleep';
  if (mine === current) return 'act';
  return mine > current ? 'wait' : 'sleep';
}

/**
 * Si los móviles deben pedir solos el paso al siguiente turno de la noche: se ha
 * acabado la cuenta atrás o el rol activo ya ha actuado. La Vidente no pasa
 * sola al ver el rol: lo confirma ella con su botón para que le dé tiempo a leerlo.
 */
export function shouldAutoAdvanceNight(
  step: RoleKind | null,
  stepDone: boolean,
  secondsLeft: number | null,
): boolean {
  if (!step) return false;
  if (secondsLeft === 0) return true;
  return stepDone && step !== 'investigate';
}
