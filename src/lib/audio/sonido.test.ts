import { beforeEach, describe, expect, it } from 'vitest';
import { isSoundOn, loadSound, setSoundOn } from './sonido';

describe('preferencia de sonido', () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
  });

  it('activado por defecto para el creador y desactivado para el resto', () => {
    expect(loadSound('ABCD', true)).toBe(true);
    expect(loadSound('ABCD', false)).toBe(false);
  });

  it('recuerda la elección de cada sala', () => {
    setSoundOn('ABCD', true);
    expect(loadSound('ABCD', false)).toBe(true);
    setSoundOn('ABCD', false);
    expect(loadSound('ABCD', true)).toBe(false);
    expect(loadSound('WXYZ', false)).toBe(false);
    expect(isSoundOn()).toBe(false);
  });

  it('funciona sin localStorage', () => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    expect(loadSound('ABCD', true)).toBe(true);
    setSoundOn('ABCD', false);
    expect(isSoundOn()).toBe(false);
  });
});
