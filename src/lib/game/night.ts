// Orden de los turnos de la noche y qué ve cada jugador en cada turno.
import type { RoleKind, Theme } from '../tematicas';
import { kindOf, teamOf, type GamePlayer } from './state';

/** Tipos de rol que solo actúan la primera noche. */
export const FIRST_NIGHT_ONLY: RoleKind[] = ['swap', 'link'];

/** Turnos que el propio rol confirma tras leer el resultado (Vidente y Flautista). */
export const CONFIRM_STEPS: RoleKind[] = ['investigate', 'compare'];

/** Lobos especiales con turno propio, después del de la manada. */
export const SPECIAL_BAD_STEPS: RoleKind[] = ['infect', 'fierce', 'white'];

// Orden de los turnos. El Ladrón va primero para que, si se convierte en malo,
// vote ya con los malos esa misma noche. Mismo orden que _night_order en SQL.
const NIGHT_ORDER: RoleKind[] = ['swap', 'link', 'bad', 'infect', 'fierce', 'white', 'investigate', 'compare', 'protect'];

/** Turnos de los aldeanos que desaparecen si la aldea mata al Anciano. */
export const GOOD_POWER_STEPS: RoleKind[] = ['swap', 'link', 'investigate', 'compare', 'protect'];

/**
 * Turnos de una noche (la primera es la ronda 1) según los roles de los vivos.
 * La manada es cualquier malo vivo. El Lobo Blanco solo actúa las noches pares
 * y el Lobo Feroz mientras no haya muerto ningún malo. Si los aldeanos han
 * perdido sus poderes (`powersLost`), no tienen turno.
 */
export function nightSteps(theme: Theme, players: GamePlayer[], round: number, powersLost = false): RoleKind[] {
  const alive = players.filter((p) => p.alive);
  const kinds = new Set(alive.map((p) => kindOf(theme, p)));
  if (alive.some((p) => teamOf(theme, p) === 'bad')) kinds.add('bad');
  const badDied = players.some((p) => !p.alive && teamOf(theme, p) === 'bad');
  return NIGHT_ORDER.filter(
    (kind) =>
      kinds.has(kind) &&
      (round === 1 || !FIRST_NIGHT_ONLY.includes(kind)) &&
      (kind !== 'white' || round % 2 === 0) &&
      (kind !== 'fierce' || !badDied) &&
      (!powersLost || !GOOD_POWER_STEPS.includes(kind)),
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
  if (myKind === 'spy' && spy.lastSpyRound === round - 1) return 'sleep';
  // Los malos actúan en el turno de la manada y los especiales, también en el suyo.
  const mySteps: RoleKind[] =
    myKind === 'spy' ? ['bad'] : teamOf(theme, me) === 'bad' ? ['bad', myKind] : [myKind];

  const current = steps.indexOf(currentStep);
  const mine = mySteps.map((s) => steps.indexOf(s)).filter((i) => i !== -1);
  if (!mine.length || current === -1) return 'sleep';
  if (mine.includes(current)) return 'act';
  return mine.some((i) => i > current) ? 'wait' : 'sleep';
}

/**
 * Si los móviles deben pedir solos el paso al siguiente turno de la noche: se ha
 * acabado la cuenta atrás o el rol activo ya ha actuado. La Vidente y el
 * Flautista no pasan solos al ver el resultado: lo confirman con su botón para
 * que les dé tiempo a leerlo.
 */
export function shouldAutoAdvanceNight(
  step: RoleKind | null,
  stepDone: boolean,
  secondsLeft: number | null,
): boolean {
  if (!step) return false;
  if (secondsLeft === 0) return true;
  return stepDone && !CONFIRM_STEPS.includes(step);
}
