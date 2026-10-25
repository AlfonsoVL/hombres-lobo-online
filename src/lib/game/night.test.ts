import { describe, expect, it } from 'vitest';
import { THEMES } from '../tematicas';
import { nightSteps, powerButton } from './night';
import { playersWith } from './testUtils';

const theme = THEMES.castronegro;
// p1 lobo, p2 lobo, p3 vidente, p4 bruja, p5 cupido, p6 niña, p7 ladrón, p8 aldeano
const players = playersWith([
  'werewolf', 'werewolf', 'seer', 'witch', 'cupid', 'little_girl', 'thief', 'villager',
]);

describe('turnos de noche', () => {
  it('la primera noche actúan Ladrón y Cupido; después ya no', () => {
    expect(nightSteps(theme, players, 1)).toEqual(['swap', 'link', 'bad', 'investigate', 'protect']);
    expect(nightSteps(theme, players, 2)).toEqual(['bad', 'investigate', 'protect']);
  });

  it('solo incluye los roles que están en la partida', () => {
    const few = playersWith(['werewolf', 'seer', 'villager']);
    expect(nightSteps(theme, few, 1)).toEqual(['bad', 'investigate']);
  });
});

describe('botón de poder', () => {
  it('solo aparece al jugador cuyo turno es', () => {
    const button = (id: string) => powerButton(theme, players, id, 2, 'investigate');
    expect(button('p3')).toBe('act');
    expect(button('p1')).toBe('sleep');
    expect(button('p4')).toBe('wait');
    expect(button('p8')).toBe('sleep');
  });

  it('en el turno de los malos actúan los malos y la Niña', () => {
    const button = (id: string) => powerButton(theme, players, id, 2, 'bad');
    expect(button('p1')).toBe('act');
    expect(button('p2')).toBe('act');
    expect(button('p6')).toBe('act');
    expect(button('p3')).toBe('wait');
    expect(button('p8')).toBe('sleep');
  });

  it('la Niña no ve el botón si espió la noche anterior', () => {
    expect(powerButton(theme, players, 'p6', 3, 'bad', { lastSpyRound: 2 })).toBe('sleep');
    expect(powerButton(theme, players, 'p6', 3, 'bad', { lastSpyRound: 1 })).toBe('act');
  });

  it('un jugador muerto nunca ve el botón', () => {
    const dead = playersWith(['werewolf', 'werewolf', 'seer'], [3]);
    expect(powerButton(theme, dead, 'p3', 2, 'investigate')).toBe('sleep');
  });

  it('Cupido no actúa a partir de la segunda noche', () => {
    expect(powerButton(theme, players, 'p5', 1, 'link')).toBe('act');
    expect(powerButton(theme, players, 'p5', 2, 'bad')).toBe('sleep');
  });
});
