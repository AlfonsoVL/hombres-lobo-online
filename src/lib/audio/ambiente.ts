// Sonido ambiente de la partida, independiente de la narración. Cada móvil
// decide si lo oye y a qué volumen, y la elección se recuerda en el móvil.
//
// El volumen va por un GainNode de Web Audio: en iOS el volumen de un
// <audio> es de solo lectura y siempre suena al máximo. El MP3 se reproduce
// en streaming desde un <audio> (decodificar 25 minutos en memoria sería
// demasiado para un móvil) conectado al AudioContext con
// createMediaElementSource. Mientras habla el narrador, el ambiente baja.
import { onNarrating } from './narrate';

export const AMBIENT_SRC = '/audio/ambiente.mp3';
export const DEFAULT_VOLUME = 0.35;
/** Fracción del volumen que queda mientras narra el narrador. */
export const DUCKING = 0.4;

const KEY_ON = 'ambiente:on';
const KEY_VOLUME = 'ambiente:volumen';

let on = false;
let volume = DEFAULT_VOLUME;
let narrating = false;
const listeners = new Set<() => void>();

function storage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function save(key: string, value: string) {
  try {
    storage()?.setItem(key, value);
  } catch {
    // Sin localStorage se recuerda solo mientras la página esté abierta.
  }
}

export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_VOLUME;
  return Math.min(1, Math.max(0, value));
}

/** Ganancia que se aplica: el volumen elegido, más bajo si narra el narrador. */
export function targetGain(value: number, isNarrating: boolean): number {
  const v = clampVolume(value);
  // Curva cuadrática: el oído percibe el volumen de forma logarítmica y así
  // el control responde de forma más natural en los valores bajos.
  return v * v * (isNarrating ? DUCKING : 1);
}

/** Carga la preferencia guardada. Por defecto, apagado. */
export function loadAmbient(): { on: boolean; volume: number } {
  let savedOn: string | null | undefined = null;
  let savedVolume: string | null | undefined = null;
  try {
    savedOn = storage()?.getItem(KEY_ON);
    savedVolume = storage()?.getItem(KEY_VOLUME);
  } catch {
    // Valores por defecto.
  }
  on = savedOn === '1';
  volume = savedVolume === null || savedVolume === undefined ? DEFAULT_VOLUME : clampVolume(Number(savedVolume));
  notify();
  return { on, volume };
}

export function isAmbientOn(): boolean {
  return on;
}

export function getAmbientVolume(): number {
  return volume;
}

export function onAmbientChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  listeners.forEach((l) => l());
}

/** Enciende o apaga el ambiente. Al encender, llamar desde un toque del usuario. */
export function setAmbientOn(value: boolean): void {
  on = value;
  save(KEY_ON, value ? '1' : '0');
  if (value) startAmbient();
  else stopAmbient();
  notify();
}

export function setAmbientVolume(value: number): void {
  volume = clampVolume(value);
  save(KEY_VOLUME, String(volume));
  applyGain();
  notify();
}

// --- Reproducción (solo en el navegador) ---

let ctx: AudioContext | null = null;
let gain: GainNode | null = null;
let element: HTMLAudioElement | null = null;
let unsubscribeNarration: (() => void) | null = null;

function audioContextClass(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

function applyGain(rampSeconds = 0.3) {
  if (!ctx || !gain) return;
  const now = ctx.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(on ? targetGain(volume, narrating) : 0, now + rampSeconds);
}

function setup(): boolean {
  if (element) return true;
  const Ctx = audioContextClass();
  if (!Ctx || typeof Audio === 'undefined') return false;
  try {
    element = new Audio(AMBIENT_SRC);
    element.loop = true;
    element.preload = 'auto';
    element.setAttribute('playsinline', '');
    ctx = new Ctx();
    gain = ctx.createGain();
    gain.gain.value = 0;
    ctx.createMediaElementSource(element).connect(gain);
    gain.connect(ctx.destination);
    unsubscribeNarration = onNarrating((value) => {
      narrating = value;
      applyGain(value ? 0.4 : 1.5);
    });
    return true;
  } catch {
    element = null;
    ctx = null;
    gain = null;
    return false;
  }
}

/**
 * Arranca el ambiente si está activado. Los móviles solo dejan sonar tras un
 * toque, así que hay que llamarlo dentro de un manejador de toque o clic.
 */
export function startAmbient(): void {
  if (!on || !setup() || !ctx || !element) return;
  void ctx.resume().catch(() => undefined);
  if (element.paused) void element.play().catch(() => undefined);
  applyGain(1.5);
}

export function isAmbientPlaying(): boolean {
  return !!element && !element.paused;
}

export function stopAmbient(): void {
  if (!ctx || !element) return;
  applyGain(0.4);
  const el = element;
  setTimeout(() => {
    if (!on) el.pause();
  }, 450);
}

/** Libera el audio (al salir de la sala). */
export function disposeAmbient(): void {
  element?.pause();
  unsubscribeNarration?.();
  void ctx?.close().catch(() => undefined);
  element = null;
  ctx = null;
  gain = null;
  unsubscribeNarration = null;
}
