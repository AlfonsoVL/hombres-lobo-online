// Llamadas a las funciones SQL. Los errores de Postgres ya vienen en español.
import type { RoleKind, ThemeId } from '../tematicas';
import type { GameHistory } from '../game/historial';
import type { BadReaction, ReactionEntry } from '../game/badTurn';
import { getSupabase } from './client';

export type Mode = 'classic' | 'custom';
export type Phase = 'lobby' | 'intro' | 'role_reveal' | 'night' | 'dawn' | 'day' | 'lynch' | 'finished';

export interface PublicPlayer {
  id: string;
  name: string;
  is_creator: boolean;
  is_alive: boolean;
  revealed_role: string | null;
}

export interface PublicRoom {
  code: string;
  theme: ThemeId;
  mode: Mode;
  phase: Phase;
  night_step: RoleKind | null;
  /** Si ya ha actuado quien tiene el turno de noche. */
  step_done: boolean;
  /** Fin del turno de los malos (solo durante su turno) y hora del servidor al leer la sala. */
  step_ends_at: string | null;
  server_time: string;
  round: number;
  version: number;
  winner: 'bad' | 'good' | 'lovers' | null;
  mayor_id: string | null;
  /** Cazador que tiene que disparar antes de seguir. */
  pending_shot: string | null;
  /** Muertos de la última resolución (amanecer, linchamiento o disparo). */
  last_deaths: string[];
  /** Votos del día: son públicos. */
  votes: { voter: string; target: string }[];
  me: { id: string; is_creator: boolean };
  players: PublicPlayer[];
}

export class RpcError extends Error {}

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().rpc(fn, args);
  if (error) throw new RpcError(error.message || 'Error de conexión. Inténtalo de nuevo.');
  return data as T;
}

export async function createRoom(theme: ThemeId, mode: Mode, name: string, token: string) {
  const rows = await call<{ room_code: string; player_id: string }[]>('create_room', {
    p_theme: theme,
    p_mode: mode,
    p_name: name,
    p_token: token,
  });
  const row = rows[0];
  if (!row) throw new RpcError('No se ha podido crear la sala.');
  return { code: row.room_code, playerId: row.player_id };
}

export function joinRoom(code: string, name: string, token: string) {
  return call<string>('join_room', { p_room_code: code, p_name: name, p_token: token });
}

export function getRoom(code: string, token: string) {
  return call<PublicRoom>('get_room', { p_room_code: code, p_token: token });
}

export function getHistory(code: string, token: string) {
  return call<GameHistory>('historial_partida', { p_room_code: code, p_token: token });
}

/** Estado público de una sala para quien abre el enlace sin estar dentro. */
export interface RoomStatus {
  exists: boolean;
  theme?: ThemeId;
  phase?: 'lobby' | 'playing' | 'finished';
  winner?: 'bad' | 'good' | 'lovers' | null;
}

export function getRoomStatus(code: string) {
  return call<RoomStatus>('estado_sala', { p_room_code: code });
}

export function cancelRoom(code: string, token: string) {
  return call<void>('cancel_room', { p_room_code: code, p_token: token });
}

export function startGame(
  code: string,
  token: string,
  specialRoles: string[],
  badCount: number,
  mayor: boolean,
) {
  return call<void>('iniciar_partida', {
    p_room_code: code,
    p_token: token,
    p_special_roles: specialRoles,
    p_bad_count: badCount,
    p_mayor: mayor,
  });
}

/** Rol propio. Los malos reciben también a sus compañeros; nunca llega el rol de otro. */
export interface MyRole {
  player_id: string;
  role: string;
  team: 'bad' | 'good';
  is_alive: boolean;
  bad_teammates: { id: string; name: string }[] | null;
  /** Enamorado, si Cupido te ha elegido. */
  lover: { id: string; name: string } | null;
}

export function getMyRole(token: string) {
  return call<MyRole>('obtener_mi_rol', { p_token: token });
}

/** Solo el creador. `version` evita que dos toques seguidos se salten una fase. */
export function advancePhase(code: string, token: string, version: number) {
  return call<void>('avanzar_fase', { p_room_code: code, p_token: token, p_version: version });
}

export interface SeenPlayer {
  id: string;
  name: string;
  role: string;
}

/** Turno de noche propio. Solo trae datos de quien lo pide. */
export interface MyNight {
  state: 'act' | 'wait' | 'sleep' | 'dead';
  kind: RoleKind;
  step: RoleKind | null;
  round: number;
  done?: boolean;
  // Malos
  my_target?: string | null;
  votes?: { voter: string; target: string }[];
  reactions?: ReactionEntry[];
  /** Roles del bando bueno repartidos, para «creo que es…». */
  good_roles?: string[];
  time_up?: boolean;
  // Niña
  can_spy?: boolean;
  caught?: boolean;
  // Vidente y Niña
  seen?: SeenPlayer | null;
  // Ladrón
  cards?: string[];
  // Bruja y Médico
  victim?: string | null;
  heal?: boolean;
  poison?: boolean;
  last_protected?: string | null;
}

export function getMyNight(code: string, token: string) {
  return call<MyNight>('mi_noche', { p_room_code: code, p_token: token });
}

export type NightActionName = 'kill' | 'spy' | 'swap' | 'link' | 'see' | 'protect' | 'potions';

export function nightAction(
  code: string,
  token: string,
  action: NightActionName,
  args: { target?: string | null; target2?: string | null; card?: string } = {},
) {
  return call<MyNight>('accion_nocturna', {
    p_room_code: code,
    p_token: token,
    p_action: action,
    p_target: args.target ?? null,
    p_target2: args.target2 ?? null,
    p_card: args.card ?? null,
  });
}

/** Reacción propia a un candidato en el turno de los malos; null la quita. */
export function reactBad(code: string, token: string, target: string, reaction: BadReaction | null) {
  return call<MyNight>('reaccion_malos', {
    p_room_code: code,
    p_token: token,
    p_target: target,
    p_reaction: reaction,
  });
}

export function vote(code: string, token: string, target: string) {
  return call<void>('votar', { p_room_code: code, p_token: token, p_target: target });
}

export function shoot(code: string, token: string, target: string) {
  return call<void>('disparar', { p_room_code: code, p_token: token, p_target: target });
}
