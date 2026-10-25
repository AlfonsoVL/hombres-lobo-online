import { describe, expect, it } from 'vitest';
import { THEMES } from '../tematicas';
import { chooseThiefCard, thiefOptions } from './thief';

const theme = THEMES.castronegro;

describe('Ladrón', () => {
  it('si los dos roles extra son malos, se convierte en malo', () => {
    const cards = ['werewolf', 'werewolf'];
    expect(thiefOptions(theme, cards).mustBeBad).toBe(true);
    expect(chooseThiefCard(theme, cards, 'werewolf')).toEqual({ ok: true, value: 'werewolf' });
    expect(chooseThiefCard(theme, cards, 'villager').ok).toBe(false);
  });

  it('si solo uno es malo, puede elegir cualquiera', () => {
    const cards = ['werewolf', 'villager'];
    expect(thiefOptions(theme, cards).mustBeBad).toBe(false);
    expect(chooseThiefCard(theme, cards, 'werewolf')).toEqual({ ok: true, value: 'werewolf' });
    expect(chooseThiefCard(theme, cards, 'villager')).toEqual({ ok: true, value: 'villager' });
  });

  it('solo puede elegir entre las cartas sin repartir', () => {
    expect(chooseThiefCard(theme, ['villager', 'villager'], 'seer').ok).toBe(false);
  });
});
