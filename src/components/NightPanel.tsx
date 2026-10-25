// Lo que ve cada jugador de noche: su turno, «Espera tu turno» o «Duerme».
import { useEffect, useState } from 'react';
import { getRole, type Theme } from '../lib/tematicas';
import {
  getMyNight,
  getMyRole,
  nightAction,
  type MyNight,
  type MyRole,
  type NightActionName,
  type PublicRoom,
} from '../lib/realtime/rpc';
import PlayerPicker from './PlayerPicker';
import { Button, Card, ErrorText } from './ui';

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

  // Se vuelve a pedir en cada cambio de la sala (turno nuevo, votos de otros malos...).
  useEffect(() => {
    getMyNight(room.code, token).then(setNight).catch(() => undefined);
  }, [room.code, room.version, room.night_step, room.step_done, room.votes, token]);

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

  if (!night) return null;
  const me = room.me.id;
  const alive = room.players.filter((p) => p.is_alive);
  const nameOf = (id: string | null | undefined) => room.players.find((p) => p.id === id)?.name ?? '';
  const pick = (id: string) => setPicked([id]);

  if (night.state === 'dead') {
    return <Quiet title="Estás muerto" text="Mantén los ojos cerrados y no hables." />;
  }
  if (night.state === 'sleep') {
    return <Quiet title="😴 Duerme" text="Mantén los ojos cerrados. No es tu turno." />;
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
      const mates = new Set(role?.bad_teammates?.map((p) => p.id));
      const targets = alive.filter((p) => p.id !== me && !mates.has(p.id));
      const agreed =
        !!night.my_target &&
        (night.votes ?? []).length === mates.size &&
        (night.votes ?? []).every((v) => v.target === night.my_target);
      const votesFor = (id: string) => {
        const voters = (night.votes ?? []).filter((v) => v.target === id).map((v) => v.voter);
        return voters.length ? voters.join(', ') : undefined;
      };
      body = (
        <>
          <p className="text-stone-400">
            {mates.size
              ? 'Proponed una víctima: veis los votos de los demás y podéis cambiar el vuestro. El turno termina cuando todos elegís a la misma.'
              : 'Elige a tu víctima.'}
          </p>
          {mates.size > 0 && night.my_target && (
            <p className={agreed ? 'font-semibold text-emerald-400' : 'text-amber-300'}>
              {agreed ? '✓ Estáis de acuerdo. Cerrad los ojos.' : 'Todavía no coincidís todos.'}
            </p>
          )}
          <PlayerPicker
            players={targets}
            photos={photos}
            selected={night.my_target ? [night.my_target] : []}
            disabled={busy}
            note={votesFor}
            onSelect={(id) => void act('kill', { target: id })}
          />
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
                  className="rounded-xl bg-stone-800 p-4 text-center font-semibold"
                  style={{ color: c.bando === 'bad' ? '#ef4444' : theme.color }}
                >
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

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-xl font-bold">Es tu turno{role ? `, ${getRole(theme, role.role).nombre}` : ''}</h2>
      {body}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

function Quiet({ title, text }: { title: string; text: string }) {
  return (
    <Card className="text-center">
      <p className="text-2xl font-bold">{title}</p>
      <p className="mt-2 text-stone-400">{text}</p>
    </Card>
  );
}
