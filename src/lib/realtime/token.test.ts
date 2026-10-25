import { describe, expect, it } from 'vitest';
import { isNewer } from './channel';
import { loadToken, newToken, saveToken } from './token';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
}

describe('token del jugador', () => {
  it('genera tokens aleatorios de 64 caracteres', () => {
    const a = newToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(newToken()).not.toBe(a);
  });

  it('guarda un token por sala, sin distinguir mayúsculas en el código', () => {
    const storage = new MemoryStorage() as unknown as Storage;
    saveToken('abc234', 't1', storage);
    expect(loadToken('ABC234', storage)).toBe('t1');
    expect(loadToken('ZZZ999', storage)).toBeNull();
  });

  it('sigue funcionando en memoria si localStorage falla', () => {
    const broken = { getItem: () => { throw new Error(); }, setItem: () => { throw new Error(); } } as unknown as Storage;
    saveToken('QWE234', 't2', broken);
    expect(loadToken('QWE234', broken)).toBe('t2');
  });
});

describe('eventos', () => {
  it('descarta eventos repetidos o atrasados', () => {
    expect(isNewer({ version: 3 }, 2)).toBe(true);
    expect(isNewer({ version: 2 }, 2)).toBe(false);
    expect(isNewer({ version: 1 }, 2)).toBe(false);
  });
});
