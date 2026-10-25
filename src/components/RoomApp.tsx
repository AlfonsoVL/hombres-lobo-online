// Pantalla de la sala: unirse, lobby y (más adelante) la partida.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameEvent } from '../lib/game';
import { isNewer, joinRoomChannel } from '../lib/realtime/channel';
import { getRoom, joinRoom, type PublicRoom } from '../lib/realtime/rpc';
import { loadToken, newToken, saveToken } from '../lib/realtime/token';
import JoinForm from './JoinForm';
import Lobby from './Lobby';
import { Card } from './ui';

type Status = 'loading' | 'join' | 'ready';

export default function RoomApp({ code }: { code: string }) {
  const [status, setStatus] = useState<Status>('loading');
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [connected, setConnected] = useState(false);
  const versionRef = useRef(0);

  const refresh = useCallback(async (t: string) => {
    const r = await getRoom(code, t);
    versionRef.current = r.version;
    setRoom(r);
    return r;
  }, [code]);

  // Al entrar: si ya hay token para esta sala, se recupera la sesión.
  useEffect(() => {
    const saved = loadToken(code);
    if (!saved) {
      setStatus('join');
      return;
    }
    refresh(saved)
      .then(() => {
        setToken(saved);
        setStatus('ready');
      })
      .catch(() => setStatus('join'));
  }, [code, refresh]);

  // Canal en tiempo real, una vez dentro de la sala.
  const playerId = room?.me.id;
  useEffect(() => {
    if (!playerId || !token) return;
    const onEvent = (event: GameEvent) => {
      if (!isNewer(event, versionRef.current)) return;
      if (event.type === 'jugador_unido') {
        versionRef.current = event.version;
        setRoom((r) =>
          r && !r.players.some((p) => p.id === event.id)
            ? {
                ...r,
                version: event.version,
                players: [
                  ...r.players,
                  { id: event.id, name: event.name, is_creator: false, is_alive: true, revealed_role: null },
                ],
              }
            : r,
        );
        return;
      }
      // El resto de eventos solo avisan: el estado se pide al servidor.
      void refresh(token);
    };
    return joinRoomChannel(code, playerId, {
      onEvent,
      onPresence: setOnline,
      onStatus: (isConnected) => {
        setConnected(isConnected);
        // Al reconectar se pide el estado por si se perdió algún evento.
        if (isConnected) void refresh(token);
      },
    });
  }, [code, playerId, token, refresh]);

  async function join(name: string) {
    const t = loadToken(code) ?? newToken();
    await joinRoom(code, name, t);
    saveToken(code, t);
    await refresh(t);
    setToken(t);
    setStatus('ready');
  }

  if (status === 'loading') {
    return <p className="text-center text-stone-400">Cargando sala…</p>;
  }
  if (status === 'join' || !room || !token) {
    return <JoinForm code={code} onJoin={join} />;
  }
  if (room.phase === 'lobby') {
    return <Lobby room={room} token={token} online={online} connected={connected} />;
  }
  return (
    <Card className="text-center">
      <h1 className="text-2xl font-bold">¡La partida ha empezado!</h1>
      <p className="mt-2 text-stone-400">Las fases de la partida llegarán en el siguiente paso.</p>
    </Card>
  );
}
