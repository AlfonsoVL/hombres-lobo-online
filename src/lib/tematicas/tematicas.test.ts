import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { THEMES, type RoleKind } from '.';

const FIELDS = ['id', 'nombre', 'bando', 'avatar', 'cuando_actua', 'poder', 'gana'] as const;
const KINDS_WITH_TURN: RoleKind[] = ['investigate', 'protect', 'link', 'swap'];

// Roles sembrados en la migración SQL, para que motor y base de datos coincidan.
function sqlRoles(): string[] {
  const dir = fileURLToPath(new URL('../../../supabase/migrations', import.meta.url));
  const sql = readdirSync(dir).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
  return [...sql.matchAll(/\('(castronegro|alien)',\s*'([a-z_]+)',\s*'([a-z_]+)',\s*'(bad|good)'/g)]
    .map((m) => `${m[1]}:${m[2]}:${m[3]}:${m[4]}`)
    .sort();
}

describe.each(Object.values(THEMES))('temática $id', (theme) => {
  it('cada rol tiene ficha completa', () => {
    for (const role of theme.roles) {
      for (const field of FIELDS) {
        expect(role[field], `${role.id}.${field}`).toBeTypeOf('string');
        expect(role[field].trim().length, `${role.id}.${field}`).toBeGreaterThan(0);
      }
      expect(role.avatar).toBe(`/avatares/${theme.id}/${role.id}.svg`);
    }
  });

  it('tiene exactamente un malo y un bueno sin rol', () => {
    expect(theme.roles.filter((r) => r.tipo === 'bad')).toHaveLength(1);
    expect(theme.roles.filter((r) => r.tipo === 'plain_good')).toHaveLength(1);
  });

  it('cada rol con turno de noche tiene sus textos de abrir y cerrar', () => {
    for (const role of theme.roles.filter((r) => KINDS_WITH_TURN.includes(r.tipo))) {
      const turn = theme.textos.turnos[role.id];
      expect(turn, role.id).toBeDefined();
      expect(turn!.abrir.audio).toMatch(new RegExp(`^/audio/${theme.id}/.+\\.mp3$`));
      expect(turn!.cerrar.audio).toMatch(new RegExp(`^/audio/${theme.id}/.+\\.mp3$`));
    }
  });

  it('todos los audios están en la carpeta de la temática', () => {
    const audios = JSON.stringify(theme.textos).match(/"audio":"[^"]+"/g) ?? [];
    expect(audios.length).toBeGreaterThan(0);
    for (const a of audios) expect(a).toMatch(new RegExp(`"/audio/${theme.id}/[a-z_]+\\.mp3"`));
  });
});

it('los roles coinciden con los de la base de datos', () => {
  const fromJson = Object.values(THEMES)
    .flatMap((t) => t.roles.map((r) => `${t.id}:${r.id}:${r.tipo}:${r.bando}`))
    .sort();
  expect(fromJson).toEqual(sqlRoles());
});

describe('avatares de rol', () => {
  it('cada rol tiene su SVG en public y declara el icono de Tabler (MIT) que usa', () => {
    for (const theme of Object.values(THEMES)) {
      for (const role of theme.roles) {
        const file = fileURLToPath(new URL(`../../../public${role.avatar}`, import.meta.url));
        expect(existsSync(file), role.avatar).toBe(true);
        expect(readFileSync(file, 'utf8')).toContain('Tabler Icons (MIT)');
      }
    }
  });
});
