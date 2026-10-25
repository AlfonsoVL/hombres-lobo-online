// Formulario para crear una sala: temática, modo y nombre del creador.
import { useState } from 'react';
import { roleByKind, THEMES, type ThemeId } from '../lib/tematicas';
import { useThemeStyle } from '../lib/estilo';
import { createRoom, type Mode } from '../lib/realtime/rpc';
import { newToken, saveToken } from '../lib/realtime/token';
import { setOwnPhoto } from '../lib/foto/ownPhoto';
import AudioUnlock from './AudioUnlock';
import Camera from './Camera';
import RoleAvatar from './RoleAvatar';
import RoomApp from './RoomApp';
import { Button, Card, ErrorText, NameField } from './ui';

const MODES: { id: Mode; name: string; description: string }[] = [
  { id: 'classic', name: 'Clásico', description: 'Los roles salen de la tabla según el número de jugadores.' },
  { id: 'custom', name: 'Personalizado', description: 'Tú eliges los roles especiales y el número de malos.' },
];

export default function CreateRoom() {
  const [theme, setTheme] = useState<ThemeId>('castronegro');
  const [mode, setMode] = useState<Mode>('classic');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  useThemeStyle(theme);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Escribe tu nombre.');
    setBusy(true);
    setError('');
    try {
      const token = newToken();
      const { code } = await createRoom(theme, mode, name.trim(), token);
      saveToken(code, token);
      setOwnPhoto(code, photo);
      // Se cambia la URL sin recargar para no perder la foto, que solo está en memoria.
      window.history.pushState(null, '', `/sala/${code}`);
      setRoomCode(code);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido crear la sala.');
      setBusy(false);
    }
  }

  if (roomCode) return <RoomApp code={roomCode} />;

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <header className="flex flex-col items-center gap-3 pt-4 text-center">
        <RoleAvatar key={theme} role={roleByKind(THEMES[theme], 'bad')} size={120} className="aparecer" />
        <h1 className="text-4xl font-extrabold leading-tight text-amber-300 [text-shadow:var(--brillo)]">
          Hombres lobo
          <span className="block text-lg font-semibold tracking-[0.3em] text-stone-300">online</span>
        </h1>
        <p className="text-stone-400">Crea una sala y comparte el enlace con tu grupo.</p>
        <a href="/ayuda" className="text-sm text-amber-400 underline underline-offset-4">
          Cómo se juega y roles
        </a>
      </header>

      <AudioUnlock />

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Temática</h2>
        <div className="grid grid-cols-2 gap-3">
          {Object.values(THEMES).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTheme(t.id)}
              aria-pressed={theme === t.id}
              className={`flex flex-col items-center gap-2 rounded-xl border-2 p-3 text-center transition ${
                theme === t.id ? 'border-amber-400 bg-stone-800/80' : 'border-stone-700 text-stone-400 opacity-80'
              }`}
            >
              <RoleAvatar role={roleByKind(t, 'bad')} size={56} />
              <span className="block text-sm font-semibold">{t.nombre}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Modo</h2>
        <div className="flex flex-col gap-3">
          {MODES.map((m) => (
            <label
              key={m.id}
              className={`flex cursor-pointer gap-3 rounded-xl border-2 p-3 ${
                mode === m.id ? 'border-amber-500' : 'border-stone-700'
              }`}
            >
              <input
                type="radio"
                name="mode"
                className="mt-1 accent-amber-500"
                checked={mode === m.id}
                onChange={() => setMode(m.id)}
              />
              <span>
                <span className="block font-semibold">{m.name}</span>
                <span className="text-sm text-stone-400">{m.description}</span>
              </span>
            </label>
          ))}
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <NameField value={name} onChange={setName} />
        <Camera name={name} photo={photo} onChange={setPhoto} />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy}>
          {busy ? 'Creando sala…' : 'Crear sala'}
        </Button>
      </Card>
    </form>
  );
}
