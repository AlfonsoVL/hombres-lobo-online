// Reproduce la narración: el MP3 si existe y, si no, la voz del navegador.
import type { Spoken } from '../game/narration';

let queueId = 0;
let current: HTMLAudioElement | null = null;
let playing = false;
const listeners = new Set<(playing: boolean) => void>();

function setPlaying(value: boolean) {
  playing = value;
  listeners.forEach((l) => l(value));
}

export function isNarrating(): boolean {
  return playing;
}

/** Avisa cuando la narración empieza o termina. Devuelve la función para dejar de escuchar. */
export function onNarrating(listener: (playing: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function playMp3(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const audio = new Audio(src);
    current = audio;
    audio.onended = () => resolve(true);
    audio.onerror = () => resolve(false);
    audio.onpause = () => resolve(true);
    audio.play().catch(() => resolve(false));
  });
}

/** Corta la narración en curso. */
export function stopNarration() {
  queueId++;
  current?.pause();
  current = null;
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  setPlaying(false);
}

function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-ES';
    const voice = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith('es'));
    if (voice) utterance.voice = voice;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Narra las frases en orden, con sus pausas. Una narración nueva corta la anterior. */
export async function narrate(lines: Spoken[]): Promise<void> {
  stopNarration();
  const id = queueId;
  if (!lines.length) return;
  setPlaying(true);
  for (const line of lines) {
    if (id !== queueId) return;
    const played = line.audio ? await playMp3(line.audio) : false;
    if (!played && id === queueId) await speak(line.texto);
    if (line.pausaMs && id === queueId) await wait(line.pausaMs);
  }
  if (id === queueId) setPlaying(false);
}
