// Pantalla de la sala: unirse, lobby y (más adelante) la partida.
import { useCallback, useEffect, useRef, useState } from 'react';
import { getOwnPhoto, setOwnPhoto } from '../lib/foto/ownPhoto';
import type { GameEvent } from '../lib/game';
import { isNewer, joinRoomChannel, type RoomChannel } from '../lib/realtime/channel';
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
  const [photos, setPhotos] = useState<Map<string, string>>(new Map());
  const versionRef = useRef(0);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const channelRef = useRef<RoomChannel | null>(null);

  const refresh = useCallback(async (t: string) => {
    const r = await getRoom(code, t);
    versionRef.current = r.version;
    knownIdsRef.current = new Set(r.players.map((p) => p.id));
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
        knownIdsRef.current.add(event.id);
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
    const ownPhoto = getOwnPhoto(code);
    if (ownPhoto) setPhotos((m) => new Map(m).set(playerId, ownPhoto));
    const channel = joinRoomChannel(code, playerId, {
      onEvent,
      onPhoto: (id, photo) => setPhotos((m) => (m.get(id) === photo ? m : new Map(m).set(id, photo))),
      onPresence: (ids) => {
        setOnline(ids);
        // Si aparece alguien que no conocemos, se ha unido y no nos llegó el aviso.
        if ([...ids].some((id) => !knownIdsRef.current.has(id))) void refresh(token);
      },
      onStatus: (isConnected) => {
        setConnected(isConnected);
        // Al reconectar se pide el estado por si se perdió algún evento.
        if (isConnected) void refresh(token);
      },
    }, ownPhoto);
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      channel.leave();
    };
  }, [code, playerId, token, refresh]);

  async function onStarted() {
    const r = await refresh(token!);
    channelRef.current?.announce({ type: 'partida_iniciada', version: r.version });
  }

  async function join(name: string, photo: string | null) {
    const t = loadToken(code) ?? newToken();
    await joinRoom(code, name, t);
    saveToken(code, t);
    setOwnPhoto(code, photo);
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
    return <Lobby room={room} token={token} online={online} photos={photos} connected={connected} onStarted={onStarted} />;
  }
  return (
    <Card className="text-center">
      <h1 className="text-2xl font-bold">¡La partida ha empezado!</h1>
      <p className="mt-2 text-stone-400">Las fases de la partida llegarán en el siguiente paso.</p>
    </Card>
  );
}
