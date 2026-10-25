import { describe, expect, it } from 'vitest';
import { THEMES } from '../tematicas';
import { assertNoRoleData, type GameEvent } from './events';
import { playersWith } from './testUtils';
import { myRoleView } from './visibility';

const theme = THEMES.castronegro;
const players = playersWith(['werewolf', 'werewolf', 'seer', 'witch', 'villager', 'villager']);

describe('ver mi rol', () => {
  it('un bueno solo ve su propia ficha', () => {
    const view = myRoleView(theme, players, 'p3');
    expect(view.card.id).toBe('seer');
    expect(view.badTeammates).toBeUndefined();
    // La vista no contiene ningún otro rol ni a otros jugadores.
    const text = JSON.stringify(view);
    expect(text).not.toMatch(/werewolf|witch|villager|p1|p2|p4/);
  });

  it('un malo ve su ficha y a sus compañeros, pero no sus roles concretos ni los de otros', () => {
    const view = myRoleView(theme, players, 'p1');
    expect(view.card.id).toBe('werewolf');
    expect(view.badTeammates).toEqual([{ id: 'p2', name: 'Jugador 2' }]);
    expect(JSON.stringify(view)).not.toMatch(/seer|witch|villager/);
  });
});

describe('eventos de Broadcast', () => {
  it('los eventos normales no llevan roles', () => {
    const events: GameEvent[] = [
      { type: 'jugador_unido', version: 1, id: 'p1', name: 'Ana' },
      { type: 'partida_iniciada', version: 2 },
      { type: 'fase_cambiada', version: 3, phase: 'night', round: 1, nightStep: 'bad' },
      { type: 'jugador_eliminado', version: 4, id: 'p2', revealedRole: 'seer' },
    ];
    for (const e of events) expect(() => assertNoRoleData(theme, e)).not.toThrow();
  });

  it('detecta una ficha de rol colada en un evento', () => {
    const leaky = { type: 'partida_iniciada', version: 2, role: 'werewolf' } as unknown as GameEvent;
    expect(() => assertNoRoleData(theme, leaky)).toThrow(/werewolf/);
  });
});
