import { describe, expect, it } from 'vitest';
import { THEMES } from '../tematicas';
import { classicComposition, customComposition } from './composition';
import { dealRoles } from './deal';
import { seededRng } from './testUtils';

const theme = THEMES.castronegro;
const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

describe('reparto', () => {
  it('cada jugador recibe exactamente un rol y se respeta la composición', () => {
    for (let n = 6; n <= 24; n++) {
      const c = classicComposition(theme, n);
      if (!c.ok) throw new Error(c.error);
      const { roles, undealt } = dealRoles(theme, c.value, ids(n), seededRng(n));
      expect(roles.size).toBe(n);
      expect([...roles.keys()].sort()).toEqual(ids(n).sort());
      expect(undealt).toEqual([]);
      const dealt = [...roles.values()];
      expect(dealt.filter((r) => r === 'werewolf')).toHaveLength(c.value.bad);
      expect(dealt.filter((r) => r === 'villager')).toHaveLength(c.value.plain);
      for (const s of c.value.specials) expect(dealt.filter((r) => r === s)).toHaveLength(1);
    }
  });

  it('con Ladrón reparte siempre el Ladrón y deja 2 cartas sin repartir', () => {
    const c = customComposition(theme, 6, 2, ['thief']);
    if (!c.ok) throw new Error(c.error);
    for (let seed = 1; seed <= 200; seed++) {
      const { roles, undealt } = dealRoles(theme, c.value, ids(6), seededRng(seed));
      expect([...roles.values()].filter((r) => r === 'thief')).toHaveLength(1);
      expect(undealt).toHaveLength(2);
      expect([...roles.values(), ...undealt].sort()).toEqual(
        ['thief', 'villager', 'villager', 'villager', 'villager', 'villager', 'werewolf', 'werewolf'].sort(),
      );
    }
  });

  it('rechaza un número de jugadores distinto al de la composición', () => {
    const c = classicComposition(theme, 8);
    if (!c.ok) throw new Error(c.error);
    expect(() => dealRoles(theme, c.value, ids(7))).toThrow();
  });
});
