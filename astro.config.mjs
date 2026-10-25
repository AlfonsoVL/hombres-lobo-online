// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';
import { loadEnv } from 'vite';

// La integración de Supabase en Vercel crea las variables con otros nombres
// (NEXT_PUBLIC_..., SUPABASE_...). Se aceptan todos para no tener que
// duplicarlas. Solo se usan la URL y la clave pública, nunca la service role.
const env = { ...loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), ''), ...process.env };
const pick = (/** @type {string[]} */ ...names) => names.map((n) => env[n]).find(Boolean) ?? '';

const supabaseUrl = pick('PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL');
const supabaseKey = pick(
  'PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_ANON_KEY',
);

export default defineConfig({
  output: 'server',
  adapter: vercel(),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    define: {
      'import.meta.env.PUBLIC_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.PUBLIC_SUPABASE_ANON_KEY': JSON.stringify(supabaseKey),
    },
  },
});
