// Botón que desbloquea el audio del navegador antes de jugar.
import { useEffect, useState } from 'react';
import { isAudioUnlocked, onAudioUnlocked, unlockAudio } from '../lib/audio/unlock';

export default function AudioUnlock() {
  const [unlocked, setUnlocked] = useState(isAudioUnlocked());
  useEffect(() => onAudioUnlocked(setUnlocked), []);

  if (unlocked) {
    return <p className="text-center text-sm text-emerald-400">🔊 Sonido activado</p>;
  }
  return (
    <button
      type="button"
      onClick={() => void unlockAudio()}
      className="rounded-full border border-amber-500/30 bg-stone-900/80 px-5 py-2 text-sm font-semibold text-stone-200"
    >
      🔈 Activar sonido
    </button>
  );
}
