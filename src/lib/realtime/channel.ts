// Canal de la sala: eventos Broadcast del servidor y Presence.
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { GameEvent } from '../game';
import { isSendablePhoto } from '../foto/foto';
import { getSupabase } from './client';

export interface RoomChannelHandlers {
  onEvent: (event: GameEvent) => void;
  onPresence: (onlineIds: Set<string>) => void;
  onStatus?: (connected: boolean) => void;
  /** Foto de un jugador, recibida de su móvil. Solo se guarda en memoria. */
  onPhoto?: (playerId: string, photo: string) => void;
}

const SERVER_EVENTS: GameEvent['type'][] = [
  'jugador_unido',
  'partida_iniciada',
  'fase_cambiada',
  'jugador_eliminado',
  'partida_terminada',
];

export interface RoomChannel {
  /** Reenvía un aviso a los demás por si el del servidor no llega. */
  announce: (event: GameEvent) => void;
  leave: () => void;
}

const PHOTO_EVENT = 'foto';

export function joinRoomChannel(
  code: string,
  playerId: string,
  handlers: RoomChannelHandlers,
  ownPhoto: string | null = null,
): RoomChannel {
  const channel: RealtimeChannel = getSupabase().channel(`sala:${code}`, {
    config: { presence: { key: playerId }, broadcast: { self: true } },
  });

  for (const type of SERVER_EVENTS) {
    channel.on('broadcast', { event: type }, ({ payload }) => {
      handlers.onEvent({ ...(payload as object), type } as GameEvent);
    });
  }

  // Las fotos van de móvil a móvil por Broadcast y nunca pasan por la base de datos.
  channel.on('broadcast', { event: PHOTO_EVENT }, ({ payload }) => {
    const { id, data } = (payload ?? {}) as { id?: unknown; data?: unknown };
    if (typeof id === 'string' && typeof data === 'string' && isSendablePhoto(data)) {
      handlers.onPhoto?.(id, data);
    }
  });

  let photoSendable = false;
  if (ownPhoto) {
    photoSendable = isSendablePhoto(ownPhoto);
    if (!photoSendable) {
      console.warn(`La foto ocupa ${ownPhoto.length} caracteres y es demasiado grande para Broadcast; no se envía.`);
    }
  }
  const sendPhoto = () => {
    if (!photoSendable) return;
    void channel.send({ type: 'broadcast', event: PHOTO_EVENT, payload: { id: playerId, data: ownPhoto } });
  };

  // Cuando entra alguien nuevo se le reenvía la foto. El pequeño retraso
  // aleatorio evita que todos los móviles la manden en el mismo instante.
  let resendTimer: ReturnType<typeof setTimeout> | undefined;
  channel.on('presence', { event: 'join' }, ({ key }) => {
    if (key === playerId || !photoSendable) return;
    clearTimeout(resendTimer);
    resendTimer = setTimeout(sendPhoto, 300 + Math.random() * 1200);
  });

  channel.on('presence', { event: 'sync' }, () => {
    handlers.onPresence(new Set(Object.keys(channel.presenceState())));
  });

  channel.subscribe(async (status) => {
    const connected = status === 'SUBSCRIBED';
    handlers.onStatus?.(connected);
    if (!connected) return;
    await channel.track({ online_at: new Date().toISOString() });
    sendPhoto();
  });

  return {
    announce: (event) => {
      const { type, ...payload } = event;
      void channel.send({ type: 'broadcast', event: type, payload });
    },
    leave: () => {
      clearTimeout(resendTimer);
      void getSupabase().removeChannel(channel);
    },
  };
}

/** Descarta eventos repetidos o atrasados según su número de versión. */
export function isNewer(event: { version: number }, currentVersion: number): boolean {
  return event.version > currentVersion;
}
