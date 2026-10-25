// Ayuda: reglas de la temática, Alcalde y la ficha de cada rol.
import { useState } from 'react';
import { useThemeStyle } from '../lib/estilo';
import { THEMES, findRoleByKind, roleByKind, type RoleCard, type RoleKind, type Theme, type ThemeId } from '../lib/tematicas';
import RoleAvatar from './RoleAvatar';

/** Orden de la noche con los nombres de la temática. */
function nightOrderText(theme: Theme): string {
  const name = (kind: RoleKind) => findRoleByKind(theme, kind)?.nombre;
  const firstNight = [name('swap'), name('link')].filter(Boolean).join(' y ');
  const spy = name('spy');
  const parts = [
    firstNight && `${firstNight} (solo la primera noche)`,
    theme.nombres_grupo.bad + (spy ? ` (${spy} espía durante su turno)` : ''),
    name('investigate'),
    name('protect'),
  ].filter(Boolean);
  return `Orden de la noche: ${parts.join(', ')}.`;
}

export function RoleFicha({ theme, role }: { theme: Theme; role: RoleCard }) {
  return (
    <article className="flex gap-3 rounded-xl border border-stone-700/60 bg-stone-800/70 p-3">
      <RoleAvatar role={role} size={64} />
      <div className="flex flex-col gap-1 text-sm">
        <h3 className="text-base font-semibold">
          {role.nombre}{' '}
          <span className={role.bando === 'bad' ? 'text-red-400' : 'text-emerald-400'}>
            · {theme.bandos[role.bando]}
          </span>
        </h3>
        <p className="text-stone-300">{role.poder}</p>
        <p className="text-stone-400">
          <strong className="text-stone-300">Cuándo actúa:</strong> {role.cuando_actua}
        </p>
        <p className="text-stone-400">
          <strong className="text-stone-300">Gana:</strong> {role.gana}
        </p>
      </div>
    </article>
  );
}

export default function Help({ themeId }: { themeId?: ThemeId }) {
  const [selected, setSelected] = useState<ThemeId>(themeId ?? 'castronegro');
  const theme = THEMES[selected];
  useThemeStyle(themeId ? undefined : selected);

  return (
    <div className="flex flex-col gap-5">
      {!themeId && (
        <div className="grid grid-cols-2 gap-3">
          {Object.values(THEMES).map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={selected === t.id}
              onClick={() => setSelected(t.id)}
              className={`flex flex-col items-center gap-2 rounded-xl border-2 p-3 text-center text-sm font-semibold ${
                selected === t.id ? 'border-amber-400 bg-stone-800/80' : 'border-stone-700 text-stone-400 opacity-80'
              }`}
            >
              <RoleAvatar role={roleByKind(t, 'bad')} size={48} />
              {t.nombre}
            </button>
          ))}
        </div>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Cómo se juega</h2>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-stone-300">
          {theme.reglas.map((r) => (
            <li key={r}>{r}</li>
          ))}
          <li>{nightOrderText(theme)}</li>
          <li>Quien crea la sala también juega y es quien pasa los turnos y las fases.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Roles</h2>
        {theme.roles.map((role) => (
          <RoleFicha key={role.id} theme={theme} role={role} />
        ))}
        <article className="flex gap-3 rounded-xl border border-stone-700/60 bg-stone-800/70 p-3">
          <RoleAvatar role="alcalde" size={64} />
          <div className="flex flex-col gap-1 text-sm">
            <h3 className="text-base font-semibold">Alcalde (opcional)</h3>
            <p className="text-stone-300">
              No es una carta: se sortea entre todos al repartir los roles y todos saben quién es. Puede ser
              de cualquier bando.
            </p>
            <p className="text-stone-400">
              Si hay empate en la votación del día, muere el empatado al que votó el Alcalde. Si no votó a
              ninguno, no muere nadie. Si el Alcalde muere, se sortea otro entre los vivos.
            </p>
          </div>
        </article>
      </section>
    </div>
  );
}

/** Botón que abre la ayuda a pantalla completa. */
export function HelpButton({ themeId }: { themeId: ThemeId }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-center rounded-full border border-stone-700 bg-stone-900/80 px-4 py-2 text-sm text-stone-300"
      >
        ❓ Ayuda y roles
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label="Ayuda" className="fixed inset-0 z-50 overflow-y-auto bg-stone-950/95 backdrop-blur">
          <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-6">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold">Ayuda</h1>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full bg-stone-800 px-4 py-2 font-semibold"
              >
                Cerrar
              </button>
            </div>
            <Help themeId={themeId} />
          </div>
        </div>
      )}
    </>
  );
}
