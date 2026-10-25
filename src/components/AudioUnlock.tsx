// Botón que desbloquea el audio del navegador antes de jugar.
import { useEffect, useState } from 'react';
import { isAudioUnlocked, onAudioUnlocked, unlockAudio } from '../lib/audio/unlock';
import { Button } from './ui';

export default function AudioUnlock() {
  const [unlocked, setUnlocked] = useState(isAudioUnlocked());
  useEffect(() => onAudioUnlocked(setUnlocked), []);

  if (unlocked) {
    return <p className="text-center text-sm text-emerald-400">🔊 Sonido activado</p>;
  }
  return (
    <Button type="button" variant="secondary" onClick={() => void unlockAudio()}>
      🔈 Activar sonido
    </Button>
  );
}
