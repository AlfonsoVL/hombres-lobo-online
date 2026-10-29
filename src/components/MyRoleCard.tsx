// Carta del rol propio. Se ve solo mientras se mantiene pulsada, para que
// nadie la vea por encima del hombro.
import { useEffect, useState } from 'react';
import { getRole, type Theme } from '../lib/tematicas';
import { getMyRole, type MyRole } from '../lib/realtime/rpc';
import Avatar from './Avatar';
import RoleAvatar from './RoleAvatar';
import { ErrorText, Ornament } from './ui';

interface Props {
  theme: Theme;
  token: string;
  /** Fotos en memoria, para mostrar a tu pareja si eres enamorado. */
  photos?: Map<string, string>;
}

export default function MyRoleCard({ theme, token, photos }: Props) {
  const [role, setRole] = useState<MyRole | null>(null);
  const [error, setError] = useState('');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    getMyRole(token)
      .then(setRole)
      .catch((err) => setError(err instanceof Error ? err.message : 'No se ha podido cargar tu rol.'));
  }, [token]);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!role) return <p className="text-center text-stone-400">Cargando tu carta…</p>;

  const card = getRole(theme, role.role);
  const bad = card.bando === 'bad';
  const show = () => setVisible(true);
  const hide = () => setVisible(false);

  const frame = visible ? (bad ? 'border-red-700' : 'border-amber-500') : 'border-amber-700/60';
  const corner = `absolute h-3 w-3 rotate-45 border-2 bg-stone-950 ${frame}`;

  return (
    <button
      type="button"
      onPointerDown={show}
      onPointerUp={hide}
      onPointerLeave={hide}
      onPointerCancel={hide}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && show()}
      onKeyUp={hide}
      onBlur={hide}
      className={`relative min-h-[28rem] w-full touch-none select-none rounded-2xl border-[3px] p-1.5 text-left shadow-2xl shadow-black/70 transition ${frame} ${
        visible && bad ? 'shadow-red-900/50' : ''
      }`}
      aria-label="Mantén pulsado para ver tu rol"
    >
      <span className={`${corner} -left-[7px] -top-[7px]`} />
      <span className={`${corner} -right-[7px] -top-[7px]`} />
      <span className={`${corner} -bottom-[7px] -left-[7px]`} />
      <span className={`${corner} -bottom-[7px] -right-[7px]`} />
      {visible ? (
        <span
          className={`flex h-full min-h-[27rem] flex-col items-center gap-3 rounded-xl border p-4 text-center ${
            bad
              ? 'border-red-900/80 bg-gradient-to-b from-red-950 via-stone-950 to-stone-950'
              : 'border-amber-800/60 bg-gradient-to-b from-stone-800 via-stone-950 to-stone-950'
          }`}
        >
          <Ornament>ERES</Ornament>
          <RoleAvatar role={card} size={168} />
          <span className={`titulo text-4xl font-extrabold ${bad ? 'text-red-400' : 'text-amber-300'}`}>
            {card.nombre}
          </span>
          <span
            className={`rounded-full px-3 py-0.5 text-xs font-semibold ${
              bad ? 'bg-red-900/80 text-red-100' : 'bg-amber-950 text-amber-200'
            }`}
          >
            Bando: {theme.bandos[card.bando]}
          </span>
          <span className="text-stone-100">{card.poder}</span>
          <span className="grid w-full grid-cols-2 gap-2 text-left text-xs">
            <span className="rounded-lg border border-stone-700/70 bg-stone-950/60 p-2">
              <strong className="block text-stone-200">Cuándo actúa</strong>
              <span className="text-stone-400">{card.cuando_actua}</span>
            </span>
            <span className="rounded-lg border border-stone-700/70 bg-stone-950/60 p-2">
              <strong className={`block ${bad ? 'text-red-300' : 'text-amber-300'}`}>Gana</strong>
              <span className="text-stone-400">{card.gana}</span>
            </span>
          </span>
          {role.bad_teammates && (
            <span className="flex w-full flex-col items-start gap-2">
              <span className="text-sm font-semibold text-stone-200">Tus compañeros:</span>
              {role.bad_teammates.length ? (
                <span className="flex flex-wrap gap-4">
                  {role.bad_teammates.map((p) => (
                    <span key={p.id} className="flex flex-col items-center gap-1 text-xs">
                      <RoleAvatar role={card} size={52} />
                      {p.name}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="text-sm text-red-300">Eres el único de tu bando.</span>
              )}
            </span>
          )}
          {role.lover && (
            <span className="flex items-center gap-3 text-left text-sm text-pink-300">
              <Avatar id={role.lover.id} name={role.lover.name} photo={photos?.get(role.lover.id)} size={44} />
              💘 Estás enamorado de {role.lover.name}. Si uno muere, el otro también.
            </span>
          )}
        </span>
      ) : (
        <span className="flex h-full min-h-[27rem] flex-col items-center justify-center gap-4 rounded-xl border border-amber-900/50 bg-stone-950 bg-[repeating-linear-gradient(45deg,transparent_0_10px,rgb(255_255_255/0.03)_10px_20px)] p-4 text-center">
          <span className="flex h-32 w-32 items-center justify-center rounded-full border-2 border-amber-500/60 bg-stone-900 text-6xl shadow-[var(--brillo)]">
            {theme.id === 'alien' ? '👁️' : '🌕'}
          </span>
          <span className="titulo text-lg font-semibold text-amber-300">Mantén pulsado para ver tu rol</span>
          <span className="text-sm text-stone-400">Al soltar se vuelve a tapar.</span>
        </span>
      )}
    </button>
  );
}
