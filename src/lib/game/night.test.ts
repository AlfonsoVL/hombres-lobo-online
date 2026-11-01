import { describe, expect, it } from 'vitest';
import { THEMES } from '../tematicas';
import { nightSteps, powerButton, shouldAutoAdvanceNight } from './night';
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

describe('la noche avanza sola', () => {
  it('al acabarse la cuenta atrás, sea cual sea el turno', () => {
    expect(shouldAutoAdvanceNight('protect', false, 0)).toBe(true);
    expect(shouldAutoAdvanceNight('investigate', false, 0)).toBe(true);
    expect(shouldAutoAdvanceNight('bad', false, 0)).toBe(true);
  });

  it('cuando el rol activo ya ha actuado', () => {
    expect(shouldAutoAdvanceNight('bad', true, 20)).toBe(true);
    expect(shouldAutoAdvanceNight('link', true, 20)).toBe(true);
    expect(shouldAutoAdvanceNight('swap', true, null)).toBe(true);
  });

  it('la Vidente lo confirma ella, y nada avanza mientras se espera', () => {
    expect(shouldAutoAdvanceNight('investigate', true, 20)).toBe(false);
    expect(shouldAutoAdvanceNight('protect', false, 20)).toBe(false);
    expect(shouldAutoAdvanceNight(null, true, 0)).toBe(false);
  });
});

describe('lobos especiales', () => {
  // p1 Lobo Feroz, p2 Lobo Infecto, p3 Lobo Blanco, p4 Gran Lobo Malvado, p5 vidente, p6 bruja, p7 aldeano
  const wolves = playersWith(['fierce_wolf', 'infect_wolf', 'white_wolf', 'big_bad_wolf', 'seer', 'witch', 'villager']);

  it('tienen turno propio después de la manada; el Blanco solo las noches pares', () => {
    expect(nightSteps(theme, wolves, 1)).toEqual(['bad', 'infect', 'fierce', 'investigate', 'protect']);
    expect(nightSteps(theme, wolves, 2)).toEqual(['bad', 'infect', 'fierce', 'white', 'investigate', 'protect']);
  });

  it('el Feroz pierde su turno en cuanto muere un lobo', () => {
    const oneDead = playersWith(['fierce_wolf', 'werewolf', 'seer', 'villager'], [2]);
    expect(nightSteps(theme, oneDead, 2)).toEqual(['bad', 'investigate']);
  });

  it('todos votan con la manada y los especiales esperan su turno', () => {
    for (const id of ['p1', 'p2', 'p3', 'p4']) expect(powerButton(theme, wolves, id, 2, 'bad')).toBe('act');
    expect(powerButton(theme, wolves, 'p1', 2, 'infect')).toBe('wait');
    expect(powerButton(theme, wolves, 'p1', 2, 'fierce')).toBe('act');
    expect(powerButton(theme, wolves, 'p4', 2, 'infect')).toBe('sleep');
    expect(powerButton(theme, wolves, 'p3', 1, 'infect')).toBe('sleep');
    expect(powerButton(theme, wolves, 'p3', 2, 'infect')).toBe('wait');
  });
});
