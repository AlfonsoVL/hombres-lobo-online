import { describe, expect, it } from 'vitest';
import { THEMES } from '../tematicas';
import { playersWith } from './testUtils';
import { checkVictory } from './victory';

const theme = THEMES.castronegro;

describe('victoria', () => {
  it('la partida sigue si hay más buenos que malos vivos', () => {
    expect(checkVictory(theme, playersWith(['werewolf', 'seer', 'villager']), null)).toBeNull();
  });

  it('ganan los malos al igualar en número a los vivos no malos', () => {
    const p = playersWith(['werewolf', 'seer', 'villager'], [3]);
    expect(checkVictory(theme, p, null)).toBe('bad');
  });

  it('ganan los malos al superar en número a los vivos no malos', () => {
    const p = playersWith(['werewolf', 'werewolf', 'seer', 'villager'], [4]);
    expect(checkVictory(theme, p, null)).toBe('bad');
  });

  it('ganan los buenos cuando no quedan malos vivos', () => {
    const p = playersWith(['werewolf', 'werewolf', 'seer', 'villager'], [1, 2]);
    expect(checkVictory(theme, p, null)).toBe('good');
  });

  it('ganan los Enamorados si ellos y Cupido son los últimos vivos', () => {
    // p1 lobo enamorado de p2 aldeano; p3 Cupido.
    const p = playersWith(['werewolf', 'villager', 'cupid', 'seer'], [4]);
    expect(checkVictory(theme, p, ['p1', 'p2'])).toBe('lovers');
  });

  it('ganan los Enamorados si son los dos únicos vivos', () => {
    const p = playersWith(['werewolf', 'villager', 'cupid', 'seer'], [3, 4]);
    expect(checkVictory(theme, p, ['p1', 'p2'])).toBe('lovers');
  });

  it('no ganan los Enamorados si queda alguien más vivo', () => {
    const p = playersWith(['werewolf', 'villager', 'cupid', 'seer', 'villager']);
    expect(checkVictory(theme, p, ['p1', 'p2'])).toBeNull();
  });

  it('no ganan los Enamorados si uno ha muerto', () => {
    const p = playersWith(['werewolf', 'villager', 'cupid'], [2]);
    expect(checkVictory(theme, p, ['p1', 'p2'])).toBe('bad');
  });

  it('funciona igual con el Androide en Alien', () => {
    const p = playersWith(['xenomorph', 'crew_member', 'android', 'scientist'], [4]);
    expect(checkVictory(THEMES.alien, p, ['p1', 'p2'])).toBe('lovers');
  });
});
