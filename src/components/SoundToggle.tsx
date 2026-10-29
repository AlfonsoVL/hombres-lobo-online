// Interruptor de sonido de la partida. Al activarlo se desbloquea el audio
// del navegador, que solo deja sonar después de un toque.
import { useEffect, useState } from 'react';
import { stopNarration } from '../lib/audio/narrate';
import { isSoundOn, onSoundChange, setSoundOn } from '../lib/audio/sonido';
import { unlockAudio } from '../lib/audio/unlock';

export default function SoundToggle({ code }: { code: string }) {
  const [on, setOn] = useState(isSoundOn());
  useEffect(() => onSoundChange(setOn), []);

  function toggle() {
    if (on) {
      stopNarration();
      setSoundOn(code, false);
    } else {
      void unlockAudio();
      setSoundOn(code, true);
    }
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={toggle}
      className={`rounded-full border px-4 py-2 text-sm ${
        on ? 'border-emerald-500/50 bg-emerald-950/70 text-emerald-300' : 'border-amber-500/30 bg-stone-900/80 text-stone-300'
      }`}
    >
      {on ? '🔊 Sonido activado' : '🔇 Sonido desactivado'}
    </button>
  );
}
