// Guía narrada de cómo funcionan las rondas en la app: audio y texto.
import { useEffect, useRef, useState } from 'react';
import { narrateLong, onNarrating, stopNarration } from '../lib/audio/narrate';
import type { Theme } from '../lib/tematicas';

/** `collapsed`: el texto queda plegado bajo «Leer el texto». */
export default function RoundsGuide({ theme, collapsed = false }: { theme: Theme; collapsed?: boolean }) {
  const [playing, setPlaying] = useState(false);
  // La narración es compartida: solo cuenta como «sonando» si la empezó este botón.
  const [mine, setMine] = useState(false);
  const mineRef = useRef(false);
  useEffect(
    () =>
      onNarrating((value) => {
        setPlaying(value);
        if (!value) setMine((mineRef.current = false));
      }),
    [],
  );
  // Al cerrar la ayuda o salir de la sala, se corta la guía (y solo la guía).
  useEffect(() => () => void (mineRef.current && stopNarration()), []);

  const { texto, audio } = theme.guia_rondas;
  const on = playing && mine;
  function toggle() {
    if (on) return stopNarration();
    void narrateLong(audio, texto);
    setMine((mineRef.current = true));
  }

  const paragraphs = (
    <div className="flex flex-col gap-2 text-stone-300">
      {texto.map((p) => (
        <p key={p}>{p}</p>
      ))}
    </div>
  );

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-stone-950/70 p-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={on ? 'Parar la explicación' : 'Escuchar cómo funcionan las rondas'}
          onClick={toggle}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-amber-400 text-lg text-amber-300"
        >
          {on ? '❚❚' : '▶'}
        </button>
        <div className="flex flex-col">
          <h2 className="text-lg font-semibold">Cómo funcionan las rondas</h2>
          <p className="text-sm text-stone-400">
            {on ? 'Escuchando…' : 'Escúchalo en voz alta antes de empezar. Dura unos tres minutos.'}
          </p>
        </div>
      </div>
      {collapsed ? (
        <details>
          <summary className="cursor-pointer text-sm text-stone-400">Leer el texto</summary>
          <div className="mt-2">{paragraphs}</div>
        </details>
      ) : (
        paragraphs
      )}
    </section>
  );
}
