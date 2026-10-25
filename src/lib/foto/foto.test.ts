import { describe, expect, it } from 'vitest';
import { MAX_PHOTO_CHARS, initials, initialsColor, isSendablePhoto } from './foto';

describe('avatar con iniciales', () => {
  it('usa la primera letra de las dos primeras palabras', () => {
    expect(initials('Ana María López')).toBe('AM');
    expect(initials('  alfonso ')).toBe('A');
    expect(initials('Ñito')).toBe('Ñ');
    expect(initials('')).toBe('?');
  });

  it('da siempre el mismo color al mismo jugador', () => {
    expect(initialsColor('p1')).toBe(initialsColor('p1'));
  });
});

describe('fotos por Broadcast', () => {
  it('solo envía JPEG pequeños', () => {
    expect(isSendablePhoto('data:image/jpeg;base64,AAAA')).toBe(true);
    expect(isSendablePhoto('data:image/png;base64,AAAA')).toBe(false);
    expect(isSendablePhoto('data:image/jpeg;base64,' + 'A'.repeat(MAX_PHOTO_CHARS))).toBe(false);
  });
});
