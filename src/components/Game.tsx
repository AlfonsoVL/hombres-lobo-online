// Partida en curso: introducción, reparto, noche por turnos, amanecer, día,
// linchamiento y final. El creador la dirige y su móvil narra.
import { useEffect, useRef, useState } from 'react';
import { narration, type NarrationState } from '../lib/game';
import { isNarrating, narrate, onNarrating, stopNarration } from '../lib/audio/narrate';
import { isAudioUnlocked } from '../lib/audio/unlock';
import { findRoleByKind, getRole, getTheme, roleByKind, type RoleCard, type RoleKind, type Theme } from '../lib/tematicas';
import { advancePhase, shoot, vote, type PublicPlayer, type PublicRoom } from '../lib/realtime/rpc';
import AudioUnlock from './AudioUnlock';
import { HelpButton } from './Help';
import Avatar from './Avatar';
import MyRoleCard from './MyRoleCard';
import NightPanel from './NightPanel';
import PlayerPicker from './PlayerPicker';
import RoleAvatar from './RoleAvatar';
import { Button, Card, ErrorText, Ornament, Scene, Title } from './ui';

interface Props {
  room: PublicRoom;
  token: string;
  photos: Map<string, string>;
  online: Set<string>;
  connected: boolean;
  onAdvanced: () => Promise<void>;
}

function stepRole(theme: Theme, room: PublicRoom): RoleCard | undefined {
  return room.night_step ? findRoleByKind(theme, room.night_step) : undefined;
}

/** Ilustración de quien gana: los malos, la aldea o Cupido por los enamorados. */
function winnerRole(theme: Theme, winner: 'bad' | 'good' | 'lovers'): RoleCard {
  if (winner === 'bad') return roleByKind(theme, 'bad');
  return (winner === 'lovers' && findRoleByKind(theme, 'link')) || roleByKind(theme, 'plain_good');
}

function stepName(theme: Theme, room: PublicRoom): string {
  if (!room.night_step) return '';
  if (room.night_step === 'bad') return theme.nombres_grupo.bad;
  return findRoleByKind(theme, room.night_step)?.nombre ?? '';
}

/** Texto del botón del creador para pasar a lo siguiente. */
function nextLabel(theme: Theme, room: PublicRoom): string | null {
  switch (room.phase) {
    case 'intro':
      return 'Repartir los roles';
    case 'role_reveal':
      return 'Todos han visto su rol: empezar la noche';
    case 'night':
      return room.step_done ? 'Siguiente turno' : `Saltar el turno (${stepName(theme, room)} no ha terminado)`;
    case 'dawn':
      return 'Empezar el día';
    case 'day':
      return 'Cerrar la votación';
    case 'lynch':
      return 'Empezar la noche';
    default:
      return null;
  }
}

export default function Game({ room, token, photos, online, connected, onAdvanced }: Props) {
  const theme = getTheme(room.theme);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const creator = room.players.find((p) => p.is_creator);
  const byId = (id: string | null | undefined) => room.players.find((p) => p.id === id);
  const alive = room.players.filter((p) => p.is_alive);
  const me = byId(room.me.id);
  const next = nextLabel(theme, room);
  const mayor = byId(room.mayor_id);
  const shooter = byId(room.pending_shot);
  const deaths = room.last_deaths.map(byId).filter((p): p is PublicPlayer => !!p);

  // Narración en el móvil del creador en cada cambio de fase o de turno.
  const prevRef = useRef<NarrationState | null>(null);
  const lastLinesRef = useRef<ReturnType<typeof narration>>([]);
  const narrationState: NarrationState = {
    phase: room.phase,
    nightStep: room.night_step,
    winner: room.winner,
    deaths: deaths.map((p) => ({ name: p.name, role: p.revealed_role })),
  };
  const narrationKey = `${room.phase}|${room.round}|${room.night_step}|${room.last_deaths.join(',')}`;
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = narrationState;
    if (!room.me.is_creator) return;
    // Al abrir la página no se narra solo, pero el botón permite escucharlo.
    lastLinesRef.current = narration(theme, prev, narrationState);
    if (prev && isAudioUnlocked()) void narrate(lastLinesRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narrationKey]);

  async function advance() {
    if (room.phase === 'night' && !room.step_done && !confirm('Aún no ha terminado este turno. ¿Saltarlo?')) return;
    setBusy(true);
    setError('');
    try {
      await advancePhase(room.code, token, room.version);
      await onAdvanced();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido avanzar.');
    } finally {
      setBusy(false);
    }
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido hacer.');
    } finally {
      setBusy(false);
    }
  }

  const roleOf = (p: PublicPlayer) => (p.revealed_role ? getRole(theme, p.revealed_role) : null);

  const deathList = deaths.length ? (
    <ul className="flex flex-col gap-2">
      {deaths.map((p) => (
        <li
          key={p.id}
          className="aparecer flex items-center gap-3 rounded-xl border border-stone-700/60 bg-stone-950/70 px-3 py-2"
        >
          <Avatar id={p.id} name={p.name} photo={photos.get(p.id)} size={44} ring />
          <span className="flex-1">
            <strong>{p.name}</strong>
            {roleOf(p) && <span className="text-stone-300">, que era {roleOf(p)!.nombre}</span>}
          </span>
          {roleOf(p) && <RoleAvatar role={roleOf(p)!} size={44} />}
        </li>
      ))}
    </ul>
  ) : null;

  const shotPanel = shooter && (
    <Card className="flex flex-col gap-3">
      {shooter.id === room.me.id ? (
        <>
          <h2 className="text-xl font-bold text-amber-300">Antes de morir, dispara</h2>
          <p className="text-stone-300">Toca al jugador al que eliminas.</p>
          <PlayerPicker
            players={alive.filter((p) => p.id !== room.me.id)}
            photos={photos}
            selected={[]}
            disabled={busy}
            onSelect={(id) => {
              const name = byId(id)?.name;
              if (confirm(`¿Disparar a ${name}?`)) void run(() => shoot(room.code, token, id));
            }}
          />
        </>
      ) : (
        <p className="text-center">{shooter.name} tiene que disparar antes de seguir…</p>
      )}
    </Card>
  );

  const myVote = room.votes.find((v) => v.voter === room.me.id)?.target;
  const votesOf = (id: string) => room.votes.filter((v) => v.target === id).length;
  const fondos = theme.fondos ?? {};
  const scene =
    room.phase === 'lynch' || room.phase === 'finished'
      ? fondos.resultado
      : room.phase === 'intro' || room.phase === 'night' || room.phase === 'dawn'
        ? fondos.intro
        : undefined;
  const lynched = room.phase === 'lynch' ? deaths[0] : undefined;

  return (
    <div className="flex flex-col gap-6">
      <Scene src={scene} />
      <header className="flex items-center justify-between gap-2 text-sm">
        <span className="titulo font-semibold text-amber-400">{theme.nombre}</span>
        {mayor && (
          <span className="flex items-center gap-1.5 text-stone-300">
            <RoleAvatar role="alcalde" size={22} />
            <strong className="text-stone-100">{mayor.name}</strong>
          </span>
        )}
      </header>

      {!connected && (
        <p role="status" className="rounded-lg bg-amber-950 px-3 py-2 text-center text-sm text-amber-200">
          Reconectando… Si tarda, recarga la página: volverás al mismo punto de la partida.
        </p>
      )}
      {connected && online.size > 0 && creator && creator.id !== room.me.id && !online.has(creator.id) && room.phase !== 'finished' && (
        <p role="status" className="rounded-lg bg-stone-800 px-3 py-2 text-center text-sm text-stone-300">
          {creator.name} se ha desconectado. La partida sigue en cuanto vuelva a abrir el enlace.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <HelpButton themeId={room.theme} />
        {room.me.is_creator && room.phase !== 'finished' && <AudioUnlock />}
      </div>

      {room.phase === 'intro' && (
        <section className="flex flex-col items-center gap-4 pt-16 text-center">
          <Title className="text-4xl">{theme.titulo_intro}</Title>
          <Ornament />
          <p className="text-lg leading-relaxed text-stone-100 [text-shadow:0_1px_3px_rgb(0_0_0)]">
            {theme.textos.introduccion.texto}
          </p>
          {room.me.is_creator && <NarrationPlayer lines={lastLinesRef} />}
        </section>
      )}

      {room.phase === 'role_reveal' && (
        <>
          <p className="text-center text-stone-200">
            Que nadie vea tu pantalla.
            <br />
            Mantén pulsada la carta para verla.
          </p>
          {mayor && (
            <p className="flex items-center justify-center gap-3 rounded-xl border border-amber-500/30 bg-stone-950/70 px-3 py-2">
              <RoleAvatar role="alcalde" size={40} />
              <span>
                El sorteo ha elegido Alcalde a <strong>{mayor.name}</strong>.
              </span>
            </p>
          )}
          <MyRoleCard theme={theme} token={token} photos={photos} />
        </>
      )}

      {room.phase === 'night' && (
        <>
          <PhaseHeader icon="☽" label={`Noche ${room.round}`} steps={nightSteps(theme, room)} />
          {room.me.is_creator && (
            <Card className="flex flex-col items-center text-center">
              {stepRole(theme, room) && <RoleAvatar role={stepRole(theme, room)!} size={96} className="mb-2" />}
              <p className="text-sm text-stone-400">Turno de</p>
              <p className="titulo text-2xl font-bold text-amber-300">{stepName(theme, room)}</p>
              <p className={`mt-1 text-sm ${room.step_done ? 'text-emerald-400' : 'text-stone-400'}`}>
                {room.step_done
                  ? '✓ Ya ha actuado'
                  : room.night_step === 'bad'
                    ? 'Esperando a que se pongan de acuerdo…'
                    : 'Esperando a que actúe…'}
              </p>
              <NarrationPlayer lines={lastLinesRef} />
            </Card>
          )}
          <NightPanel room={room} theme={theme} token={token} photos={photos} />
        </>
      )}

      {room.phase === 'dawn' && (
        <section className="flex flex-col gap-4 pt-10">
          <Title className="text-4xl">☀ Amanece</Title>
          <Ornament />
          {deathList ?? (
            <p className="text-center text-lg text-stone-100">{theme.textos.amanecer_sin_victima.texto}</p>
          )}
        </section>
      )}

      {room.phase === 'day' && (
        <section className="flex flex-col gap-4">
          <PhaseHeader icon="☀" label={`Día ${room.round}`} />
          <div className="flex items-end justify-between gap-3">
            <div>
              <h1 className="text-3xl font-extrabold text-amber-300">Discusión</h1>
              <p className="text-sm text-stone-300">{theme.textos.dia.texto}</p>
            </div>
            <Stopwatch key={room.round} />
          </div>
          {!me?.is_alive && <p className="text-sm text-stone-400">Los muertos no votan.</p>}
          <ul className="flex flex-col gap-2">
            {alive.map((p) => {
              const n = votesOf(p.id);
              const mine = myVote === p.id;
              const voters = room.votes.filter((v) => v.target === p.id).map((v) => byId(v.voter)?.name);
              return (
                <li
                  key={p.id}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${
                    mine ? 'border-amber-400 bg-amber-950/40' : 'border-stone-700/60 bg-stone-950/70'
                  }`}
                >
                  <Avatar id={p.id} name={p.name} photo={photos.get(p.id)} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{p.name}</span>
                    {voters.length > 0 && (
                      <span className="block truncate text-xs text-stone-400">{voters.join(', ')}</span>
                    )}
                  </span>
                  <span
                    className={`flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-sm font-bold ${
                      n ? 'bg-red-700 text-white' : 'bg-stone-800 text-stone-400'
                    }`}
                  >
                    {n}
                  </span>
                  {me?.is_alive &&
                    (mine ? (
                      <span className="w-20 text-center text-sm text-stone-400">Tu voto</span>
                    ) : (
                      <Button
                        type="button"
                        variant="small"
                        className="w-20"
                        disabled={busy}
                        onClick={() => void run(() => vote(room.code, token, p.id))}
                      >
                        Votar
                      </Button>
                    ))}
                </li>
              );
            })}
          </ul>
          <p className="text-center text-xs text-stone-400">Puedes cambiar tu voto hasta que se cierre la votación.</p>
        </section>
      )}

      {room.phase === 'lynch' && (
        <section className="flex flex-col items-center gap-4 pt-6 text-center">
          <Title className="text-4xl">Resultado</Title>
          <Ornament />
          {lynched ? (
            <>
              <p className="text-lg text-stone-100">{theme.textos.linchamiento.texto}</p>
              <span className="relative">
                <Avatar
                  id={lynched.id}
                  name={lynched.name}
                  photo={photos.get(lynched.id)}
                  size={176}
                  ring
                  className="grayscale"
                />
                <span aria-hidden className="absolute inset-0 flex items-center justify-center text-[150px] leading-none text-red-600/80">
                  ✕
                </span>
              </span>
              <p className="titulo text-4xl font-bold text-stone-50">{lynched.name}</p>
              {roleOf(lynched) && (
                <p className="text-lg">
                  {lynched.name} era <strong className="text-amber-300">{roleOf(lynched)!.nombre}</strong>.
                </p>
              )}
              {deaths.length > 1 && <div className="w-full text-left">{deathList}</div>}
            </>
          ) : (
            <p className="text-lg text-stone-100">Hay empate y nadie es linchado.</p>
          )}
        </section>
      )}

      {room.phase === 'finished' && room.winner && (
        <section className="flex flex-col items-center gap-4 pt-6 text-center">
          <Title className="text-4xl">Fin de la partida</Title>
          <Ornament />
          <RoleAvatar role={winnerRole(theme, room.winner)} size={160} />
          <p className="titulo text-2xl font-bold text-amber-300">{theme.textos.victoria[room.winner].texto}</p>
          {deathList && <div className="w-full text-left">{deathList}</div>}
          <a href="/" className="text-amber-400 underline underline-offset-4">
            Nueva partida
          </a>
        </section>
      )}

      {shotPanel}

      <ErrorText>{error}</ErrorText>
      {next &&
        (room.me.is_creator ? (
          <Button type="button" disabled={busy || !!shooter} onClick={() => void advance()}>
            {busy ? 'Un momento…' : next}
          </Button>
        ) : (
          <p className="text-center text-stone-300">{creator?.name ?? 'El creador'} dirige la partida.</p>
        ))}

      {room.phase !== 'role_reveal' && room.phase !== 'intro' && room.phase !== 'finished' && (
        <details className="rounded-2xl border border-amber-500/20 bg-stone-950/75 p-4">
          <summary className="cursor-pointer font-semibold">Ver mi rol</summary>
          <div className="mt-3">
            <MyRoleCard key={room.round} theme={theme} token={token} photos={photos} />
          </div>
        </details>
      )}

      <Card>
        <h2 className="mb-3 font-semibold text-amber-300">Jugadores</h2>
        <ul className="grid grid-cols-4 gap-3">
          {room.players.map((p) => (
            <li key={p.id} className={`flex flex-col items-center gap-1 ${p.is_alive ? '' : 'opacity-40 grayscale'}`}>
              <span className="relative">
                <Avatar id={p.id} name={p.name} photo={photos.get(p.id)} size={48} />
                {p.id === room.mayor_id && (
                  <RoleAvatar role="alcalde" size={22} className="absolute -right-1.5 -top-1.5" />
                )}
                {roleOf(p) && <RoleAvatar role={roleOf(p)!} size={24} className="absolute -bottom-1 -right-1.5" />}
              </span>
              <span className="w-full truncate text-center text-xs">{p.name}</span>
              {roleOf(p) && (
                <span className="w-full truncate text-center text-[10px] text-stone-400">{roleOf(p)!.nombre}</span>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/** Turnos de la noche de la temática, para la barra de progreso. */
function nightSteps(theme: Theme, room: PublicRoom): { done: boolean; current: boolean }[] {
  const order: RoleKind[] = room.round === 1 ? ['swap', 'link', 'bad', 'investigate', 'protect'] : ['bad', 'investigate', 'protect'];
  const kinds = order.filter((k) => k === 'bad' || findRoleByKind(theme, k));
  const at = room.night_step ? kinds.indexOf(room.night_step) : -1;
  return kinds.map((_, i) => ({ done: i < at, current: i === at }));
}

/** Cabecera de fase: «☽ Noche 1» con los turnos como puntos. */
function PhaseHeader({ icon, label, steps }: { icon: string; label: string; steps?: { done: boolean; current: boolean }[] }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="titulo flex items-center gap-2 text-lg font-semibold text-amber-300">
        <span aria-hidden>{icon}</span>
        {label}
      </p>
      {steps && steps.length > 0 && (
        <div className="flex items-center" aria-hidden>
          {steps.map((s, i) => (
            <span key={i} className="flex items-center">
              {i > 0 && <span className={`h-px w-5 ${s.done || s.current ? 'bg-amber-400' : 'bg-stone-600'}`} />}
              <span
                className={`h-3.5 w-3.5 rounded-full border-2 ${
                  s.current
                    ? 'border-amber-300 bg-amber-400 shadow-[var(--brillo)]'
                    : s.done
                      ? 'border-amber-500 bg-amber-700'
                      : 'border-stone-500 bg-stone-900'
                }`}
              />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Tiempo que lleva el debate del día (solo informativo). */
function Stopwatch() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return (
    <span
      className="rounded-xl border border-amber-500/40 bg-stone-950/80 px-3 py-1.5 font-mono text-2xl font-bold text-stone-100"
      aria-label="Tiempo de debate"
    >
      {mm}:{ss}
    </span>
  );
}

/** Reproductor de la narración en el móvil del creador: parar o repetir. */
function NarrationPlayer({ lines }: { lines: React.RefObject<ReturnType<typeof narration>> }) {
  const [playing, setPlaying] = useState(isNarrating());
  useEffect(() => onNarrating(setPlaying), []);
  return (
    <div className="mt-2 flex w-full items-center gap-3 rounded-full border border-amber-500/40 bg-stone-950/80 py-1.5 pl-1.5 pr-4">
      <button
        type="button"
        aria-label={playing ? 'Parar la narración' : 'Repetir la narración'}
        onClick={() => (playing ? stopNarration() : void narrate(lines.current ?? []))}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-amber-400 text-amber-300"
      >
        {playing ? '❚❚' : '▶'}
      </button>
      <span className="flex h-8 flex-1 items-center gap-[3px]" aria-hidden>
        {Array.from({ length: 28 }, (_, i) => (
          <span
            key={i}
            className={`w-[3px] rounded-full bg-amber-400 ${playing ? 'animate-pulse' : 'opacity-40'}`}
            style={{ height: `${25 + ((i * 37) % 70)}%`, animationDelay: `${(i % 7) * 120}ms` }}
          />
        ))}
      </span>
      <span className="text-xs text-stone-400">{playing ? 'Narrando' : 'Repetir'}</span>
    </div>
  );
}
