// Configuración de la partida para el creador: composición, resumen e inicio.
import { useMemo, useState } from 'react';
import {
  classicComposition,
  compositionSummary,
  customComposition,
  type Composition,
  type Result,
} from '../lib/game';
import { getTheme } from '../lib/tematicas';
import { startGame, type PublicRoom } from '../lib/realtime/rpc';
import { Button, Card, ErrorText } from './ui';

export default function GameSetup({ room, token }: { room: PublicRoom; token: string }) {
  const theme = getTheme(room.theme);
  const players = room.players.length;
  const specialRoles = theme.roles.filter((r) => r.tipo !== 'bad' && r.tipo !== 'plain_good');

  const suggestion = classicComposition(theme, players);
  const [bad, setBad] = useState(suggestion.ok ? suggestion.value.bad : 1);
  const [specials, setSpecials] = useState<string[]>(suggestion.ok ? suggestion.value.specials : []);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const composition: Result<Composition> = useMemo(
    () =>
      room.mode === 'classic'
        ? classicComposition(theme, players)
        : customComposition(theme, players, bad, specials),
    [room.mode, theme, players, bad, specials],
  );

  function applySuggestion() {
    if (!suggestion.ok) return;
    setBad(suggestion.value.bad);
    setSpecials(suggestion.value.specials);
  }

  function toggle(id: string) {
    setSpecials((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function start() {
    if (!composition.ok) return;
    setBusy(true);
    setError('');
    try {
      await startGame(room.code, token, composition.value.specials, composition.value.bad);
      // El evento partida_iniciada actualizará la pantalla de todos.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido iniciar la partida.');
      setBusy(false);
    }
  }

  if (confirming && composition.ok) {
    return (
      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Confirma la partida</h2>
        <p>{compositionSummary(theme, composition.value)}</p>
        <ErrorText>{error}</ErrorText>
        <Button type="button" disabled={busy} onClick={() => void start()}>
          {busy ? 'Repartiendo roles…' : 'Confirmar e iniciar'}
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>
          Volver
        </Button>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Configurar partida</h2>

      {room.mode === 'custom' && (
        <>
          <div className="flex items-center justify-between">
            <span>{theme.nombres_grupo.bad}</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="h-9 w-9 rounded-lg bg-stone-800 text-xl"
                onClick={() => setBad((b) => Math.max(1, b - 1))}
                aria-label="Quitar un malo"
              >
                −
              </button>
              <span className="w-6 text-center text-lg font-semibold">{bad}</span>
              <button
                type="button"
                className="h-9 w-9 rounded-lg bg-stone-800 text-xl"
                onClick={() => setBad((b) => b + 1)}
                aria-label="Añadir un malo"
              >
                +
              </button>
            </div>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm text-stone-400">Roles especiales</legend>
            {specialRoles.map((r) => (
              <label key={r.id} className="flex items-center gap-3 rounded-lg bg-stone-800 px-3 py-2">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  style={{ accentColor: theme.color }}
                  checked={specials.includes(r.id)}
                  onChange={() => toggle(r.id)}
                />
                <span className="flex-1">{r.nombre}</span>
              </label>
            ))}
          </fieldset>
          {suggestion.ok && (
            <button type="button" className="text-sm text-stone-400 underline" onClick={applySuggestion}>
              Usar la composición sugerida para {players} jugadores
            </button>
          )}
        </>
      )}

      {composition.ok ? (
        <p className="text-stone-300">{compositionSummary(theme, composition.value)}</p>
      ) : (
        <ErrorText>{composition.error}</ErrorText>
      )}

      <Button type="button" disabled={!composition.ok} onClick={() => setConfirming(true)}>
        Iniciar partida
      </Button>
    </Card>
  );
}
