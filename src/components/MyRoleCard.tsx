// Carta del rol propio. Se ve solo mientras se mantiene pulsada, para que
// nadie la vea por encima del hombro.
import { useEffect, useState } from 'react';
import { getRole, type Theme } from '../lib/tematicas';
import { getMyRole, type MyRole } from '../lib/realtime/rpc';
import RoleAvatar from './RoleAvatar';
import { ErrorText } from './ui';

export default function MyRoleCard({ theme, token }: { theme: Theme; token: string }) {
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
      className={`relative min-h-[26rem] w-full touch-none select-none overflow-hidden rounded-3xl border-4 p-2 text-left shadow-2xl shadow-black/60 transition ${
        visible ? (bad ? 'border-red-700' : 'border-amber-500') : 'border-stone-600'
      }`}
      aria-label="Mantén pulsado para ver tu rol"
    >
      {visible ? (
        <span
          className={`flex h-full min-h-[24rem] flex-col items-center gap-3 rounded-2xl border p-4 text-center ${
            bad ? 'border-red-900 bg-gradient-to-b from-red-950 to-stone-950' : 'border-amber-900 bg-gradient-to-b from-stone-800 to-stone-950'
          }`}
        >
          <span className="text-xs uppercase tracking-[0.3em] text-stone-400">Eres</span>
          <RoleAvatar role={card} size={144} />
          <span className={`titulo text-3xl font-extrabold ${bad ? 'text-red-400' : 'text-amber-300'}`}>{card.nombre}</span>
          <span
            className={`rounded-full px-3 py-0.5 text-xs font-semibold uppercase tracking-wider ${
              bad ? 'bg-red-900/70 text-red-100' : 'bg-amber-950 text-amber-200'
            }`}
          >
            {theme.bandos[card.bando]}
          </span>
          <span className="text-stone-200">{card.poder}</span>
          <span className="text-sm text-stone-400">
            <strong className="text-stone-300">Cuándo actúa:</strong> {card.cuando_actua}
          </span>
          <span className="text-sm text-stone-400">
            <strong className="text-stone-300">Gana:</strong> {card.gana}
          </span>
          {role.bad_teammates && (
            <span className="text-sm text-red-300">
              {role.bad_teammates.length
                ? `Tus compañeros: ${role.bad_teammates.map((p) => p.name).join(', ')}`
                : 'Eres el único de tu bando.'}
            </span>
          )}
          {role.lover && (
            <span className="text-sm text-pink-300">
              💘 Estás enamorado de {role.lover.name}. Si uno muere, el otro también.
            </span>
          )}
        </span>
      ) : (
        <span className="flex h-full min-h-[24rem] flex-col items-center justify-center gap-4 rounded-2xl border border-stone-700 bg-stone-900 bg-[repeating-linear-gradient(45deg,transparent_0_10px,rgb(255_255_255/0.03)_10px_20px)] p-4 text-center">
          <span className="flex h-28 w-28 items-center justify-center rounded-full border-2 border-amber-500/60 bg-stone-950 text-5xl shadow-[var(--brillo)]">
            {theme.id === 'alien' ? '👁️' : '🌕'}
          </span>
          <span className="titulo text-lg font-semibold text-amber-300">Mantén pulsado para ver tu rol</span>
          <span className="text-sm text-stone-400">Al soltar se vuelve a tapar.</span>
        </span>
      )}
    </button>
  );
}
