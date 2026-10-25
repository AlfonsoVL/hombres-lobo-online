// Ilustración de un rol (o del Alcalde) con un halo del color de su bando.
import type { RoleCard } from '../lib/tematicas';

interface Props {
  role: Pick<RoleCard, 'avatar' | 'bando'> | 'alcalde';
  size?: number;
  className?: string;
}

export default function RoleAvatar({ role, size = 56, className = '' }: Props) {
  const src = role === 'alcalde' ? '/avatares/alcalde.svg' : role.avatar;
  const halo =
    role === 'alcalde' ? 'shadow-amber-400/40' : role.bando === 'bad' ? 'shadow-red-500/50' : 'shadow-amber-400/30';
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={`shrink-0 rounded-full shadow-lg ${halo} ${className}`}
    />
  );
}
