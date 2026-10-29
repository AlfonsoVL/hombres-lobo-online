// Turno de los malos: reacciones rápidas para ponerse de acuerdo sin hablar y
// cuenta atrás. El servidor cierra el turno a los 60 s; aquí solo se muestra.
import { getRole, type Theme } from '../tematicas';

/** Etiqueta fija o «creo que es…» con un rol del bando bueno (`role:<id>`). */
export type BadReaction = 'yes' | 'no' | 'suspect' | `role:${string}`;

export interface BadReactionInfo {
  id: BadReaction;
  emoji: string;
  label: string;
}

/** Etiquetas fijas, en el orden en que se muestran. */
export const BAD_REACTIONS: BadReactionInfo[] = [
  { id: 'yes', emoji: '👍', label: 'A por él' },
  { id: 'no', emoji: '👎', label: 'Este no' },
  { id: 'suspect', emoji: '⚠️', label: 'Sospecha de nosotros' },
];

export const GUESS_EMOJI = '🔮';

export function guessReaction(role: string): BadReaction {
  return `role:${role}`;
}

/** Rol de una reacción «creo que es…», o null si es una etiqueta fija. */
export function guessedRole(reaction: BadReaction): string | null {
  return reaction.startsWith('role:') ? reaction.slice(5) : null;
}

/** Cómo se muestra una reacción: «👍 A por él» o «🔮 Vidente». */
export function reactionText(theme: Theme, reaction: BadReaction): string {
  const role = guessedRole(reaction);
  if (role) return `${GUESS_EMOJI} ${getRole(theme, role).nombre}`;
  const info = BAD_REACTIONS.find((r) => r.id === reaction);
  return info ? `${info.emoji} ${info.label}` : '';
}

export interface ReactionEntry {
  voter: string;
  mine: boolean;
  target: string;
  reaction: BadReaction;
}

/** Reacciones a un candidato agrupadas por tipo, con quién las ha puesto. */
export function reactionsFor(
  reactions: ReactionEntry[],
  target: string,
): { reaction: BadReaction; voters: string[]; mine: boolean }[] {
  const groups = new Map<BadReaction, { voters: string[]; mine: boolean }>();
  for (const r of reactions) {
    if (r.target !== target) continue;
    const g = groups.get(r.reaction) ?? { voters: [], mine: false };
    if (r.mine) g.mine = true;
    else g.voters.push(r.voter);
    groups.set(r.reaction, g);
  }
  return [...groups].map(([reaction, g]) => ({ reaction, ...g }));
}

/**
 * Segundos que quedan hasta `endsAt`, corrigiendo el desfase del reloj del
 * móvil con la hora del servidor (`serverTime`, leída en `receivedAt`).
 */
export function secondsLeft(endsAt: string, serverTime: string, receivedAt: number, now: number): number {
  const offset = Date.parse(serverTime) - receivedAt;
  return Math.max(0, Math.ceil((Date.parse(endsAt) - (now + offset)) / 1000));
}

/** 75 → «1:15». */
export function formatSeconds(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
