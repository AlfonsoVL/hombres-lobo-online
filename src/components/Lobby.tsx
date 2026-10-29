// Sala de espera: código, enlace, jugadores conectados y configuración.
import { useState } from 'react';
import { getTheme } from '../lib/tematicas';
import { MAX_PLAYERS } from '../lib/game';
import type { PublicRoom } from '../lib/realtime/rpc';
import Avatar from './Avatar';
import GameSetup from './GameSetup';
import { HelpButton } from './Help';
import SoundToggle from './SoundToggle';
import Logo from './Logo';
import { ErrorText, Ornament } from './ui';

interface Props {
  room: PublicRoom;
  token: string;
  online: Set<string>;
  photos: Map<string, string>;
  connected: boolean;
  onStarted: () => Promise<void>;
  onCancel: () => Promise<void>;
}

export default function Lobby({ room, token, online, photos, connected, onStarted, onCancel }: Props) {
  const theme = getTheme(room.theme);
  const [copied, setCopied] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');
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

  async function cancel() {
    if (!confirm('¿Cancelar la sala? Se cerrará para todos los jugadores.')) return;
    setCancelling(true);
    setCancelError('');
    try {
      await onCancel();
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'No se ha podido cancelar la sala.');
      setCancelling(false);
    }
  }

  const total = room.players.length;
  const connectedCount = room.players.filter((p) => online.has(p.id)).length;
  const slots = Math.min(MAX_PLAYERS, Math.max(6, Math.ceil((total + 1) / 3) * 3));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col items-center gap-2 text-center">
        <Logo theme={theme} small />
        <p className="titulo mt-2 text-xs font-semibold text-amber-400">
          {theme.nombre} · {room.mode === 'classic' ? 'Clásico' : 'Personalizado'}
        </p>
        <Ornament>SALA</Ornament>
        <div className="flex items-center gap-2">
          <h1 className="rounded-xl border border-amber-500/50 bg-stone-950/80 px-6 py-1.5 font-mono text-4xl font-bold tracking-[0.25em] text-amber-200 shadow-[var(--brillo)]">
            {room.code}
          </h1>
          <button
            type="button"
            onClick={() => void share()}
            aria-label="Copiar el enlace"
            className="flex h-12 w-12 items-center justify-center rounded-xl border border-amber-500/30 bg-stone-950/80 text-xl"
          >
            {copied ? '✓' : '⧉'}
          </button>
        </div>
        {!connected && <p className="text-sm text-amber-400">Conectando…</p>}
      </header>

      <div className="grid grid-cols-2 gap-3">
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl bg-[#25D366] px-3 py-2.5 text-center text-sm font-semibold text-stone-950 transition hover:brightness-110"
        >
          WhatsApp
        </a>
        <button
          type="button"
          onClick={() => void share()}
          className="rounded-xl border border-teal-400/40 bg-teal-950/60 px-3 py-2.5 text-sm font-semibold text-teal-100"
        >
          {copied ? 'Enlace copiado' : 'Compartir enlace'}
        </button>
      </div>

      <section>
        <p className="mb-4 flex items-center justify-center gap-2 text-sm font-semibold text-emerald-400">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          {connectedCount}/{total} jugadores conectados
        </p>
        <ul className="grid grid-cols-3 gap-x-3 gap-y-5">
          {room.players.map((p) => (
            <li key={p.id} className="flex flex-col items-center gap-1.5 text-center">
              <span className="relative">
                <Avatar id={p.id} name={p.name} photo={photos.get(p.id)} size={68} ring />
                {p.is_creator && (
                  <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-xl" aria-label="Dirige la partida">
                    👑
                  </span>
                )}
                <span
                  className={`absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 border-stone-950 ${
                    online.has(p.id) ? 'bg-emerald-400' : 'bg-stone-600'
                  }`}
                  aria-label={online.has(p.id) ? 'Conectado' : 'Desconectado'}
                />
              </span>
              <span className="w-full truncate text-sm font-semibold">
                {p.name}
                {p.id === room.me.id && <span className="font-normal text-stone-400"> (tú)</span>}
              </span>
              {p.is_creator && <span className="-mt-1.5 text-xs text-stone-400">(Creador)</span>}
            </li>
          ))}
          {Array.from({ length: slots - total }, (_, i) => (
            <li key={`hueco-${i}`} className="flex flex-col items-center gap-1.5 text-center" aria-hidden>
              <span className="flex h-[68px] w-[68px] items-center justify-center rounded-full border-2 border-dashed border-stone-600 text-2xl text-stone-600">
                +
              </span>
              <span className="text-xs text-stone-500">Esperando…</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <HelpButton themeId={room.theme} />
        <SoundToggle code={room.code} />
      </div>

      {room.me.is_creator ? (
        <GameSetup room={room} token={token} onStarted={onStarted} />
      ) : (
        <p className="text-center text-stone-300">
          Esperando a que {creator?.name ?? 'el creador'} inicie la partida…
        </p>
      )}

      {room.me.is_creator && (
        <div className="flex flex-col gap-2">
          <ErrorText>{cancelError}</ErrorText>
          <button
            type="button"
            onClick={() => void cancel()}
            disabled={cancelling}
            className="self-center rounded-full border border-red-400/40 bg-stone-950/70 px-5 py-2 text-sm text-red-300 disabled:opacity-50"
          >
            {cancelling ? 'Cancelando…' : '✕ Cancelar la sala y volver al inicio'}
          </button>
        </div>
      )}
    </div>
  );
}
