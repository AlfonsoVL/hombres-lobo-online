// Configuración de la partida para el creador: composición, resumen e inicio.
import { useMemo, useState } from 'react';
import {
  classicComposition,
  compositionSummary,
  customComposition,
  type Composition,
  type Result,
} from '../lib/game';
import { TEST_MODE } from '../lib/config';
import { getRole, getTheme, roleByKind } from '../lib/tematicas';
import { startGame, type PublicRoom } from '../lib/realtime/rpc';
import RoleAvatar from './RoleAvatar';
import { Button, Card, ErrorText, Toggle } from './ui';

interface Props {
  room: PublicRoom;
  token: string;
  onStarted: () => Promise<void>;
}

export default function GameSetup({ room, token, onStarted }: Props) {
  const theme = getTheme(room.theme);
  const players = room.players.length;
  const specialRoles = theme.roles.filter((r) => r.tipo !== 'bad' && r.tipo !== 'plain_good');

  const suggestion = classicComposition(theme, players, { testMode: TEST_MODE });
  const [bad, setBad] = useState(suggestion.ok ? suggestion.value.bad : 1);
  const [specials, setSpecials] = useState<string[]>(suggestion.ok ? suggestion.value.specials : []);
  const [mayor, setMayor] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const composition: Result<Composition> = useMemo(
    () =>
      room.mode === 'classic'
        ? classicComposition(theme, players, { testMode: TEST_MODE })
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
      await startGame(room.code, token, composition.value.specials, composition.value.bad, mayor);
      // El servidor avisa a todos; además se reenvía el aviso desde aquí.
      await onStarted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido iniciar la partida.');
      setBusy(false);
    }
  }

  const row = 'flex items-center gap-3 rounded-xl border border-stone-700/60 bg-stone-900/70 px-3 py-2';
  const badRole = roleByKind(theme, 'bad');

  if (confirming && composition.ok) {
    return (
      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-amber-300">Confirma la partida</h2>
        <p>{compositionSummary(theme, composition.value)}</p>
        {mayor && <p className="text-sm text-stone-400">Con Alcalde, que se sorteará entre todos.</p>}
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
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold text-amber-300">Configuración de la partida</h2>
        <p className="text-sm text-stone-400">Modo: {room.mode === 'classic' ? 'Clásico' : 'Personalizado'}</p>
      </div>
      {TEST_MODE && players < 6 && (
        <p className="rounded-lg bg-amber-950 px-3 py-2 text-sm text-amber-200">
          Modo pruebas: se puede empezar con menos de 6 jugadores.
        </p>
      )}

      {room.mode === 'custom' && (
        <>
          <div className={row}>
            <RoleAvatar role={badRole} size={36} />
            <span className="flex-1">{theme.nombres_grupo.bad}</span>
            <button
              type="button"
              className="h-8 w-8 rounded-lg bg-stone-800 text-xl"
              onClick={() => setBad((b) => Math.max(1, b - 1))}
              aria-label="Quitar un malo"
            >
              −
            </button>
            <span className="w-5 text-center text-lg font-semibold">{bad}</span>
            <button
              type="button"
              className="h-8 w-8 rounded-lg bg-stone-800 text-xl"
              onClick={() => setBad((b) => b + 1)}
              aria-label="Añadir un malo"
            >
              +
            </button>
          </div>
          {specialRoles.map((r) => (
            <div key={r.id} className={row}>
              <RoleAvatar role={r} size={36} />
              <span className="flex-1">{r.nombre}</span>
              <Toggle label={r.nombre} checked={specials.includes(r.id)} onChange={() => toggle(r.id)} />
            </div>
          ))}
          {suggestion.ok && (
            <button type="button" className="text-sm text-amber-400 underline" onClick={applySuggestion}>
              Usar la composición sugerida para {players} jugadores
            </button>
          )}
        </>
      )}

      {room.mode === 'classic' &&
        composition.ok &&
        composition.value.specials.map((id) => {
          const r = getRole(theme, id);
          return (
            <div key={id} className={row}>
              <RoleAvatar role={r} size={36} />
              <span className="flex-1">{r.nombre}</span>
              <span className="text-sm text-emerald-400">Incluido</span>
            </div>
          );
        })}

      <div className={row}>
        <RoleAvatar role="alcalde" size={36} />
        <span className="flex-1">
          <span className="block">Alcalde</span>
          <span className="text-xs text-stone-400">Se sortea entre todos y deshace los empates del día.</span>
        </span>
        <Toggle label="Alcalde" checked={mayor} onChange={setMayor} />
      </div>

      {composition.ok ? (
        <p className="text-sm text-stone-300">{compositionSummary(theme, composition.value)}</p>
      ) : (
        <ErrorText>{composition.error}</ErrorText>
      )}

      <Button type="button" disabled={!composition.ok} onClick={() => setConfirming(true)}>
        Iniciar partida
      </Button>
    </Card>
  );
}
