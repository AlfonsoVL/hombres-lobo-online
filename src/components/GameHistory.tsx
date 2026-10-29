// Al terminar: salón de la fama, roles de todos y crónica de la partida.
import { useEffect, useState } from 'react';
import { chronicle, hallOfFame, type GameHistory as History } from '../lib/game/historial';
import type { Theme } from '../lib/tematicas';
import { getHistory } from '../lib/realtime/rpc';
import Avatar from './Avatar';
import RoleAvatar from './RoleAvatar';
import { Card, Ornament } from './ui';

interface Props {
  code: string;
  token: string;
  theme: Theme;
  photos: Map<string, string>;
}

export default function GameHistory({ code, token, theme, photos }: Props) {
  const [history, setHistory] = useState<History | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getHistory(code, token)
      .then(setHistory)
      .catch(() => setError(true));
  }, [code, token]);

  if (error) return <p className="text-center text-sm text-stone-400">No se ha podido cargar el histórico.</p>;
  if (!history) return <p className="text-center text-sm text-stone-400">Cargando el histórico…</p>;

  const awards = hallOfFame(theme, history);
  const rounds = chronicle(theme, history);
  const roleOf = (id: string) => theme.roles.find((r) => r.id === id);

  return (
    <div className="flex w-full flex-col gap-5 text-left">
      {awards.length > 0 && (
        <Card className="flex flex-col gap-3">
          <Ornament>SALÓN DE LA FAMA</Ornament>
          <ul className="flex flex-col gap-2">
            {awards.map((a, i) => (
              <li key={i} className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-stone-900/70 px-3 py-2">
                <span className="text-2xl leading-none" aria-hidden>
                  {a.emoji}
                </span>
                <span className="flex flex-col">
                  <span className="titulo text-sm font-semibold text-amber-300">{a.title}</span>
                  <span className="font-semibold text-stone-100">{a.players.join(', ')}</span>
                  <span className="text-sm text-stone-300">{a.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="flex flex-col gap-3">
        <Ornament>ROLES</Ornament>
        <ul className="grid grid-cols-2 gap-2">
          {history.players.map((p) => {
            const role = roleOf(p.role);
            const initial = p.initial_role !== p.role ? roleOf(p.initial_role) : undefined;
            return (
              <li key={p.id} className={`flex items-center gap-2 ${p.alive ? '' : 'opacity-60'}`}>
                {role ? <RoleAvatar role={role} size={40} /> : <Avatar id={p.id} name={p.name} photo={photos.get(p.id)} size={40} />}
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate font-semibold text-stone-100">
                    {p.alive ? '' : '✝ '}
                    {p.name}
                  </span>
                  <span className="truncate text-xs text-stone-400">
                    {role?.nombre}
                    {initial && ` (antes ${initial.nombre})`}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      {rounds.length > 0 && (
        <Card className="flex flex-col gap-4">
          <Ornament>CRÓNICA</Ornament>
          {rounds.map((r) => (
            <section key={r.round} className="flex flex-col gap-2">
              {r.night.length > 0 && (
                <>
                  <h3 className="titulo text-sm font-semibold text-amber-400">☽ Noche {r.round}</h3>
                  <ul className="flex flex-col gap-1 text-sm text-stone-200">
                    {r.night.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </>
              )}
              {r.day.length > 0 && (
                <>
                  <h3 className="titulo text-sm font-semibold text-amber-400">☀ Día {r.round}</h3>
                  <ul className="flex flex-col gap-1 text-sm text-stone-200">
                    {r.day.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          ))}
        </Card>
      )}
    </div>
  );
}
