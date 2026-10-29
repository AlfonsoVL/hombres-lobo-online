// Foto con la cámara frontal. Sin permiso de cámara se usan las iniciales.
import { useEffect, useRef, useState } from 'react';
import { captureSquarePhoto, INITIALS_COLORS } from '../lib/foto/foto';
import Avatar from './Avatar';
import { Button } from './ui';

interface Props {
  name: string;
  photo: string | null;
  onChange: (photo: string | null) => void;
  /** Color elegido para el fondo de las iniciales (sin foto). */
  color: string | null;
  onColor: (color: string | null) => void;
}

type State = 'idle' | 'starting' | 'live' | 'denied';

export default function Camera({ name, photo, onChange, color, onColor }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<State>('idle');

  function stop() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  useEffect(() => stop, []);

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) return setState('denied');
    setState('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      setState('live');
      // El vídeo se monta al pasar a 'live'.
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch {
      setState('denied');
    }
  }

  function take() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    onChange(captureSquarePhoto(video, video.videoWidth, video.videoHeight));
    stop();
    setState('idle');
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="self-start text-sm font-semibold text-stone-300">Tu foto (opcional)</p>
      <div className="relative">
        {state === 'live' ? (
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-36 w-36 -scale-x-100 rounded-full bg-stone-800 object-cover ring-2 ring-amber-500/80 ring-offset-2 ring-offset-stone-950"
          />
        ) : (
          <Avatar
            id={name || 'sin-nombre'}
            name={name || '?'}
            photo={photo ?? undefined}
            color={color ?? undefined}
            size={136}
            ring
          />
        )}
        {state !== 'live' && (
          <button
            type="button"
            aria-label={photo ? 'Repetir foto' : 'Hazte una foto'}
            disabled={state === 'starting'}
            onClick={() => void start()}
            className="absolute -bottom-1 -right-1 flex h-11 w-11 items-center justify-center rounded-full border-2 border-stone-950 bg-stone-800 text-xl shadow-lg"
          >
            📷
          </button>
        )}
      </div>

      {state === 'live' ? (
        <Button type="button" variant="small" onClick={take}>
          📸 Hacer foto
        </Button>
      ) : (
        <Button
          type="button"
          variant="secondary"
          className="!w-auto !py-1.5 text-sm"
          disabled={state === 'starting'}
          onClick={() => void start()}
        >
          {photo ? 'Repetir foto' : state === 'starting' ? 'Abriendo cámara…' : 'Hazte una foto'}
        </Button>
      )}

      {!photo && state !== 'live' && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs text-stone-400">Sin foto, elige el color de fondo de tus iniciales:</p>
          <div className="flex flex-wrap justify-center gap-2" role="radiogroup" aria-label="Color de las iniciales">
            {INITIALS_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                aria-label={`Color ${c}`}
                onClick={() => onColor(color === c ? null : c)}
                style={{ backgroundColor: c }}
                className={`h-8 w-8 rounded-full border-2 transition ${
                  color === c ? 'scale-110 border-amber-300 shadow-[var(--brillo)]' : 'border-stone-700'
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {state === 'denied' && (
        <p className="text-center text-sm text-stone-400">
          No hay permiso para usar la cámara. Se usará un avatar con tus iniciales.
        </p>
      )}
      {photo && state !== 'live' && (
        <button type="button" className="text-sm text-stone-400 underline" onClick={() => onChange(null)}>
          Quitar foto y usar iniciales
        </button>
      )}
      <p className="text-center text-xs text-stone-500">
        La foto solo se envía a los móviles de esta partida y no se guarda en ningún servidor.
      </p>
    </div>
  );
}
