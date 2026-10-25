// Qué narra el móvil del creador en cada cambio de la partida.
import { findRoleByKind, getRole, type RoleKind, type Theme } from '../tematicas';

export interface Spoken {
  texto: string;
  /** MP3 de ElevenLabs; si falta o falla, se lee con la voz del navegador. */
  audio?: string;
  /** Silencio después de la frase, en milisegundos. */
  pausaMs?: number;
}

/**
 * Silencio tras pedir que alguien cierre los ojos, antes de llamar al
 * siguiente. Así nadie abre los ojos mientras otro todavía los tiene abiertos.
 */
export const PAUSA_TRAS_CERRAR_MS = 5000;

export interface NarrationState {
  phase: string;
  nightStep: RoleKind | null;
  winner: 'bad' | 'good' | 'lovers' | null;
  /** Muertos de la última resolución, con su rol ya revelado. */
  deaths: { name: string; role: string | null }[];
}

function stepLine(theme: Theme, kind: RoleKind, open: boolean): Spoken | null {
  if (kind === 'bad') return open ? theme.textos.malos_abrid : theme.textos.malos_cerrad;
  const role = findRoleByKind(theme, kind);
  const turn = role && theme.textos.turnos[role.id];
  if (!turn) return null;
  return open ? turn.abrir : turn.cerrar;
}

function deathLines(theme: Theme, deaths: NarrationState['deaths']): Spoken[] {
  return deaths.map((d) => ({
    texto: d.role ? `${d.name}, que era ${getRole(theme, d.role).nombre}.` : `${d.name}.`,
  }));
}

/** Frases a narrar al pasar de `prev` a `next` (null = primera carga). */
export function narration(theme: Theme, prev: NarrationState | null, next: NarrationState): Spoken[] {
  const lines: (Spoken | null)[] = [];
  const close = (line: Spoken | null) => lines.push(line && { ...line, pausaMs: PAUSA_TRAS_CERRAR_MS });
  const closePrevStep = () => {
    if (prev?.phase === 'night' && prev.nightStep) close(stepLine(theme, prev.nightStep, false));
  };

  switch (next.phase) {
    case 'intro':
      lines.push(theme.textos.introduccion);
      break;
    case 'night':
      if (prev?.phase === 'night' && prev.nightStep === next.nightStep) break;
      closePrevStep();
      if (prev?.phase !== 'night') close(theme.textos.cerrad_ojos);
      if (next.nightStep) lines.push(stepLine(theme, next.nightStep, true));
      break;
    case 'dawn':
      closePrevStep();
      if (prev?.phase === 'dawn') {
        // Muertes del disparo del Cazador.
        lines.push(...deathLines(theme, next.deaths));
      } else if (next.deaths.length) {
        lines.push(theme.textos.amanecer, ...deathLines(theme, next.deaths));
      } else {
        lines.push(theme.textos.amanecer_sin_victima);
      }
      break;
    case 'day':
      lines.push(theme.textos.dia);
      break;
    case 'lynch':
      if (prev?.phase === 'lynch') {
        lines.push(...deathLines(theme, next.deaths));
      } else if (next.deaths.length) {
        lines.push(theme.textos.linchamiento, ...deathLines(theme, next.deaths));
      } else {
        lines.push({ texto: 'Hay empate y nadie es linchado.' });
      }
      break;
    case 'finished':
      closePrevStep();
      if (next.deaths.length && prev?.phase !== 'finished') lines.push(...deathLines(theme, next.deaths));
      if (next.winner) lines.push(theme.textos.victoria[next.winner]);
      break;
  }
  const result = lines.filter((l): l is Spoken => l !== null);
  // La pausa solo hace falta si después se llama a alguien.
  const last = result.at(-1);
  if (last?.pausaMs) result[result.length - 1] = { texto: last.texto, ...(last.audio && { audio: last.audio }) };
  return result;
}
