// Estilo visual de la temática: colores, fuentes y fondo (ver styles/global.css).
import { useEffect } from 'react';
import type { ThemeId } from './tematicas';

const THEME_COLOR: Record<ThemeId, string> = { castronegro: '#0a0c18', alien: '#040b0c' };

export function applyThemeStyle(id: ThemeId) {
  document.documentElement.dataset.tema = id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[id]);
}

/** Aplica el estilo de la temática mientras el componente está montado. */
export function useThemeStyle(id: ThemeId | undefined) {
  useEffect(() => {
    if (id) applyThemeStyle(id);
  }, [id]);
}
