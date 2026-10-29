// Turno de los malos: reacciones rápidas para ponerse de acuerdo sin hablar y
// cuenta atrás. El servidor cierra el turno a los 60 s; aquí solo se muestra.
import { findRoleByKind, type Theme } from '../tematicas';

export type BadReaction = 'yes' | 'no' | 'seer' | 'suspect';

export interface BadReactionInfo {
  id: BadReaction;
  emoji: string;
  label: string;
}

/** Reacciones en el orden en que se muestran. «Vidente» toma el nombre de la temática. */
export function badReactions(theme: Theme): BadReactionInfo[] {
  const seer = findRoleByKind(theme, 'investigate')?.nombre.toLowerCase() ?? 'vidente';
  return [
    { id: 'yes', emoji: '👍', label: 'A por él' },
    { id: 'no', emoji: '👎', label: 'Este no' },
    { id: 'seer', emoji: '🔮', label: `Creo que es ${seer}` },
    { id: 'suspect', emoji: '⚠️', label: 'Sospecha de nosotros' },
  ];
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
