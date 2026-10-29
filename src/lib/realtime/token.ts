// Token secreto del jugador. Se genera en el navegador, se guarda en
// localStorage por sala y nunca se muestra en la UI.

const KEY_PREFIX = 'lobos:token:';

// Respaldo en memoria si localStorage no está disponible (modo privado, etc.).
const memory = new Map<string, string>();

export function newToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function loadToken(roomCode: string, storage: Storage | undefined = safeStorage()): string | null {
  const key = KEY_PREFIX + roomCode.toUpperCase();
  try {
    const value = storage?.getItem(key);
    if (value) return value;
  } catch {
    // Sin acceso a localStorage: usamos la memoria.
  }
  return memory.get(key) ?? null;
}

export function saveToken(roomCode: string, token: string, storage: Storage | undefined = safeStorage()): void {
  const key = KEY_PREFIX + roomCode.toUpperCase();
  memory.set(key, token);
  try {
    storage?.setItem(key, token);
  } catch {
    // Sin localStorage el jugador no podrá reconectar tras recargar.
  }
}

export function clearToken(roomCode: string, storage: Storage | undefined = safeStorage()): void {
  const key = KEY_PREFIX + roomCode.toUpperCase();
  memory.delete(key);
  try {
    storage?.removeItem(key);
  } catch {
    // Sin localStorage no hay nada más que borrar.
  }
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
