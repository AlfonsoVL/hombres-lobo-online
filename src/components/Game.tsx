// Partida en curso: introducción, reparto, noche por turnos, amanecer, día,
// linchamiento y final. El creador la dirige y su móvil narra.
import { useEffect, useRef, useState } from 'react';
import { narration, type NarrationState } from '../lib/game';
import { narrate } from '../lib/audio/narrate';
import { isAudioUnlocked } from '../lib/audio/unlock';
import { findRoleByKind, getRole, getTheme, type Theme } from '../lib/tematicas';
import { advancePhase, shoot, vote, type PublicPlayer, type PublicRoom } from '../lib/realtime/rpc';
import AudioUnlock from './AudioUnlock';
import { HelpButton } from './Help';
import Avatar from './Avatar';
import MyRoleCard from './MyRoleCard';
import NightPanel from './NightPanel';
import PlayerPicker from './PlayerPicker';
import { Button, Card, ErrorText } from './ui';

interface Props {
  room: PublicRoom;
  token: string;
  photos: Map<string, string>;
  online: Set<string>;
  connected: boolean;
  onAdvanced: () => Promise<void>;
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
    if (!room.me.is_creator || !isAudioUnlocked() || !prev) return;
    void narrate(narration(theme, prev, narrationState));
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

  const deathList = deaths.length ? (
    <ul className="flex flex-col gap-2">
      {deaths.map((p) => (
        <li key={p.id} className="flex items-center gap-3 rounded-lg bg-stone-800 px-3 py-2">
          <Avatar id={p.id} name={p.name} photo={photos.get(p.id)} />
          <span className="flex-1">
            <strong>{p.name}</strong>
            {p.revealed_role && <span className="text-stone-400">, que era {getRole(theme, p.revealed_role).nombre}</span>}
          </span>
        </li>
      ))}
    </ul>
  ) : null;

  const shotPanel = shooter && (
    <Card className="flex flex-col gap-3">
      {shooter.id === room.me.id ? (
        <>
          <h2 className="text-xl font-bold">Antes de morir, dispara</h2>
          <p className="text-stone-400">Toca al jugador al que eliminas.</p>
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
  const votesFor = (id: string) => {
    const n = room.votes.filter((v) => v.target === id).length;
    return n ? `${n} ${n === 1 ? 'voto' : 'votos'}` : undefined;
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="text-center">
        <p className="text-sm font-semibold" style={{ color: theme.color }}>
          {theme.nombre}
          {room.round > 0 && ` · Ronda ${room.round}`}
        </p>
        {mayor && (
          <p className="mt-1 text-sm text-stone-400">
            🎖️ Alcalde: <strong className="text-stone-200">{mayor.name}</strong>
          </p>
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
      <HelpButton themeId={room.theme} />
      {room.me.is_creator && room.phase !== 'finished' && <AudioUnlock />}

      {room.phase === 'intro' && (
        <Card>
          <h1 className="mb-3 text-2xl font-bold">Introducción</h1>
          <p className="text-lg text-stone-300">{theme.textos.introduccion.texto}</p>
        </Card>
      )}

      {room.phase === 'role_reveal' && (
        <>
          <Card>
            <h1 className="mb-2 text-2xl font-bold">Mira tu rol</h1>
            <p className="text-stone-400">Que nadie vea tu pantalla. Mantén pulsada la carta para verla.</p>
            {mayor && <p className="mt-3">🎖️ El sorteo ha elegido Alcalde a <strong>{mayor.name}</strong>.</p>}
          </Card>
          <MyRoleCard theme={theme} token={token} />
        </>
      )}

      {room.phase === 'night' && (
        <>
          {room.me.is_creator && (
            <Card className="text-center">
              <p className="text-sm text-stone-400">Turno de</p>
              <p className="text-2xl font-bold">🌙 {stepName(theme, room)}</p>
              <p className={`mt-1 text-sm ${room.step_done ? 'text-emerald-400' : 'text-stone-400'}`}>
                {room.step_done
                  ? '✓ Ya ha actuado'
                  : room.night_step === 'bad'
                    ? 'Esperando a que se pongan de acuerdo…'
                    : 'Esperando a que actúe…'}
              </p>
            </Card>
          )}
          <NightPanel room={room} theme={theme} token={token} photos={photos} />
        </>
      )}

      {room.phase === 'dawn' && (
        <Card className="flex flex-col gap-3">
          <h1 className="text-2xl font-bold">☀️ Amanece</h1>
          {deathList ?? <p className="text-stone-300">{theme.textos.amanecer_sin_victima.texto}</p>}
        </Card>
      )}

      {room.phase === 'day' && (
        <Card className="flex flex-col gap-4">
          <h1 className="text-2xl font-bold">Votación</h1>
          <p className="text-stone-400">{theme.textos.dia.texto} Puedes cambiar tu voto hasta que se cierre.</p>
          {me?.is_alive ? (
            <PlayerPicker
              players={alive}
              photos={photos}
              selected={myVote ? [myVote] : []}
              disabled={busy}
              note={votesFor}
              onSelect={(id) => void run(() => vote(room.code, token, id))}
            />
          ) : (
            <>
              <p className="text-stone-400">Los muertos no votan.</p>
              <ul className="flex flex-col gap-1">
                {alive.map((p) => {
                  const voters = room.votes.filter((v) => v.target === p.id).map((v) => byId(v.voter)?.name);
                  return voters.length ? (
                    <li key={p.id}>
                      <strong>{p.name}</strong>: {voters.length} ({voters.join(', ')})
                    </li>
                  ) : null;
                })}
              </ul>
            </>
          )}
        </Card>
      )}

      {room.phase === 'lynch' && (
        <Card className="flex flex-col gap-3">
          <h1 className="text-2xl font-bold">Resultado de la votación</h1>
          {deathList ?? <p className="text-stone-300">Hay empate y nadie es linchado.</p>}
        </Card>
      )}

      {room.phase === 'finished' && room.winner && (
        <Card className="flex flex-col gap-4 text-center">
          <h1 className="text-2xl font-bold">{theme.textos.victoria[room.winner].texto}</h1>
          {deathList}
          <a href="/" className="text-stone-400 underline">
            Nueva partida
          </a>
        </Card>
      )}

      {shotPanel}

      <ErrorText>{error}</ErrorText>
      {next &&
        (room.me.is_creator ? (
          <Button type="button" disabled={busy || !!shooter} onClick={() => void advance()}>
            {busy ? 'Un momento…' : next}
          </Button>
        ) : (
          <p className="text-center text-stone-400">{creator?.name ?? 'El creador'} dirige la partida.</p>
        ))}

      {room.phase !== 'role_reveal' && room.phase !== 'intro' && room.phase !== 'finished' && (
        <details className="rounded-2xl bg-stone-900 p-4">
          <summary className="cursor-pointer font-semibold">Ver mi rol</summary>
          <div className="mt-3">
            <MyRoleCard key={room.round} theme={theme} token={token} />
          </div>
        </details>
      )}

      <Card>
        <h2 className="mb-3 font-semibold">Jugadores</h2>
        <ul className="grid grid-cols-4 gap-3">
          {room.players.map((p) => (
            <li key={p.id} className={`flex flex-col items-center gap-1 ${p.is_alive ? '' : 'opacity-40'}`}>
              <span className="relative">
                <Avatar id={p.id} name={p.name} photo={photos.get(p.id)} size={48} />
                {p.id === room.mayor_id && <span className="absolute -right-1 -top-1 text-sm">🎖️</span>}
              </span>
              <span className="w-full truncate text-center text-xs">{p.name}</span>
              {p.revealed_role && (
                <span className="w-full truncate text-center text-[10px] text-stone-400">
                  {getRole(theme, p.revealed_role).nombre}
                </span>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
