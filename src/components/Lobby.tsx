// Sala de espera: código, enlace, jugadores conectados y configuración.
import { useState } from 'react';
import { getTheme } from '../lib/tematicas';
import { MAX_PLAYERS } from '../lib/game';
import type { PublicRoom } from '../lib/realtime/rpc';
import Avatar from './Avatar';
import GameSetup from './GameSetup';
import { Button, Card } from './ui';

interface Props {
  room: PublicRoom;
  token: string;
  online: Set<string>;
  photos: Map<string, string>;
  connected: boolean;
  onStarted: () => Promise<void>;
}

export default function Lobby({ room, token, online, photos, connected, onStarted }: Props) {
  const theme = getTheme(room.theme);
  const [copied, setCopied] = useState(false);
  const creator = room.players.find((p) => p.is_creator);

  const url = `${window.location.origin}/sala/${room.code}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(
    `¡Únete a mi partida de ${theme.nombre}! Código ${room.code}: ${url}`,
  )}`;

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: theme.nombre, text: '¡Únete a la partida!', url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // El usuario canceló o el navegador no deja copiar.
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="text-center">
        <p className="text-sm font-semibold" style={{ color: theme.color }}>
          {theme.nombre} · {room.mode === 'classic' ? 'Clásico' : 'Personalizado'}
        </p>
        <h1 className="mt-1 font-mono text-4xl font-bold tracking-[0.3em]">{room.code}</h1>
        {!connected && <p className="mt-2 text-sm text-amber-400">Conectando…</p>}
      </header>

      <div className="flex flex-col gap-3">
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full rounded-xl bg-[#25D366] px-4 py-3 text-center font-semibold text-stone-950 transition hover:brightness-110"
        >
          Compartir por WhatsApp
        </a>
        <Button type="button" variant="secondary" onClick={() => void share()}>
          {copied ? 'Enlace copiado' : 'Compartir enlace'}
        </Button>
      </div>

      <Card>
        <h2 className="mb-3 flex justify-between text-lg font-semibold">
          <span>Jugadores</span>
          <span className="text-stone-400">
            {room.players.length}/{MAX_PLAYERS}
          </span>
        </h2>
        <ul className="flex flex-col gap-2">
          {room.players.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-lg bg-stone-800 px-3 py-2">
              <span className="relative">
                <Avatar id={p.id} name={p.name} photo={photos.get(p.id)} />
                <span
                  className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-stone-800 ${
                    online.has(p.id) ? 'bg-emerald-400' : 'bg-stone-600'
                  }`}
                  aria-label={online.has(p.id) ? 'Conectado' : 'Desconectado'}
                />
              </span>
              <span className="flex-1 truncate">
                {p.name}
                {p.id === room.me.id && <span className="text-stone-400"> (tú)</span>}
              </span>
              {p.is_creator && <span className="text-xs text-amber-400">Dirige la partida</span>}
            </li>
          ))}
        </ul>
      </Card>

      {room.me.is_creator ? (
        <GameSetup room={room} token={token} onStarted={onStarted} />
      ) : (
        <p className="text-center text-stone-400">
          Esperando a que {creator?.name ?? 'el creador'} inicie la partida…
        </p>
      )}
    </div>
  );
}
