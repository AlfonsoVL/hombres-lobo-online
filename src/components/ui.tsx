// Piezas de interfaz compartidas.
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl bg-stone-900 p-5 shadow-lg ${className}`}>{children}</section>;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' };

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  const styles =
    variant === 'primary'
      ? 'bg-amber-600 text-stone-950 hover:bg-amber-500'
      : 'bg-stone-800 text-stone-100 hover:bg-stone-700';
  return (
    <button
      className={`w-full rounded-xl px-4 py-3 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
      {...props}
    />
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
    <label className="flex flex-col gap-2">
      <span className="text-sm text-stone-400">Tu nombre</span>
      <input
        className="rounded-xl bg-stone-800 px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-amber-500"
        value={value}
        maxLength={24}
        autoComplete="nickname"
        onChange={(e) => onChange(e.target.value)}
        placeholder="Cómo te llamarán en la partida"
      />
    </label>
  );
}
