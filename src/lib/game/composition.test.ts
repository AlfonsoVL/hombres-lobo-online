import { describe, expect, it } from 'vitest';
import { THEMES } from '../tematicas';
import { classicComposition, compositionSummary, customComposition } from './composition';

const castronegro = THEMES.castronegro;
const alien = THEMES.alien;

// Tabla de la especificación con un solo rol especial de cada tipo:
// [jugadores, malos, investiga, salva, dispara, vincula, buenos sin rol]
const TABLE = [
  [6, 2, 1, 1, 0, 0, 2],
  [8, 2, 1, 1, 1, 0, 3],
  [10, 3, 1, 1, 1, 1, 3],
  [12, 3, 1, 1, 1, 1, 5],
  [14, 4, 1, 1, 1, 1, 6],
  [16, 4, 1, 1, 1, 1, 8],
  [18, 5, 1, 1, 1, 1, 9],
  [20, 5, 1, 1, 1, 1, 11],
  [22, 6, 1, 1, 1, 1, 12],
  [24, 6, 1, 1, 1, 1, 14],
] as const;

function expectedSpecials(inv: number, prot: number, shoot: number, link: number, ids: string[]) {
  return [inv, prot, shoot, link].flatMap((n, i) => (n ? [ids[i]] : []));
}

describe('modo clásico', () => {
  it.each(TABLE)('con %i jugadores coincide con la tabla', (players, bad, inv, prot, shoot, link, plain) => {
    const r = classicComposition(castronegro, players);
    expect(r).toEqual({
      ok: true,
      value: {
        players,
        bad,
        specials: expectedSpecials(inv, prot, shoot, link, ['seer', 'witch', 'hunter', 'cupid']),
        plain,
      },
    });
  });

  it('usa los roles equivalentes en Alien', () => {
    const r = classicComposition(alien, 10);
    expect(r.ok && r.value.specials).toEqual(['scientist', 'medic', 'marine', 'android']);
  });

  it.each(TABLE.slice(0, -1))('con %i + 1 jugadores añade un bueno sin rol', (players, bad, _i, _p, _s, _l, plain) => {
    const r = classicComposition(castronegro, players + 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.players).toBe(players + 1);
    expect(r.value.bad).toBe(bad);
    expect(r.value.plain).toBe(plain + 1);
  });

  it('cada rol especial sale una sola vez', () => {
    for (let n = 6; n <= 24; n++) {
      const r = classicComposition(castronegro, n);
      if (!r.ok) throw new Error(r.error);
      expect(new Set(r.value.specials).size).toBe(r.value.specials.length);
    }
  });

  it('rechaza menos de 6 o más de 24 jugadores', () => {
    expect(classicComposition(castronegro, 5).ok).toBe(false);
    expect(classicComposition(castronegro, 25).ok).toBe(false);
  });
});

describe('modo personalizado', () => {
  it('rechaza una configuración sin malos', () => {
    expect(customComposition(castronegro, 8, 0, ['seer'])).toEqual({
      ok: false,
      error: 'Tiene que haber al menos 1 malo.',
    });
  });

  it('rechaza más roles que jugadores con un mensaje claro', () => {
    expect(customComposition(castronegro, 6, 4, ['seer', 'witch', 'hunter'])).toEqual({
      ok: false,
      error: 'Con 6 jugadores, 4 malos y 3 roles especiales no caben. Reduce alguno.',
    });
  });

  it('rechaza roles repetidos', () => {
    const r = customComposition(castronegro, 10, 2, ['seer', 'seer']);
    expect(r.ok).toBe(false);
  });

  it('rechaza roles que no son especiales o de otra temática', () => {
    expect(customComposition(castronegro, 10, 2, ['werewolf']).ok).toBe(false);
    expect(customComposition(castronegro, 10, 2, ['scientist']).ok).toBe(false);
  });

  it('calcula los buenos sin rol', () => {
    const r = customComposition(castronegro, 11, 3, ['seer', 'little_girl', 'thief']);
    expect(r).toEqual({
      ok: true,
      value: { players: 11, bad: 3, specials: ['seer', 'little_girl', 'thief'], plain: 5 },
    });
    const exact = customComposition(castronegro, 6, 3, ['seer', 'witch', 'hunter']);
    expect(exact.ok && exact.value.plain).toBe(0);
  });

  it('genera el resumen que confirma el creador', () => {
    const r = customComposition(castronegro, 8, 2, ['seer', 'witch']);
    if (!r.ok) throw new Error(r.error);
    expect(compositionSummary(castronegro, r.value)).toBe(
      'Lobos: 2. Roles especiales: Vidente, Bruja. Aldeanos: 4.',
    );
  });
});
