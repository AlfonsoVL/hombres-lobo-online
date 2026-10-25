// Desbloqueo del audio del navegador. Los móviles solo permiten reproducir
// sonido después de un toque del usuario, así que se hace desde un botón.

let unlocked = false;
const listeners = new Set<(value: boolean) => void>();

export function isAudioUnlocked(): boolean {
  return unlocked;
}

export function onAudioUnlocked(listener: (value: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function unlockAudio(): Promise<void> {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx) {
      const ctx = new Ctx();
      // Un sonido vacío basta para que el navegador permita los siguientes.
      const source = ctx.createBufferSource();
      source.buffer = ctx.createBuffer(1, 1, 22050);
      source.connect(ctx.destination);
      source.start(0);
      await ctx.resume();
    }
    if ('speechSynthesis' in window) {
      const silent = new SpeechSynthesisUtterance(' ');
      silent.volume = 0;
      window.speechSynthesis.speak(silent);
    }
  } catch {
    // Si falla, la app seguirá mostrando los textos en pantalla.
  }
  unlocked = true;
  listeners.forEach((l) => l(true));
}
