// Rejilla de jugadores para elegir objetivo (víctima, voto, disparo...).
import type { PublicPlayer } from '../lib/realtime/rpc';
import Avatar from './Avatar';

interface Props {
  players: PublicPlayer[];
  photos: Map<string, string>;
  selected: string[];
  onSelect: (id: string) => void;
  disabled?: boolean;
  /** Texto pequeño bajo cada jugador, p. ej. el número de votos. */
  note?: (id: string) => string | undefined;
}

export default function PlayerPicker({ players, photos, selected, onSelect, disabled, note }: Props) {
  return (
    <ul className="grid grid-cols-3 gap-3">
      {players.map((p) => {
        const isSelected = selected.includes(p.id);
        return (
          <li key={p.id}>
            <button
              type="button"
              disabled={disabled}
              aria-pressed={isSelected}
              onClick={() => onSelect(p.id)}
              className={`flex w-full flex-col items-center gap-1 rounded-xl border-2 p-2 transition disabled:opacity-60 ${
                isSelected ? 'border-amber-400 bg-stone-800 shadow-[var(--brillo)]' : 'border-stone-700/50 bg-stone-900/70'
              }`}
            >
              <Avatar id={p.id} name={p.name} photo={photos.get(p.id)} size={52} />
              <span className="w-full truncate text-center text-sm">{p.name}</span>
              {note?.(p.id) && <span className="text-xs text-amber-400">{note(p.id)}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
