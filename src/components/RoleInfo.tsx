// Nombre de un rol que, al tocarlo, abre su ficha de la Ayuda en un globo
// sin salir de la página. Pensado para móvil: se abre con un toque (no con
// hover) y se cierra tocando fuera, con «Cerrar» o con Escape.
import { useEffect, useId, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { RoleCard, Theme } from '../lib/tematicas';
import { AlcaldeFicha, RoleFicha } from './Help';

interface Props {
  theme: Theme;
  /** Rol a explicar, o el Alcalde. */
  role: RoleCard | 'alcalde';
  /** Texto del botón; por defecto, el nombre del rol. */
  children?: ReactNode;
  className?: string;
}

export default function RoleInfo({ theme, role, children, className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const name = role === 'alcalde' ? 'Alcalde' : role.nombre;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`Qué hace ${name}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={`inline-flex max-w-full items-center gap-1 text-left ${className}`}
      >
        <span className="min-w-0 underline decoration-stone-500 decoration-dotted underline-offset-4">
          {children ?? name}
        </span>
        <span aria-hidden className="shrink-0 text-xs text-amber-400/80">
          ⓘ
        </span>
      </button>
      {open &&
        // En un portal: las tarjetas con backdrop-blur atraparían el `fixed`.
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/70 p-4 sm:items-center"
            onClick={() => setOpen(false)}
          >
            <div
              id={id}
              role="dialog"
              aria-modal="true"
              aria-label={name}
              onClick={(e) => e.stopPropagation()}
              className="flex w-full max-w-md flex-col gap-3 rounded-2xl border border-amber-500/30 bg-stone-950 p-3 text-left text-stone-100 shadow-2xl shadow-black/70"
            >
              {role === 'alcalde' ? <AlcaldeFicha /> : <RoleFicha theme={theme} role={role} />}
              <button
                type="button"
                autoFocus
                onClick={() => setOpen(false)}
                className="rounded-xl bg-stone-800 px-4 py-2.5 font-semibold"
              >
                Cerrar
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
