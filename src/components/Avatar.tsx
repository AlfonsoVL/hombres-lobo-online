// Avatar de jugador: su foto si la tenemos en memoria, o sus iniciales.
import { initials, initialsColor } from '../lib/foto/foto';

interface Props {
  id: string;
  name: string;
  photo?: string;
  size?: number;
}

export default function Avatar({ id, name, photo, size = 40 }: Props) {
  const style = { width: size, height: size };
  if (photo) {
    return <img src={photo} alt={name} style={style} className="shrink-0 rounded-full object-cover" />;
  }
  return (
    <span
      aria-label={name}
      style={{ ...style, backgroundColor: initialsColor(id), fontSize: size * 0.4 }}
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
    >
      {initials(name)}
    </span>
  );
}
