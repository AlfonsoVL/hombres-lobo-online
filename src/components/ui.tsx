// Piezas de interfaz compartidas.
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-2xl border border-amber-500/20 bg-stone-950/75 p-5 shadow-xl shadow-black/50 backdrop-blur-sm ${className}`}
    >
      {children}
    </section>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'small' };

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  const styles = {
    primary:
      'w-full rounded-xl px-4 py-3.5 text-lg bg-gradient-to-b from-amber-300 to-amber-600 text-stone-950 shadow-[var(--brillo)] hover:brightness-110',
    secondary:
      'w-full rounded-xl px-4 py-3 border border-amber-500/30 bg-stone-900/80 text-stone-100 hover:bg-stone-800',
    small:
      'rounded-lg px-4 py-1.5 text-sm bg-gradient-to-b from-amber-300 to-amber-600 text-stone-950 hover:brightness-110',
  }[variant];
  return (
    <button
      className={`font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
      {...props}
    />
  );
}

/** Título grande dorado con la fuente de la temática. */
export function Title({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <h1
      className={`text-center text-3xl font-extrabold leading-tight text-amber-300 [text-shadow:0_2px_0_rgb(0_0_0/0.6),var(--brillo)] ${className}`}
    >
      {children}
    </h1>
  );
}

/** Adorno horizontal: línea, rombo y línea. Con texto, lo pone en medio. */
export function Ornament({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-2 text-amber-400 ${className}`} aria-hidden={!children}>
      <span className="h-px w-10 bg-gradient-to-r from-transparent to-amber-500/80" />
      {children ? (
        <span className="titulo text-sm font-semibold tracking-[0.3em]">{children}</span>
      ) : (
        <span className="h-1.5 w-1.5 rotate-45 bg-amber-400" />
      )}
      <span className="h-px w-10 bg-gradient-to-l from-transparent to-amber-500/80" />
    </div>
  );
}

/** Etiqueta pequeña sobre un campo o una sección. */
export function Label({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-sm font-semibold text-stone-300">{children}</p>;
}

/** Interruptor tipo iOS. */
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50 ${
        checked ? 'bg-emerald-600' : 'bg-stone-700'
      }`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`}
      />
    </button>
  );
}

/**
 * Ilustración de fondo a pantalla completa, oscurecida para que se lea el
 * texto. Sin imagen no pinta nada y se queda el fondo de la temática.
 */
export function Scene({ src }: { src?: string }) {
  if (!src) return null;
  return (
    <div aria-hidden className="escena pointer-events-none fixed inset-0 -z-10">
      <img src={src} alt="" className="h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-b from-stone-950/30 via-stone-950/55 to-stone-950/95" />
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-lg bg-red-950 px-3 py-2 text-sm text-red-200">
      {children}
    </p>
  );
}

export function NameField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col">
      <span className="mb-2 text-sm font-semibold text-stone-300">Tu nombre</span>
      <span className="relative">
        <input
          className="w-full rounded-xl border border-stone-700 bg-stone-900/90 px-4 py-3 text-lg outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40"
          value={value}
          maxLength={24}
          autoComplete="nickname"
          onChange={(e) => onChange(e.target.value)}
          placeholder="Cómo te llamarán en la partida"
        />
        {value && (
          <button
            type="button"
            aria-label="Borrar el nombre"
            onClick={() => onChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 px-1 text-xl text-stone-400"
          >
            ×
          </button>
        )}
      </span>
    </label>
  );
}
