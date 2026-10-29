// Carga de las temáticas y tipos de sus JSON.
import castronegro from './castronegro.json';
import alien from './alien.json';

export type ThemeId = 'castronegro' | 'alien';
export type Team = 'bad' | 'good';
export type RoleKind =
  | 'bad'
  | 'plain_good'
  | 'investigate'
  | 'protect'
  | 'shoot_on_death'
  | 'link'
  | 'spy'
  | 'swap';

/** Ficha de ayuda de un rol, tal como está en el JSON de la temática. */
export interface RoleCard {
  id: string;
  tipo: RoleKind;
  nombre: string;
  bando: Team;
  avatar: string;
  /** El avatar es un retrato que ocupa todo el círculo (si no, es un emoji sobre un medallón). */
  retrato?: boolean;
  cuando_actua: string;
  poder: string;
  gana: string;
}

export interface Line {
  texto: string;
  audio: string;
}

export interface Theme {
  id: ThemeId;
  nombre: string;
  color: string;
  bandos: Record<Team, string>;
  nombres_grupo: { bad: string; plain_good: string; lovers: string };
  roles: RoleCard[];
  textos: {
    introduccion: Line;
    cerrad_ojos: Line;
    malos_abrid: Line;
    malos_cerrad: Line;
    turnos: Record<string, { abrir: Line; cerrar: Line }>;
    amanecer: Line;
    amanecer_sin_victima: Line;
    dia: Line;
    linchamiento: Line;
    victoria: Record<'bad' | 'good' | 'lovers', Line>;
  };
  reglas: string[];
}

export const THEMES: Record<ThemeId, Theme> = {
  castronegro: castronegro as Theme,
  alien: alien as Theme,
};

export function getTheme(id: ThemeId): Theme {
  return THEMES[id];
}

export function getRole(theme: Theme, roleId: string): RoleCard {
  const role = theme.roles.find((r) => r.id === roleId);
  if (!role) throw new Error(`El rol ${roleId} no existe en ${theme.nombre}`);
  return role;
}

/** Rol de la temática para un tipo, o undefined si la temática no lo tiene. */
export function findRoleByKind(theme: Theme, kind: RoleKind): RoleCard | undefined {
  return theme.roles.find((r) => r.tipo === kind);
}

export function roleByKind(theme: Theme, kind: RoleKind): RoleCard {
  const role = findRoleByKind(theme, kind);
  if (!role) throw new Error(`${theme.nombre} no tiene un rol de tipo ${kind}`);
  return role;
}
