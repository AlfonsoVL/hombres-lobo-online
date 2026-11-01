import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_VOLUME, DUCKING, clampVolume, getAmbientVolume, isAmbientOn, loadAmbient, setAmbientOn, setAmbientVolume, targetGain } from './ambiente';

describe('sonido ambiente', () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
  });

  it('apagado y con el volumen por defecto la primera vez', () => {
    expect(loadAmbient()).toEqual({ on: false, volume: DEFAULT_VOLUME });
  });

  it('recuerda si está activado y el volumen', () => {
    setAmbientOn(true);
    setAmbientVolume(0.8);
    expect(loadAmbient()).toEqual({ on: true, volume: 0.8 });
    setAmbientOn(false);
    expect(loadAmbient().on).toBe(false);
    expect(isAmbientOn()).toBe(false);
    expect(getAmbientVolume()).toBe(0.8);
  });

  it('limita el volumen entre 0 y 1', () => {
    expect(clampVolume(2)).toBe(1);
    expect(clampVolume(-1)).toBe(0);
    expect(clampVolume(Number.NaN)).toBe(DEFAULT_VOLUME);
  });

  it('baja el ambiente mientras habla el narrador', () => {
    expect(targetGain(1, false)).toBe(1);
    expect(targetGain(1, true)).toBe(DUCKING);
    expect(targetGain(0.5, false)).toBe(0.25);
    expect(targetGain(0, true)).toBe(0);
  });

  it('funciona sin localStorage', () => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    expect(loadAmbient().on).toBe(false);
    setAmbientOn(true);
    expect(isAmbientOn()).toBe(true);
  });
});
