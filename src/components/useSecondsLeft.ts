// Cuenta atrás del turno de los malos, con la hora del servidor.
import { useEffect, useMemo, useState } from 'react';
import { secondsLeft } from '../lib/game';
import type { PublicRoom } from '../lib/realtime/rpc';

/** Segundos que quedan del turno de los malos, o null si no hay cuenta atrás. */
export function useSecondsLeft(room: PublicRoom): number | null {
  // Momento en que llegó la sala: con server_time da el desfase del reloj del móvil.
  const receivedAt = useMemo(() => Date.now(), [room.server_time]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!room.step_ends_at) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [room.step_ends_at]);

  if (!room.step_ends_at) return null;
  return secondsLeft(room.step_ends_at, room.server_time, receivedAt, Math.max(now, receivedAt));
}
