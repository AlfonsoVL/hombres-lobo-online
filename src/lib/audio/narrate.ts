// Reproduce la narración: el MP3 si existe y, si no, la voz del navegador.
import type { Spoken } from '../game/narration';

let queueId = 0;

function playMp3(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const audio = new Audio(src);
    audio.onended = () => resolve(true);
    audio.onerror = () => resolve(false);
    audio.play().catch(() => resolve(false));
  });
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

/** Narra las frases en orden. Una narración nueva corta la anterior. */
export async function narrate(lines: Spoken[]): Promise<void> {
  const id = ++queueId;
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  for (const line of lines) {
    if (id !== queueId) return;
    const played = line.audio ? await playMp3(line.audio) : false;
    if (!played && id === queueId) await speak(line.texto);
  }
}
