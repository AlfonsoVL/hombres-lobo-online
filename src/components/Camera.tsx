// Foto con la cámara frontal. Sin permiso de cámara se usan las iniciales.
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { captureSquarePhoto, fileToSquarePhoto, INITIALS_COLORS } from '../lib/foto/foto';
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

/**
 * 'native': no hay cámara en vivo (Safari iOS sin permiso, navegador dentro
 * de otra app…). Se usa la cámara del sistema con <input type="file" capture>.
 */
type State = 'idle' | 'starting' | 'live' | 'native';

/** Si en este tiempo el vídeo no da imagen, se pasa a la cámara del sistema. */
const LIVE_TIMEOUT_MS = 5000;

export default function Camera({ name, photo, onChange, color, onColor }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState<string | null>(null);

  function stop() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  useEffect(() => stop, []);

  // El <video> solo existe en 'live'. El stream se conecta aquí, ya montado,
  // y no en un requestAnimationFrame: en Safari iOS el rAF podía llegar antes
  // de que React montara el vídeo y la cámara se quedaba en negro.
  useEffect(() => {
    if (state !== 'live') return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    // Safari iOS solo reproduce sin gesto si el vídeo está silenciado y en
    // línea; React no siempre pone estos atributos en el HTML.
    video.muted = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.srcObject = stream;
    video.play().catch(() => undefined);
    const timer = window.setTimeout(() => {
      if (!video.videoWidth) fallbackToNative();
    }, LIVE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  function fallbackToNative() {
    stop();
    setState('native');
  }

  function openNative() {
    setError(null);
    fileRef.current?.click();
  }

  function openGallery() {
    setError(null);
    galleryRef.current?.click();
  }

  async function start() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      // Sin cámara en vivo: se abre directamente la del sistema, aún dentro
      // del toque del usuario (iOS no deja abrirla fuera de un gesto).
      setState('native');
      openNative();
      return;
    }
    setState('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      setState('live');
    } catch {
      fallbackToNative();
    }
  }

  function take() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    onChange(captureSquarePhoto(video, video.videoWidth, video.videoHeight));
    stop();
    setState('idle');
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      // Se queda en 'native' para que «Repetir foto» vuelva a la cámara del sistema.
      onChange(await fileToSquarePhoto(file));
    } catch {
      setError('No se pudo usar esa foto. Prueba con otra.');
    }
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
            onClick={() => (state === 'native' ? openNative() : void start())}
            className="absolute -bottom-1 -right-1 flex h-11 w-11 items-center justify-center rounded-full border-2 border-stone-950 bg-stone-800 text-xl shadow-lg"
          >
            📷
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={(e) => void onFile(e)}
      />
      {/* Sin «capture»: el móvil ofrece elegir una foto de la galería. */}
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void onFile(e)}
      />

      {state === 'live' ? (
        <Button type="button" variant="small" onClick={take}>
          📸 Hacer foto
        </Button>
      ) : state === 'native' ? (
        <Button type="button" variant="secondary" className="!w-auto !py-1.5 text-sm" onClick={openNative}>
          {photo ? 'Repetir foto' : 'Abrir la cámara'}
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

      {state !== 'live' && (
        <Button
          type="button"
          variant="secondary"
          className="!w-auto !py-1.5 text-sm"
          disabled={state === 'starting'}
          onClick={openGallery}
        >
          🖼️ Subir de la galería
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

      {state === 'native' && !photo && (
        <p className="text-center text-sm text-stone-400">
          Este navegador no deja ver la cámara aquí. Pulsa «Abrir la cámara» para hacerte la foto con la del
          móvil, súbela de la galería o deja tus iniciales.
        </p>
      )}
      {error && <p className="text-center text-sm text-red-400">{error}</p>}
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
