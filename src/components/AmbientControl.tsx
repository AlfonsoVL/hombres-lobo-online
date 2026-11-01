// Interruptor y volumen del sonido ambiente, independientes de la narración.
import { useEffect, useState } from 'react';
import { getAmbientVolume, isAmbientOn, onAmbientChange, setAmbientOn, setAmbientVolume } from '../lib/audio/ambiente';

export default function AmbientControl() {
  const [on, setOn] = useState(isAmbientOn());
  const [volume, setVolume] = useState(getAmbientVolume());
  useEffect(
    () =>
      onAmbientChange(() => {
        setOn(isAmbientOn());
        setVolume(getAmbientVolume());
      }),
    [],
  );

  return (
    <div
      className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm ${
        on ? 'border-emerald-500/50 bg-emerald-950/70 text-emerald-300' : 'border-amber-500/30 bg-stone-900/80 text-stone-300'
      }`}
    >
      <button type="button" role="switch" aria-checked={on} onClick={() => setAmbientOn(!on)}>
        {on ? '🌲 Ambiente' : '🌲 Ambiente apagado'}
      </button>
      {on && (
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(volume * 100)}
          onChange={(e) => setAmbientVolume(Number(e.target.value) / 100)}
          aria-label="Volumen del ambiente"
          className="w-24 accent-emerald-400"
        />
      )}
    </div>
  );
}
