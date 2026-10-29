// Formulario para crear una sala: temática, modo y nombre del creador.
import { useState } from 'react';
import { roleByKind, THEMES, type ThemeId } from '../lib/tematicas';
import { useThemeStyle } from '../lib/estilo';
import { createRoom, type DayMinutes, type Mode } from '../lib/realtime/rpc';
import { newToken, saveToken } from '../lib/realtime/token';
import { unlockAudio } from '../lib/audio/unlock';
import { initialsPhoto } from '../lib/foto/foto';
import { setOwnPhoto } from '../lib/foto/ownPhoto';
import Camera from './Camera';
import Logo from './Logo';
import RoleAvatar from './RoleAvatar';
import RoomApp from './RoomApp';
import { Button, ErrorText, Label, NameField } from './ui';

const MODES: { id: Mode; name: string; description: string }[] = [
  { id: 'classic', name: 'Clásico', description: 'Los roles se eligen solos según el número de jugadores.' },
  { id: 'custom', name: 'Personalizado', description: 'Tú eliges los roles y el número de malos.' },
];

const DAY_TIMES: { minutes: DayMinutes; name: string }[] = [
  { minutes: 3, name: '3 minutos' },
  { minutes: 5, name: '5 minutos' },
  { minutes: null, name: 'Sin límite' },
];

export default function CreateRoom() {
  const [theme, setTheme] = useState<ThemeId>('castronegro');
  const [mode, setMode] = useState<Mode>('classic');
  const [dayMinutes, setDayMinutes] = useState<DayMinutes>(5);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  useThemeStyle(theme);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Escribe tu nombre.');
    // El toque en «Crear sala» desbloquea el audio: el creador narra por defecto.
    void unlockAudio();
    setBusy(true);
    setError('');
    try {
      const token = newToken();
      const { code } = await createRoom(theme, mode, name.trim(), token, dayMinutes);
      saveToken(code, token);
      setOwnPhoto(code, photo ?? (color ? initialsPhoto(name.trim(), color) : null));
      // Se cambia la URL sin recargar para no perder la foto, que solo está en memoria.
      window.history.pushState(null, '', `/sala/${code}`);
      setRoomCode(code);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido crear la sala.');
      setBusy(false);
    }
  }

  if (roomCode) return <RoomApp code={roomCode} />;

  const current = THEMES[theme];
  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <header className="-mt-4 flex flex-col items-center text-center">
        <Logo theme={current} />
        <p className="mt-3 text-lg text-stone-200">Crea una sala y comparte el enlace con tu grupo.</p>
        <a href="/ayuda" className="mt-2 text-sm text-amber-400 underline underline-offset-4">
          📖 Cómo se juega y roles
        </a>
      </header>


      <section>
        <Label>Temática</Label>
        <div className="grid grid-cols-2 gap-3">
          {Object.values(THEMES).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTheme(t.id)}
              aria-pressed={theme === t.id}
              className={`flex flex-col items-center gap-2 rounded-xl border-2 bg-stone-950/70 p-3 text-center transition ${
                theme === t.id ? 'border-amber-400 shadow-[var(--brillo)]' : 'border-stone-700 text-stone-400 opacity-80'
              }`}
            >
              <RoleAvatar role={roleByKind(t, 'bad')} size={64} />
              <span className="block text-sm font-semibold">{t.nombre}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <Label>Modo de partida</Label>
        <div className="grid grid-cols-2 gap-3">
          {MODES.map((m) => (
            <label key={m.id} className="flex cursor-pointer items-start gap-2">
              <input
                type="radio"
                name="mode"
                className="mt-1 h-5 w-5 shrink-0 accent-amber-500"
                checked={mode === m.id}
                onChange={() => setMode(m.id)}
              />
              <span>
                <span className="block font-semibold">{m.name}</span>
                <span className="text-xs text-stone-400">{m.description}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section>
        <Label>Tiempo para votar de día</Label>
        <div className="grid grid-cols-3 gap-3">
          {DAY_TIMES.map((t) => (
            <label key={t.name} className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="day-minutes"
                className="h-5 w-5 shrink-0 accent-amber-500"
                checked={dayMinutes === t.minutes}
                onChange={() => setDayMinutes(t.minutes)}
              />
              <span className="font-semibold">{t.name}</span>
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-stone-400">Al acabarse el tiempo se cierra la votación sola.</p>
      </section>

      <NameField value={name} onChange={setName} />
      <Camera name={name} photo={photo} onChange={setPhoto} color={color} onColor={setColor} />
      <ErrorText>{error}</ErrorText>
      <Button type="submit" disabled={busy}>
        {busy ? 'Creando sala…' : 'Crear sala'}
      </Button>
    </form>
  );
}
