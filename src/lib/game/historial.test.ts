import { describe, expect, it } from 'vitest';
import { getTheme } from '../tematicas';
import { chronicle, hallOfFame, winnerName, type GameHistory } from './historial';

const theme = getTheme('castronegro');

// Partida: Cupido une a Ana y Eva; los lobos atacan a Ciro y la Bruja lo cura;
// la Vidente ve al lobo; de día linchan a Bea (loba). Gana la aldea.
const history: GameHistory = {
  winner: 'good',
  players: [
    { id: 'a', name: 'Ana', alive: true, role: 'villager', initial_role: 'villager', team: 'good' },
    { id: 'b', name: 'Bea', alive: false, role: 'werewolf', initial_role: 'werewolf', team: 'bad' },
    { id: 'c', name: 'Ciro', alive: true, role: 'seer', initial_role: 'seer', team: 'good' },
    { id: 'd', name: 'Dani', alive: true, role: 'witch', initial_role: 'witch', team: 'good' },
    { id: 'e', name: 'Eva', alive: true, role: 'hunter', initial_role: 'hunter', team: 'good' },
    { id: 'f', name: 'Fer', alive: true, role: 'cupid', initial_role: 'cupid', team: 'good' },
  ],
  links: [['a', 'e']],
  night: [
    { round: 1, actor: 'f', action: 'link', target: 'a', target2: 'e' },
    { round: 1, actor: 'b', action: 'kill', target: 'c', target2: null },
    { round: 1, actor: 'c', action: 'see', target: 'b', target2: null },
    { round: 1, actor: 'd', action: 'potions', target: null, target2: 'c' },
  ],
  votes: [
    { round: 1, voter: 'a', target: 'b' },
    { round: 1, voter: 'c', target: 'b' },
    { round: 1, voter: 'b', target: 'a' },
  ],
  log: [
    { round: 1, event: 'attack', cause: null, player: 'c' },
    { round: 1, event: 'death', cause: 'lynched', player: 'b' },
  ],
};

describe('histórico de la partida', () => {
  it('cuenta la noche y el día en orden', () => {
    const r1 = chronicle(theme, history)[0]!;
    expect(r1.night).toEqual([
      '💘 Cupido (Fer) unió a Ana y Eva.',
      '🐾 Los Lobos atacaron a Ciro.',
      '🔮 Vidente (Ciro) investigó a Bea: era Lobo.',
      '🧪 Bruja (Dani) salvó a Ciro con su poción de cura.',
    ]);
    expect(r1.day).toEqual([
      '🗳 2 votos para Bea: Ana, Ciro.',
      '🗳 1 voto para Ana: Bea.',
      '⚖ La votación eliminó a Bea (Lobo).',
    ]);
  });

  it('da los premios que alguien ha ganado', () => {
    const awards = hallOfFame(theme, history);
    const byTitle = Object.fromEntries(awards.map((a) => [a.title, a]));
    expect(byTitle['Ojo que todo lo ve']!.players).toEqual(['Ciro']);
    expect(byTitle['Ángel de la guarda']!.text).toContain('salvó una vida (Ciro)');
    expect(byTitle['Olfato de sabueso']!.players).toEqual(['Ana', 'Ciro']);
    expect(byTitle['Flechazo']!.players).toEqual(['Ana', 'Eva']);
    expect(byTitle['Primera sangre']!.players).toEqual(['Bea']);
    expect(byTitle['Supervivientes']!.players).toEqual(['Ana', 'Ciro', 'Dani', 'Eva', 'Fer']);
    expect(byTitle['Manada letal']).toBeUndefined();
    expect(byTitle['Maestro del engaño']).toBeUndefined();
  });

  it('explica las muertes por amor y por disparo', () => {
    const h: GameHistory = {
      ...history,
      winner: 'good',
      night: [{ round: 1, actor: 'b', action: 'kill', target: 'a', target2: null }],
      votes: [],
      log: [
        { round: 1, event: 'attack', cause: null, player: 'a' },
        { round: 1, event: 'death', cause: 'bad', player: 'a' },
        { round: 1, event: 'death', cause: 'lover', player: 'e' },
        { round: 1, event: 'death', cause: 'shot', player: 'b' },
      ],
    };
    const r1 = chronicle(theme, h)[0]!;
    expect(r1.night.slice(-3)).toEqual([
      '☠ Los Lobos acabaron con Ana (Aldeano).',
      '💔 Eva (Cazador) murió con su pareja, Ana.',
      '🎯 Eva disparó a Bea (Lobo) antes de morir.',
    ]);
    const titles = hallOfFame(theme, h).map((a) => a.title);
    expect(titles).toContain('Puntería');
    expect(titles).toContain('Manada letal');
  });

  it('nombra al bando ganador', () => {
    expect(winnerName(theme, 'bad')).toBe('Lobos');
    expect(winnerName(theme, 'good')).toBe('Aldea');
    expect(winnerName(getTheme('alien'), 'lovers')).toBe('Vinculados');
  });
});
