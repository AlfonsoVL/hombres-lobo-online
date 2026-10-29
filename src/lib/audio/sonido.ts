// Preferencia de sonido de cada móvil. El creador lo tiene activado por
// defecto y el resto de jugadores, desactivado. Se guarda por sala.

let on = false;
const listeners = new Set<(value: boolean) => void>();

const key = (code: string) => `sonido:${code}`;

function storage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/** Carga la preferencia guardada para la sala o la de por defecto. */
export function loadSound(code: string, isCreator: boolean): boolean {
  let saved: string | null | undefined;
  try {
    saved = storage()?.getItem(key(code));
  } catch {
    saved = null;
  }
  on = saved === null || saved === undefined ? isCreator : saved === '1';
  listeners.forEach((l) => l(on));
  return on;
}

export function isSoundOn(): boolean {
  return on;
}

export function setSoundOn(code: string, value: boolean): void {
  on = value;
  try {
    storage()?.setItem(key(code), value ? '1' : '0');
  } catch {
    // Sin localStorage se recuerda solo mientras la página esté abierta.
  }
  listeners.forEach((l) => l(on));
}

export function onSoundChange(listener: (value: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
