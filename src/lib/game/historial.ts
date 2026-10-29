// Crónica y salón de la fama de una partida terminada, a partir del histórico
// que devuelve el servidor (historial_partida). Solo se usa con todos los roles
// ya revelados.
import { findRoleByKind, type RoleCard, type Team, type Theme } from '../tematicas';
import type { Winner } from './victory';

export type DeathCause = 'bad' | 'poisoned' | 'spied' | 'lynched' | 'shot' | 'lover';

export interface GameHistory {
  winner: Winner;
  players: { id: string; name: string; alive: boolean; role: string; initial_role: string; team: Team }[];
  links: [string, string][];
  night: { round: number; actor: string; action: string; target: string | null; target2: string | null }[];
  votes: { round: number; voter: string; target: string }[];
  log: { round: number; event: 'attack' | 'death'; cause: DeathCause | null; player: string }[];
}

export interface ChronicleRound {
  round: number;
  night: string[];
  day: string[];
}

export interface Award {
  emoji: string;
  title: string;
  players: string[];
  text: string;
}

/** Nombre corto del bando ganador: «los Lobos», «la Aldea», «los Enamorados». */
export function winnerName(theme: Theme, winner: Winner): string {
  if (winner === 'bad') return theme.nombres_grupo.bad;
  if (winner === 'lovers') return theme.nombres_grupo.lovers;
  return theme.bandos.good;
}

function helpers(theme: Theme, h: GameHistory) {
  const player = (id: string | null) => h.players.find((p) => p.id === id);
  const name = (id: string | null) => player(id)?.name ?? '¿?';
  const role = (id: string | null): RoleCard | undefined => {
    const p = player(id);
    return p ? theme.roles.find((r) => r.id === p.role) : undefined;
  };
  const roleName = (id: string | null) => role(id)?.nombre ?? '';
  const isBad = (id: string | null) => player(id)?.team === 'bad';
  return { player, name, role, roleName, isBad };
}

/** Quién disparó en cada muerte por disparo: el último muerto con rol de disparar. */
function shooters(theme: Theme, h: GameHistory): Map<number, string> {
  const { role } = helpers(theme, h);
  const result = new Map<number, string>();
  let last: string | null = null;
  h.log.forEach((e, i) => {
    if (e.event !== 'death') return;
    if (e.cause === 'shot' && last) result.set(i, last);
    if (role(e.player)?.tipo === 'shoot_on_death') last = e.player;
  });
  return result;
}

function partnerOf(h: GameHistory, id: string): string | undefined {
  const link = h.links.find(([a, b]) => a === id || b === id);
  if (!link) return undefined;
  return link[0] === id ? link[1] : link[0];
}

/** Crónica ronda a ronda: qué pasó de noche y de día. */
export function chronicle(theme: Theme, h: GameHistory): ChronicleRound[] {
  const { name, roleName, player } = helpers(theme, h);
  const bad = theme.nombres_grupo.bad;
  const shotBy = shooters(theme, h);
  const rounds = new Set<number>([...h.night.map((a) => a.round), ...h.votes.map((v) => v.round), ...h.log.map((e) => e.round)]);

  const deathLine = (e: GameHistory['log'][number], i: number) => {
    const who = `${name(e.player)} (${roleName(e.player)})`;
    switch (e.cause) {
      case 'bad':
        return `☠ Los ${bad} acabaron con ${who}.`;
      case 'poisoned':
        return `☠ ${who} murió por el veneno de la ${findRoleByKind(theme, 'protect')?.nombre ?? 'Bruja'}.`;
      case 'spied':
        return `☠ Descubrieron a ${who} espiando y murió.`;
      case 'lynched':
        return `⚖ La votación eliminó a ${who}.`;
      case 'shot': {
        const shooter = shotBy.get(i);
        return `🎯 ${shooter ? name(shooter) : 'El Cazador'} disparó a ${who} antes de morir.`;
      }
      case 'lover':
        return `💔 ${who} murió con su pareja, ${name(partnerOf(h, e.player) ?? null)}.`;
      default:
        return `☠ Murió ${who}.`;
    }
  };

  return [...rounds]
    .sort((a, b) => a - b)
    .map((round) => {
      const night: string[] = [];
      const day: string[] = [];
      const attack = h.log.find((e) => e.round === round && e.event === 'attack');

      for (const a of h.night.filter((x) => x.round === round)) {
        const actor = `${roleName(a.actor)} (${name(a.actor)})`;
        switch (a.action) {
          case 'swap': {
            const p = player(a.actor);
            const card = p && theme.roles.find((r) => r.id === p.role);
            night.push(`🃏 ${name(a.actor)}, el ${findRoleByKind(theme, 'swap')?.nombre ?? 'Ladrón'}, se quedó con la carta de ${card?.nombre ?? '¿?'}.`);
            break;
          }
          case 'link':
            night.push(`💘 ${actor} unió a ${name(a.target)} y ${name(a.target2)}.`);
            break;
          case 'see':
            night.push(`🔮 ${actor} investigó a ${name(a.target)}: era ${roleName(a.target)}.`);
            break;
          case 'spy':
            night.push(
              a.target
                ? `👀 ${actor} espió sin que la vieran y descubrió a ${name(a.target)} (${roleName(a.target)}).`
                : `👀 ${actor} espió, pero la descubrieron.`,
            );
            break;
          case 'protect':
            night.push(
              `🛡 ${actor} protegió a ${name(a.target)}${attack?.player === a.target ? ' y le salvó la vida' : ''}.`,
            );
            break;
          case 'potions':
            if (a.target2) night.push(`🧪 ${actor} salvó a ${name(a.target2)} con su poción de cura.`);
            if (a.target) night.push(`🧪 ${actor} usó su veneno con ${name(a.target)}.`);
            break;
        }
      }
      if (attack) night.splice(firstAfterSwapAndLink(night), 0, `🐾 Los ${bad} atacaron a ${name(attack.player)}.`);

      const votes = h.votes.filter((v) => v.round === round);
      if (votes.length) {
        const byTarget = new Map<string, string[]>();
        for (const v of votes) byTarget.set(v.target, [...(byTarget.get(v.target) ?? []), name(v.voter)]);
        for (const [target, voters] of [...byTarget].sort((a, b) => b[1].length - a[1].length)) {
          day.push(`🗳 ${voters.length} ${voters.length === 1 ? 'voto' : 'votos'} para ${name(target)}: ${voters.join(', ')}.`);
        }
      }

      // Muertes en orden: las de la noche (y sus consecuencias) y las del día.
      let inDay = false;
      h.log.forEach((e, i) => {
        if (e.round !== round || e.event !== 'death') return;
        if (e.cause === 'lynched') inDay = true;
        (inDay ? day : night).push(deathLine(e, i));
      });
      if (votes.length && !h.log.some((e) => e.round === round && e.cause === 'lynched')) {
        day.push('⚖ La votación no eliminó a nadie.');
      }
      return { round, night, day };
    })
    .filter((r) => r.night.length || r.day.length);
}

/** El ataque de los malos va después de Ladrón y Cupido, que actúan antes. */
function firstAfterSwapAndLink(lines: string[]): number {
  const i = lines.findIndex((l) => !l.startsWith('🃏') && !l.startsWith('💘'));
  return i === -1 ? lines.length : i;
}

/** Salón de la fama: solo los premios que alguien ha ganado. */
export function hallOfFame(theme: Theme, h: GameHistory): Award[] {
  const { name, role, isBad } = helpers(theme, h);
  const bad = theme.nombres_grupo.bad;
  const awards: Award[] = [];
  const count = <T,>(items: T[], key: (t: T) => string) => {
    const m = new Map<string, number>();
    for (const it of items) m.set(key(it), (m.get(key(it)) ?? 0) + 1);
    return m;
  };
  const best = (m: Map<string, number>) => {
    const max = Math.max(0, ...m.values());
    return { max, ids: [...m].filter(([, n]) => n === max && max > 0).map(([id]) => id) };
  };
  const attackOf = (round: number) => h.log.find((e) => e.round === round && e.event === 'attack')?.player;

  // Investigaciones que dieron con un malo.
  const hits = count(h.night.filter((a) => a.action === 'see' && isBad(a.target)), (a) => a.actor);
  for (const [id, n] of hits) {
    awards.push({
      emoji: '🔮',
      title: 'Ojo que todo lo ve',
      players: [name(id)],
      text: `${role(id)?.nombre ?? 'Vidente'}: descubrió a ${n === 1 ? 'uno' : n} de los ${bad}.`,
    });
  }

  // Vidas salvadas con protección o con la poción de cura.
  const saves = h.night.filter(
    (a) => (a.action === 'protect' && a.target && a.target === attackOf(a.round)) || (a.action === 'potions' && a.target2),
  );
  for (const [id, n] of count(saves, (a) => a.actor)) {
    const saved = saves.filter((a) => a.actor === id).map((a) => name(a.action === 'potions' ? a.target2 : a.target));
    awards.push({
      emoji: '😇',
      title: 'Ángel de la guarda',
      players: [name(id)],
      text: `${role(id)?.nombre}: salvó ${n === 1 ? 'una vida' : `${n} vidas`} (${saved.join(', ')}).`,
    });
  }

  // Veneno que acabó con un malo.
  for (const a of h.night.filter((x) => x.action === 'potions' && x.target && isBad(x.target))) {
    awards.push({ emoji: '🧪', title: 'Veneno certero', players: [name(a.actor)], text: `Envenenó a ${name(a.target)}, de los ${bad}.` });
  }

  // Disparo a un malo.
  const shotBy = shooters(theme, h);
  h.log.forEach((e, i) => {
    const shooter = shotBy.get(i);
    if (e.cause === 'shot' && shooter && isBad(e.player)) {
      awards.push({ emoji: '🎯', title: 'Puntería', players: [name(shooter)], text: `Su último disparo acabó con ${name(e.player)}, de los ${bad}.` });
    }
  });

  // Espía que vio a un malo sin que la descubrieran.
  for (const [id, n] of count(h.night.filter((a) => a.action === 'spy' && a.target && isBad(a.target)), (a) => a.actor)) {
    awards.push({ emoji: '👀', title: 'Espía silenciosa', players: [name(id)], text: `Vio a ${n === 1 ? 'uno' : n} de los ${bad} sin que la pillaran.` });
  }

  // Buenos que más votaron a malos durante el día.
  const goodVotes = best(count(h.votes.filter((v) => !isBad(v.voter) && isBad(v.target)), (v) => v.voter));
  if (goodVotes.ids.length) {
    awards.push({
      emoji: '🐕',
      title: 'Olfato de sabueso',
      players: goodVotes.ids.map(name),
      text: `${goodVotes.ids.length === 1 ? 'Votó' : 'Votaron'} ${goodVotes.max === 1 ? 'una vez' : `${goodVotes.max} veces`} contra los ${bad}.`,
    });
  }

  // Malos que sobrevivieron sin recibir ni un voto.
  const voted = new Set(h.votes.map((v) => v.target));
  const sneaky = h.players.filter((p) => p.team === 'bad' && p.alive && !voted.has(p.id));
  if (sneaky.length) {
    awards.push({ emoji: '🎭', title: 'Maestro del engaño', players: sneaky.map((p) => p.name), text: 'Nadie le votó en toda la partida.' });
  }

  // Ataques de los malos que acabaron en muerte.
  const kills = h.log.filter((e) => e.event === 'death' && e.cause === 'bad').length;
  if (kills) {
    awards.push({
      emoji: '🐺',
      title: 'Manada letal',
      players: h.players.filter((p) => p.team === 'bad').map((p) => p.name),
      text: `Los ${bad} acabaron con ${kills === 1 ? 'una víctima' : `${kills} víctimas`}.`,
    });
  }

  // Pareja de Cupido.
  const link = h.links[0];
  if (link) {
    const [a, b] = link;
    awards.push({ emoji: '💘', title: 'Flechazo', players: [name(a), name(b)], text: 'Unidos hasta el final.' });
  }

  // Primera víctima.
  const first = h.log.find((e) => e.event === 'death');
  if (first) awards.push({ emoji: '🪦', title: 'Primera sangre', players: [name(first.player)], text: 'Fue quien cayó primero.' });

  // Supervivientes del bando ganador.
  const winners = h.players.filter((p) =>
    p.alive &&
    (h.winner === 'lovers' ? h.links.some(([x, y]) => x === p.id || y === p.id) || role(p.id)?.tipo === 'link' : p.team === h.winner),
  );
  if (winners.length) {
    awards.push({ emoji: '🏆', title: 'Supervivientes', players: winners.map((p) => p.name), text: 'Siguen en pie al final de la partida.' });
  }

  return awards;
}
