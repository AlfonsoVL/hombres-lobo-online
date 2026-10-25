// Composición de la partida: tabla clásica y validación del modo personalizado.
import { findRoleByKind, getRole, type RoleKind, type Theme } from '../tematicas';

export const MIN_PLAYERS_CLASSIC = 6;
/** Mínimo en modo pruebas, para probar la app con pocos móviles. */
export const MIN_PLAYERS_TEST = 2;
export const MAX_PLAYERS = 24;

export interface Composition {
  players: number;
  bad: number;
  /** Ids de los roles especiales, cada uno como máximo una vez. */
  specials: string[];
  /** Buenos sin rol: jugadores − malos − roles especiales. */
  plain: number;
}

type ClassicRow = { bad: number } & Partial<Record<Exclude<RoleKind, 'bad' | 'plain_good'>, 1>>;

// Tabla clásica para números pares. Cada rol especial sale como máximo una vez:
// donde la propuesta original tenía dos, el sobrante pasa a bueno sin rol.
const CLASSIC_TABLE: Record<number, ClassicRow> = {
  6: { bad: 2, investigate: 1, protect: 1 },
  8: { bad: 2, investigate: 1, protect: 1, shoot_on_death: 1 },
  10: { bad: 3, investigate: 1, protect: 1, shoot_on_death: 1, link: 1 },
  12: { bad: 3, investigate: 1, protect: 1, shoot_on_death: 1, link: 1 },
  14: { bad: 4, investigate: 1, protect: 1, shoot_on_death: 1, link: 1 },
  16: { bad: 4, investigate: 1, protect: 1, shoot_on_death: 1, link: 1 },
  18: { bad: 5, investigate: 1, protect: 1, shoot_on_death: 1, link: 1 },
  20: { bad: 5, investigate: 1, protect: 1, shoot_on_death: 1, link: 1 },
  22: { bad: 6, investigate: 1, protect: 1, shoot_on_death: 1, link: 1 },
  24: { bad: 6, investigate: 1, protect: 1, shoot_on_death: 1, link: 1 },
};

// Solo en modo pruebas, para menos de 6 jugadores: 1 malo y hasta 2 roles especiales.
const TEST_TABLE: Record<number, ClassicRow> = {
  2: { bad: 1 },
  3: { bad: 1, investigate: 1 },
  4: { bad: 1, investigate: 1, protect: 1 },
  5: { bad: 1, investigate: 1, protect: 1 },
};

const CLASSIC_SPECIAL_ORDER: Exclude<RoleKind, 'bad' | 'plain_good'>[] = ['investigate', 'protect', 'shoot_on_death', 'link'];

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Composición del modo clásico. Con un número impar se usa la fila inferior
 * y se añade un bueno sin rol. En modo pruebas se permite empezar con menos
 * de 6 jugadores.
 */
export function classicComposition(
  theme: Theme,
  players: number,
  options: { testMode?: boolean } = {},
): Result<Composition> {
  const min = options.testMode ? MIN_PLAYERS_TEST : MIN_PLAYERS_CLASSIC;
  if (players < min) {
    return { ok: false, error: `El modo clásico necesita al menos ${min} jugadores.` };
  }
  if (players > MAX_PLAYERS) {
    return { ok: false, error: `El máximo es de ${MAX_PLAYERS} jugadores.` };
  }
  const row =
    players < MIN_PLAYERS_CLASSIC
      ? TEST_TABLE[players]!
      : CLASSIC_TABLE[players % 2 === 0 ? players : players - 1]!;
  const specials = CLASSIC_SPECIAL_ORDER.filter((kind) => row[kind]).map((kind) => {
    const role = findRoleByKind(theme, kind);
    if (!role) throw new Error(`${theme.nombre} no tiene un rol de tipo ${kind}`);
    return role.id;
  });
  return {
    ok: true,
    value: { players, bad: row.bad, specials, plain: players - row.bad - specials.length },
  };
}

/** Valida una configuración del modo personalizado y calcula los buenos sin rol. */
export function customComposition(
  theme: Theme,
  players: number,
  bad: number,
  specials: string[],
): Result<Composition> {
  if (players > MAX_PLAYERS) {
    return { ok: false, error: `El máximo es de ${MAX_PLAYERS} jugadores.` };
  }
  if (!Number.isInteger(bad) || bad < 1) {
    return { ok: false, error: 'Tiene que haber al menos 1 malo.' };
  }
  if (new Set(specials).size !== specials.length) {
    return { ok: false, error: 'Cada rol especial solo puede elegirse una vez.' };
  }
  for (const id of specials) {
    const role = theme.roles.find((r) => r.id === id);
    if (!role || role.tipo === 'bad' || role.tipo === 'plain_good') {
      return { ok: false, error: `El rol ${id} no es un rol especial de ${theme.nombre}.` };
    }
  }
  const plain = players - bad - specials.length;
  if (plain < 0) {
    return {
      ok: false,
      error: `Con ${players} jugadores, ${bad} malos y ${specials.length} roles especiales no caben. Reduce alguno.`,
    };
  }
  return { ok: true, value: { players, bad, specials: [...specials], plain } };
}

/** Texto del resumen que el creador confirma antes de iniciar. */
export function compositionSummary(theme: Theme, c: Composition): string {
  const names = c.specials.map((id) => getRole(theme, id).nombre).join(', ') || 'ninguno';
  return (
    `${theme.nombres_grupo.bad}: ${c.bad}. ` +
    `Roles especiales: ${names}. ` +
    `${theme.nombres_grupo.plain_good}: ${c.plain}.`
  );
}
