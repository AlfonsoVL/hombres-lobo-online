// Lo que ve cada jugador de noche: su turno, «Espera tu turno» o «Duerme».
import { useEffect, useState } from 'react';
import {
  BAD_REACTIONS,
  GUESS_EMOJI,
  formatSeconds,
  guessReaction,
  guessedRole,
  reactionText,
  reactionsFor,
  type BadReaction,
  type ReactionEntry,
} from '../lib/game';
import { getRole, type Theme } from '../lib/tematicas';
import {
  getMyNight,
  getMyRole,
  nightAction,
  reactBad,
  type MyNight,
  type MyRole,
  type NightActionName,
  type PublicPlayer,
  type PublicRoom,
} from '../lib/realtime/rpc';
import Avatar from './Avatar';
import PlayerPicker from './PlayerPicker';
import RoleAvatar from './RoleAvatar';
import { Button, Card, ErrorText } from './ui';
import { useSecondsLeft } from './useSecondsLeft';

interface Props {
  room: PublicRoom;
  theme: Theme;
  token: string;
  photos: Map<string, string>;
}

export default function NightPanel({ room, theme, token, photos }: Props) {
  const [night, setNight] = useState<MyNight | null>(null);
  const [role, setRole] = useState<MyRole | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [heal, setHeal] = useState(false);
  const left = useSecondsLeft(room);
  const timeUp = left === 0;

  // Se vuelve a pedir en cada cambio de la sala (turno nuevo, votos de otros malos...)
  // y al acabarse el tiempo de los malos.
  useEffect(() => {
    getMyNight(room.code, token).then(setNight).catch(() => undefined);
  }, [room.code, room.version, room.night_step, room.step_done, room.votes, timeUp, token]);

  // El rol puede cambiar con el Ladrón, así que se pide en cada turno.
  useEffect(() => {
    getMyRole(token).then(setRole).catch(() => undefined);
  }, [token, room.night_step]);

  useEffect(() => {
    setPicked([]);
    setHeal(false);
    setError('');
  }, [room.night_step, room.round]);

  async function act(action: NightActionName, args: Parameters<typeof nightAction>[3] = {}) {
    setBusy(true);
    setError('');
    try {
      setNight(await nightAction(room.code, token, action, args));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido hacer la acción.');
    } finally {
      setBusy(false);
    }
  }

  // Tocar la reacción que ya tienes la quita.
  async function react(target: string, reaction: BadReaction, mine: boolean) {
    setBusy(true);
    setError('');
    try {
      setNight(await reactBad(room.code, token, target, mine ? null : reaction));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido reaccionar.');
    } finally {
      setBusy(false);
    }
  }

  if (!night) return null;
  const me = room.me.id;
  const alive = room.players.filter((p) => p.is_alive);
  const nameOf = (id: string | null | undefined) => room.players.find((p) => p.id === id)?.name ?? '';
  const pick = (id: string) => setPicked([id]);

  if (night.state === 'dead') {
    return <Quiet title="Estás muerto" text="Mantén los ojos cerrados y no hables." />;
  }
  if (night.state === 'sleep') {
    return <Quiet title="Duerme" text="Mantén los ojos cerrados. No es tu turno." />;
  }
  if (night.state === 'wait') {
    return <Quiet title="Espera tu turno" text="Tu rol actúa más tarde esta noche. Mantén los ojos cerrados." />;
  }

  const done = (text: string) => (
    <Card className="flex flex-col gap-2 text-center">
      <p className="text-lg font-semibold">✓ {text}</p>
      <p className="text-stone-400">Cierra los ojos.</p>
    </Card>
  );

  let body: React.ReactNode = null;
  switch (night.kind) {
    case 'bad': {
      // Pantalla discreta: fondo negro, sin animaciones y botones grandes.
      const mates = new Set(role?.bad_teammates?.map((p) => p.id));
      const targets = alive.filter((p) => p.id !== me && !mates.has(p.id));
      const over = timeUp || !!night.time_up;
      const agreed =
        !!night.my_target &&
        (night.votes ?? []).length === mates.size &&
        (night.votes ?? []).every((v) => v.target === night.my_target);
      body = (
        <>
          {left !== null && (
            <p
              className={`text-center font-mono text-4xl tabular-nums ${left <= 10 ? 'text-red-400' : 'text-stone-300'}`}
              aria-label={`Quedan ${left} segundos`}
            >
              {formatSeconds(left)}
            </p>
          )}
          <p className="text-stone-400">
            {over
              ? 'Se ha acabado el tiempo: gana la más votada (si hay empate, al azar). Cerrad los ojos.'
              : mates.size
                ? 'Toca a tu víctima y usa las reacciones para opinar sin hablar. El turno termina cuando coincidís todos o se acaba el tiempo.'
                : 'Toca a tu víctima antes de que se acabe el tiempo.'}
          </p>
          {mates.size > 0 && (
            <p className="text-sm text-stone-400">
              {[...BAD_REACTIONS.map((r) => `${r.emoji} ${r.label.toLowerCase()}`), `${GUESS_EMOJI} creo que es…`].join(
                ' · ',
              )}
            </p>
          )}
          {mates.size > 0 && night.my_target && !over && (
            <p className={agreed ? 'font-semibold text-emerald-400' : 'text-amber-300'}>
              {agreed ? '✓ Estáis de acuerdo. Cerrad los ojos.' : 'Todavía no coincidís todos.'}
            </p>
          )}
          <ul className="flex flex-col gap-3">
            {targets.map((p) => (
              <BadCandidate
                key={p.id}
                player={p}
                photo={photos.get(p.id)}
                theme={theme}
                selected={night.my_target === p.id}
                voters={(night.votes ?? []).filter((v) => v.target === p.id).map((v) => v.voter)}
                reactions={mates.size ? (night.reactions ?? []) : null}
                goodRoles={night.good_roles ?? []}
                disabled={busy || over}
                onVote={() => void act('kill', { target: p.id })}
                onReact={(reaction, mine) => void react(p.id, reaction, mine)}
              />
            ))}
          </ul>
        </>
      );
      break;
    }
    case 'spy':
      if (night.done) {
        body = night.caught ? (
          <p className="text-lg text-red-300">¡Te han descubierto! Morirás al amanecer.</p>
        ) : (
          night.seen && (
            <p className="text-lg">
              Has visto a <strong>{night.seen.name}</strong>: es{' '}
              <strong>{getRole(theme, night.seen.role).nombre}</strong>.
            </p>
          )
        );
      } else if (night.can_spy) {
        body = (
          <>
            <p className="text-stone-400">
              Puedes espiar a los {theme.nombres_grupo.bad.toLowerCase()}. Hay un 50 % de que te descubran y mueras.
            </p>
            <Button type="button" disabled={busy} onClick={() => void act('spy')}>
              Espiar
            </Button>
          </>
        );
      } else {
        body = <p className="text-stone-400">Esta noche no puedes espiar: lo hiciste la noche anterior.</p>;
      }
      break;
    case 'swap':
      if (night.done) return done(`Ahora eres ${role ? getRole(theme, role.role).nombre : 'otro rol'}.`);
      body = (
        <>
          <p className="text-stone-400">Elige la carta que te quedas. Tu nuevo rol será ese.</p>
          <div className="grid grid-cols-2 gap-3">
            {(night.cards ?? []).map((card, i) => {
              const c = getRole(theme, card);
              return (
                <button
                  key={`${card}-${i}`}
                  type="button"
                  disabled={busy}
                  onClick={() => void act('swap', { card })}
                  className={`flex flex-col items-center gap-2 rounded-xl border-2 bg-stone-800/80 p-4 text-center font-semibold ${
                    c.bando === 'bad' ? 'border-red-800 text-red-400' : 'border-stone-600 text-amber-300'
                  }`}
                >
                  <RoleAvatar role={c} size={72} />
                  {c.nombre}
                </button>
              );
            })}
          </div>
          {night.cards?.every((c) => getRole(theme, c).bando === 'bad') && (
            <p className="text-sm text-red-300">Las dos cartas son de malo: tienes que convertirte en malo.</p>
          )}
        </>
      );
      break;
    case 'link':
      if (night.done) return done('Ya has elegido a la pareja.');
      body = (
        <>
          <p className="text-stone-400">Elige a dos jugadores. Si uno muere, el otro morirá con él.</p>
          <PlayerPicker
            players={alive}
            photos={photos}
            selected={picked}
            disabled={busy}
            onSelect={(id) =>
              setPicked((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-2)))
            }
          />
          <Button
            type="button"
            disabled={busy || picked.length !== 2}
            onClick={() => void act('link', { target: picked[0], target2: picked[1] })}
          >
            Unir a {picked.map(nameOf).join(' y ') || 'la pareja'}
          </Button>
        </>
      );
      break;
    case 'investigate':
      if (night.done && night.seen) {
        body = (
          <p className="text-lg">
            <strong>{night.seen.name}</strong> es <strong>{getRole(theme, night.seen.role).nombre}</strong>.
          </p>
        );
      } else {
        body = (
          <>
            <p className="text-stone-400">Elige a un jugador para ver su rol.</p>
            <PlayerPicker
              players={alive.filter((p) => p.id !== me)}
              photos={photos}
              selected={picked}
              disabled={busy}
              onSelect={pick}
            />
            <Button
              type="button"
              disabled={busy || !picked[0]}
              onClick={() => void act('see', { target: picked[0] })}
            >
              Ver el rol de {nameOf(picked[0]) || '…'}
            </Button>
          </>
        );
      }
      break;
    case 'protect':
      if (night.done) return done('Hecho.');
      if (theme.id === 'castronegro') {
        const victim = night.victim;
        const canHeal = night.heal && victim && victim !== me;
        body = (
          <>
            <p>
              {victim
                ? <>Esta noche la víctima es <strong>{nameOf(victim)}</strong>.</>
                : 'Esta noche no hay víctima.'}
            </p>
            {canHeal && (
              <label className="flex items-center gap-3 rounded-lg bg-stone-800 px-3 py-2">
                <input type="checkbox" checked={heal} onChange={(e) => setHeal(e.target.checked)} />
                Usar la poción de cura con {nameOf(victim)}
              </label>
            )}
            {night.poison ? (
              <>
                <p className="text-sm text-stone-400">Poción de veneno (opcional): toca a un jugador para envenenarlo.</p>
                <PlayerPicker
                  players={alive.filter((p) => p.id !== me)}
                  photos={photos}
                  selected={picked}
                  disabled={busy}
                  onSelect={(id) => setPicked((s) => (s[0] === id ? [] : [id]))}
                />
              </>
            ) : (
              <p className="text-sm text-stone-400">Ya usaste la poción de veneno.</p>
            )}
            <Button
              type="button"
              disabled={busy}
              onClick={() =>
                void act('potions', { target: picked[0] ?? null, target2: heal ? victim : null })
              }
            >
              {heal || picked[0] ? 'Usar las pociones' : 'No usar ninguna poción'}
            </Button>
          </>
        );
      } else {
        body = (
          <>
            <p className="text-stone-400">
              Elige a quién proteges. No puedes protegerte a ti mismo ni repetir con quien protegiste anoche.
            </p>
            <PlayerPicker
              players={alive.filter((p) => p.id !== me && p.id !== night.last_protected)}
              photos={photos}
              selected={picked}
              disabled={busy}
              onSelect={pick}
            />
            <Button
              type="button"
              disabled={busy || !picked[0]}
              onClick={() => void act('protect', { target: picked[0] })}
            >
              Proteger a {nameOf(picked[0]) || '…'}
            </Button>
          </>
        );
      }
      break;
  }

  if (night.kind === 'bad') {
    return (
      <Card className="flex flex-col gap-4 border-stone-800 bg-black">
        <h2 className="text-center text-xl font-bold text-stone-300">
          Es tu turno{role ? `, ${getRole(theme, role.role).nombre}` : ''}
        </h2>
        {body}
        <ErrorText>{error}</ErrorText>
      </Card>
    );
  }

  return (
    <Card className="mt-14 flex flex-col gap-4">
      <div className="-mt-[76px] flex flex-col items-center gap-2 text-center">
        {role && <RoleAvatar role={getRole(theme, role.role)} size={128} />}
        <h2 className="text-2xl font-bold text-amber-300">
          Es tu turno{role ? `, ${getRole(theme, role.role).nombre}` : ''}
        </h2>
      </div>
      {body}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

/** Candidato de los malos: tocarlo es votarlo; debajo, las reacciones. */
function BadCandidate({
  player,
  photo,
  theme,
  selected,
  voters,
  reactions,
  goodRoles,
  disabled,
  onVote,
  onReact,
}: {
  player: PublicPlayer;
  photo: string | undefined;
  theme: Theme;
  selected: boolean;
  voters: string[];
  /** null si no hay compañeros con quien hablar. */
  reactions: ReactionEntry[] | null;
  /** Roles del bando bueno repartidos, para «creo que es…». */
  goodRoles: string[];
  disabled: boolean;
  onVote: () => void;
  onReact: (reaction: BadReaction, mine: boolean) => void;
}) {
  const [guessing, setGuessing] = useState(false);
  const groups = reactions ? reactionsFor(reactions, player.id) : [];
  const isMine = (reaction: BadReaction) => groups.some((g) => g.reaction === reaction && g.mine);
  const myGuess = groups.some((g) => g.mine && guessedRole(g.reaction));
  const who = groups
    .map((g) => `${reactionText(theme, g.reaction)}: ${(g.mine ? ['tú', ...g.voters] : g.voters).join(', ')}`)
    .join(' · ');
  // Los roles en el orden de la temática.
  const roles = theme.roles.filter((r) => goodRoles.includes(r.id));
  const chip = (active: boolean) =>
    `flex items-center justify-center rounded-lg border disabled:opacity-60 ${
      active ? 'border-stone-300 bg-stone-700' : 'border-stone-800 bg-stone-950'
    }`;
  return (
    <li className={`rounded-xl border-2 p-2 ${selected ? 'border-stone-300 bg-stone-900' : 'border-stone-800'}`}>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={selected}
        onClick={onVote}
        className="flex min-h-16 w-full items-center gap-3 px-1 text-left disabled:opacity-60"
      >
        <Avatar id={player.id} name={player.name} photo={photo} size={48} />
        <span className="flex-1">
          <span className={`block truncate text-lg font-semibold ${selected ? 'text-stone-100' : 'text-stone-300'}`}>
            {player.name}
          </span>
          {voters.length > 0 && <span className="block truncate text-sm text-stone-400">Votan: {voters.join(', ')}</span>}
        </span>
        {selected && <span className="text-sm font-semibold text-stone-200">Tu voto</span>}
      </button>
      {reactions && (
        <>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {BAD_REACTIONS.map((o) => {
              const mine = isMine(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  disabled={disabled}
                  aria-pressed={mine}
                  aria-label={o.label}
                  title={o.label}
                  onClick={() => onReact(o.id, mine)}
                  className={`h-12 text-2xl ${chip(mine)}`}
                >
                  {o.emoji}
                </button>
              );
            })}
            {roles.length > 0 && (
              <button
                type="button"
                disabled={disabled}
                aria-expanded={guessing}
                aria-label="Creo que es…"
                title="Creo que es…"
                onClick={() => setGuessing((g) => !g)}
                className={`h-12 text-2xl ${chip(guessing || myGuess)}`}
              >
                {GUESS_EMOJI}
              </button>
            )}
          </div>
          {guessing && (
            <div className="mt-2 flex flex-col gap-2">
              <p className="px-1 text-sm text-stone-400">Creo que es…</p>
              <div className="grid grid-cols-2 gap-2">
                {roles.map((r) => {
                  const reaction = guessReaction(r.id);
                  const mine = isMine(reaction);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      disabled={disabled}
                      aria-pressed={mine}
                      onClick={() => {
                        onReact(reaction, mine);
                        setGuessing(false);
                      }}
                      className={`min-h-12 px-2 text-base font-semibold text-stone-200 ${chip(mine)}`}
                    >
                      {r.nombre}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {who && <p className="mt-2 px-1 text-sm text-stone-300">{who}</p>}
        </>
      )}
    </li>
  );
}

function Quiet({ title, text }: { title: string; text: string }) {
  return (
    <Card className="flex flex-col items-center bg-stone-950/60 py-8 text-center">
      <span className="mb-3 text-5xl" aria-hidden>
        🌙
      </span>
      <p className="titulo text-2xl font-bold">{title}</p>
      <p className="mt-2 text-stone-400">{text}</p>
    </Card>
  );
}
