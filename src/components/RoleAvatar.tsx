// Avatar de un rol (o del Alcalde): un retrato a círculo completo o un emoji
// sobre un medallón del color de su bando. El Alcalde siempre es un retrato.
import type { RoleCard } from '../lib/tematicas';

interface Props {
  role: Pick<RoleCard, 'avatar' | 'bando' | 'retrato'> | 'alcalde';
  size?: number;
  className?: string;
}

const MEDALLION = {
  good: 'from-stone-600 to-stone-950 shadow-amber-400/25',
  bad: 'from-red-800 to-red-950 shadow-red-500/40',
};

export default function RoleAvatar({ role, size = 56, className = '' }: Props) {
  const src = role === 'alcalde' ? '/avatares/alcalde.webp' : role.avatar;
  if (role === 'alcalde' || role.retrato) {
    return (
      <img
        src={src}
        alt=""
        width={320}
        height={320}
        style={{ width: size, height: size }}
        className={`shrink-0 rounded-full border-2 shadow-lg ${
          role !== 'alcalde' && role.bando === 'bad'
            ? 'border-red-800 shadow-red-500/40'
            : 'border-amber-700/70 shadow-amber-400/25'
        } ${className}`}
      />
    );
  }
  return (
    <span
      style={{ width: size, height: size }}
      className={`flex shrink-0 items-center justify-center rounded-full border border-white/15 bg-radial-[at_50%_35%] shadow-lg ${MEDALLION[role.bando]} ${className}`}
    >
      <img
        src={src}
        alt=""
        width={256}
        height={256}
        style={{ width: size * 0.76, height: size * 0.76 }}
        className="drop-shadow-[0_4px_4px_rgb(0_0_0/0.45)]"
      />
    </span>
  );
}
