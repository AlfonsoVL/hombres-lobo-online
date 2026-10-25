// Partida en curso: introducción, reparto y noche. La noche por turnos, el
// día y las votaciones se añadirán aquí.
import { useState } from 'react';
import { getTheme } from '../lib/tematicas';
import { advancePhase, type PublicRoom } from '../lib/realtime/rpc';
import Avatar from './Avatar';
import MyRoleCard from './MyRoleCard';
import { Button, Card, ErrorText } from './ui';

interface Props {
  room: PublicRoom;
  token: string;
  photos: Map<string, string>;
  onAdvanced: () => Promise<void>;
}

const NEXT_STEP: Partial<Record<PublicRoom['phase'], string>> = {
  intro: 'Repartir los roles',
  role_reveal: 'Todos han visto su rol: empezar la noche',
};

export default function Game({ room, token, photos, onAdvanced }: Props) {
  const theme = getTheme(room.theme);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const creator = room.players.find((p) => p.is_creator);
  const next = NEXT_STEP[room.phase];

  async function advance() {
    setBusy(true);
    setError('');
    try {
      await advancePhase(room.code, token, room.version);
      await onAdvanced();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido avanzar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="text-center">
        <p className="text-sm font-semibold" style={{ color: theme.color }}>
          {theme.nombre}
          {room.round > 0 && ` · Noche ${room.round}`}
        </p>
      </header>

      {room.phase === 'intro' && (
        <Card>
          <h1 className="mb-3 text-2xl font-bold">Introducción</h1>
          <p className="text-lg text-stone-300">{theme.textos.introduccion.texto}</p>
        </Card>
      )}

      {room.phase === 'role_reveal' && (
        <>
          <Card>
            <h1 className="mb-2 text-2xl font-bold">Mira tu rol</h1>
            <p className="text-stone-400">Que nadie vea tu pantalla. Mantén pulsada la carta para verla.</p>
          </Card>
          <MyRoleCard theme={theme} token={token} />
        </>
      )}

      {room.phase !== 'intro' && room.phase !== 'role_reveal' && (
        <>
          <Card className="text-center">
            <h1 className="mb-2 text-2xl font-bold">🌙 {theme.textos.cerrad_ojos.texto}</h1>
            <p className="text-stone-400">Los turnos de la noche llegarán en la siguiente versión.</p>
          </Card>
          <details className="rounded-2xl bg-stone-900 p-4">
            <summary className="cursor-pointer font-semibold">Ver mi rol</summary>
            <div className="mt-3">
              <MyRoleCard theme={theme} token={token} />
            </div>
          </details>
        </>
      )}

      <ErrorText>{error}</ErrorText>
      {next &&
        (room.me.is_creator ? (
          <Button type="button" disabled={busy} onClick={() => void advance()}>
            {busy ? 'Un momento…' : next}
          </Button>
        ) : (
          <p className="text-center text-stone-400">{creator?.name ?? 'El creador'} dirige la partida.</p>
        ))}

      <Card>
        <h2 className="mb-3 font-semibold">Jugadores</h2>
        <ul className="grid grid-cols-4 gap-3">
          {room.players.map((p) => (
            <li key={p.id} className={`flex flex-col items-center gap-1 ${p.is_alive ? '' : 'opacity-40'}`}>
              <Avatar id={p.id} name={p.name} photo={photos.get(p.id)} size={48} />
              <span className="w-full truncate text-center text-xs">{p.name}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
