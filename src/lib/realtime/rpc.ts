// Llamadas a las funciones SQL. Los errores de Postgres ya vienen en español.
import type { ThemeId } from '../tematicas';
import { getSupabase } from './client';

export type Mode = 'classic' | 'custom';
export type Phase = 'lobby' | 'intro' | 'role_reveal' | 'night' | 'dawn' | 'day' | 'finished';

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
  night_step: string | null;
  round: number;
  version: number;
  winner: string | null;
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

export function startGame(code: string, token: string, specialRoles: string[], badCount: number) {
  return call<void>('iniciar_partida', {
    p_room_code: code,
    p_token: token,
    p_special_roles: specialRoles,
    p_bad_count: badCount,
  });
}
