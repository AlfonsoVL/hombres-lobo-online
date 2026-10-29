// Avatar de jugador: su foto si la tenemos en memoria, o sus iniciales.
import { initials, initialsColor } from '../lib/foto/foto';

interface Props {
  id: string;
  name: string;
  photo?: string;
  size?: number;
  /** Aro dorado alrededor, como en la sala y la votación. */
  ring?: boolean;
  className?: string;
}

export default function Avatar({ id, name, photo, size = 40, ring = false, className = '' }: Props) {
  const style = { width: size, height: size };
  const frame = `${ring ? 'ring-2 ring-amber-500/80 ring-offset-2 ring-offset-stone-950' : ''} ${className}`;
  if (photo) {
    return <img src={photo} alt={name} style={style} className={`shrink-0 rounded-full object-cover ${frame}`} />;
  }
  return (
    <span
      aria-label={name}
      style={{ ...style, backgroundColor: initialsColor(id), fontSize: size * 0.4 }}
      className={`titulo flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${frame}`}
    >
      {initials(name)}
    </span>
  );
}
