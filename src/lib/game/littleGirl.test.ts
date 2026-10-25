import { describe, expect, it } from 'vitest';
import { THEMES } from '../tematicas';
import { spy } from './littleGirl';
import { fixedRng, playersWith, seededRng } from './testUtils';

const theme = THEMES.castronegro;
// p1 lobo, p2 niña, p3 vidente, p4 aldeano, p5 aldeano (muerto)
const players = playersWith(['werewolf', 'little_girl', 'seer', 'villager', 'villager'], [5]);

describe('Niña', () => {
  it('la probabilidad de ser descubierta es del 50 %', () => {
    const rng = seededRng(42);
    const tries = 20000;
    let discovered = 0;
    for (let i = 0; i < tries; i++) {
      const r = spy(theme, players, 2, null, rng);
      if (r.ok && r.discovered) discovered++;
    }
    expect(discovered / tries).toBeGreaterThan(0.48);
    expect(discovered / tries).toBeLessThan(0.52);
  });

  it('con el dado por debajo de 0,5 la descubren', () => {
    expect(spy(theme, players, 2, null, fixedRng(0.49))).toEqual({ ok: true, discovered: true });
  });

  it('si no la descubren ve el rol de un malo o de un bueno sin rol vivo', () => {
    const rng = seededRng(7);
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const r = spy(theme, players, 2, null, rng);
      if (r.ok && !r.discovered) {
        expect(['p1', 'p4']).toContain(r.seen.playerId);
        expect(r.seen.role).toBe(players.find((p) => p.id === r.seen.playerId)!.role);
        seen.add(r.seen.playerId);
      }
    }
    expect(seen).toEqual(new Set(['p1', 'p4']));
  });

  it('no puede espiar dos noches seguidas', () => {
    expect(spy(theme, players, 3, 2)).toEqual({
      ok: false,
      error: 'No puedes espiar dos noches seguidas.',
    });
    expect(spy(theme, players, 4, 2).ok).toBe(true);
  });
});
