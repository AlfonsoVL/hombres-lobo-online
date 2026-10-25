// Canal de la sala: eventos Broadcast del servidor y Presence.
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { GameEvent } from '../game';
import { getSupabase } from './client';

export interface RoomChannelHandlers {
  onEvent: (event: GameEvent) => void;
  onPresence: (onlineIds: Set<string>) => void;
  onStatus?: (connected: boolean) => void;
}

const SERVER_EVENTS: GameEvent['type'][] = [
  'jugador_unido',
  'partida_iniciada',
  'fase_cambiada',
  'jugador_eliminado',
  'partida_terminada',
];

export function joinRoomChannel(code: string, playerId: string, handlers: RoomChannelHandlers): () => void {
  const channel: RealtimeChannel = getSupabase().channel(`sala:${code}`, {
    config: { presence: { key: playerId }, broadcast: { self: true } },
  });

  for (const type of SERVER_EVENTS) {
    channel.on('broadcast', { event: type }, ({ payload }) => {
      handlers.onEvent({ ...(payload as object), type } as GameEvent);
    });
  }

  channel.on('presence', { event: 'sync' }, () => {
    handlers.onPresence(new Set(Object.keys(channel.presenceState())));
  });

  channel.subscribe(async (status) => {
    const connected = status === 'SUBSCRIBED';
    handlers.onStatus?.(connected);
    if (connected) await channel.track({ online_at: new Date().toISOString() });
  });

  return () => {
    void getSupabase().removeChannel(channel);
  };
}

/** Descarta eventos repetidos o atrasados según su número de versión. */
export function isNewer(event: { version: number }, currentVersion: number): boolean {
  return event.version > currentVersion;
}
