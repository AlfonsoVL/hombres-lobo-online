// Ilustración de un rol (o del Alcalde) sobre un medallón del color de su bando.
import type { RoleCard } from '../lib/tematicas';

interface Props {
  role: Pick<RoleCard, 'avatar' | 'bando'> | 'alcalde';
  size?: number;
  className?: string;
}

const MEDALLION = {
  good: 'from-stone-600 to-stone-950 shadow-amber-400/25',
  bad: 'from-red-800 to-red-950 shadow-red-500/40',
  alcalde: 'from-amber-600 to-amber-950 shadow-amber-400/40',
};

export default function RoleAvatar({ role, size = 56, className = '' }: Props) {
  const src = role === 'alcalde' ? '/avatares/alcalde.png' : role.avatar;
  const tone = role === 'alcalde' ? 'alcalde' : role.bando;
  return (
    <span
      style={{ width: size, height: size }}
      className={`flex shrink-0 items-center justify-center rounded-full border border-white/15 bg-radial-[at_50%_35%] shadow-lg ${MEDALLION[tone]} ${className}`}
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
