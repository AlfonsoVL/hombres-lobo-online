// Lista de jugadores para elegir objetivo (víctima, voto, disparo...).
import type { PublicPlayer } from '../lib/realtime/rpc';
import Avatar from './Avatar';

interface Props {
  players: PublicPlayer[];
  photos: Map<string, string>;
  selected: string[];
  onSelect: (id: string) => void;
  disabled?: boolean;
  /** Texto pequeño junto a cada jugador, p. ej. quién lo ha votado. */
  note?: (id: string) => string | undefined;
}

export default function PlayerPicker({ players, photos, selected, onSelect, disabled, note }: Props) {
  return (
    <ul className="flex flex-col gap-2">
      {players.map((p) => {
        const isSelected = selected.includes(p.id);
        return (
          <li key={p.id}>
            <button
              type="button"
              disabled={disabled}
              aria-pressed={isSelected}
              onClick={() => onSelect(p.id)}
              className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition disabled:opacity-60 ${
                isSelected
                  ? 'border-amber-400 bg-amber-950/40 shadow-[var(--brillo)]'
                  : 'border-stone-700/60 bg-stone-900/70'
              }`}
            >
              <Avatar id={p.id} name={p.name} photo={photos.get(p.id)} size={40} />
              <span className={`flex-1 truncate font-semibold ${isSelected ? 'text-amber-300' : ''}`}>{p.name}</span>
              {note?.(p.id) && <span className="max-w-[40%] truncate text-xs text-amber-400">{note(p.id)}</span>}
              <span
                aria-hidden
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                  isSelected ? 'border-amber-400' : 'border-stone-500'
                }`}
              >
                {isSelected && <span className="h-3 w-3 rounded-full bg-amber-400" />}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
