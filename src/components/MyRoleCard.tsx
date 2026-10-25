// Carta del rol propio. Se ve solo mientras se mantiene pulsada, para que
// nadie la vea por encima del hombro.
import { useEffect, useState } from 'react';
import { getRole, type Theme } from '../lib/tematicas';
import { getMyRole, type MyRole } from '../lib/realtime/rpc';
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
      className="min-h-64 w-full touch-none select-none rounded-2xl border-2 border-stone-700 bg-stone-900 p-5 text-left"
      aria-label="Mantén pulsado para ver tu rol"
    >
      {visible ? (
        <span className="flex flex-col gap-3">
          <img src={card.avatar} alt="" width={72} height={72} className="h-18 w-18" />
          <span className="text-sm text-stone-400">Eres</span>
          <span className="text-3xl font-bold" style={{ color: card.bando === 'bad' ? '#ef4444' : theme.color }}>
            {card.nombre}
          </span>
          <span className="text-sm font-semibold">Bando: {theme.bandos[card.bando]}</span>
          <span className="text-stone-300">{card.poder}</span>
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
        <span className="flex h-full min-h-56 flex-col items-center justify-center gap-2 text-center">
          <span className="text-5xl">🂠</span>
          <span className="font-semibold">Mantén pulsado para ver tu rol</span>
          <span className="text-sm text-stone-400">Al soltar se vuelve a tapar.</span>
        </span>
      )}
    </button>
  );
}
