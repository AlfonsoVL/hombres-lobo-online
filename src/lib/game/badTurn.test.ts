import { describe, expect, it } from 'vitest';
import { getTheme } from '../tematicas';
import { badReactions, formatSeconds, reactionsFor, secondsLeft, type ReactionEntry } from './badTurn';

describe('badReactions', () => {
  it('usa el nombre del rol que investiga en cada temática', () => {
    expect(badReactions(getTheme('castronegro')).find((r) => r.id === 'seer')?.label).toMatch(/vidente/);
    expect(badReactions(getTheme('alien')).map((r) => r.id)).toEqual(['yes', 'no', 'seer', 'suspect']);
  });
});

describe('reactionsFor', () => {
  const reactions: ReactionEntry[] = [
    { voter: 'Ana', mine: false, target: 'x', reaction: 'yes' },
    { voter: 'Yo', mine: true, target: 'x', reaction: 'yes' },
    { voter: 'Bea', mine: false, target: 'x', reaction: 'seer' },
    { voter: 'Bea', mine: false, target: 'y', reaction: 'no' },
  ];

  it('agrupa por reacción las del candidato y marca la propia', () => {
    expect(reactionsFor(reactions, 'x')).toEqual([
      { reaction: 'yes', voters: ['Ana'], mine: true },
      { reaction: 'seer', voters: ['Bea'], mine: false },
    ]);
    expect(reactionsFor(reactions, 'z')).toEqual([]);
  });
});

describe('secondsLeft', () => {
  const ends = '2026-10-29T22:01:00Z';

  it('cuenta con la hora del servidor aunque el móvil vaya adelantado', () => {
    const server = '2026-10-29T22:00:00Z';
    const phoneAhead = Date.parse(server) + 5000;
    expect(secondsLeft(ends, server, phoneAhead, phoneAhead)).toBe(60);
    expect(secondsLeft(ends, server, phoneAhead, phoneAhead + 59_500)).toBe(1);
    expect(secondsLeft(ends, server, phoneAhead, phoneAhead + 61_000)).toBe(0);
  });

  it('formatea minutos y segundos', () => {
    expect(formatSeconds(60)).toBe('1:00');
    expect(formatSeconds(9)).toBe('0:09');
  });
});
