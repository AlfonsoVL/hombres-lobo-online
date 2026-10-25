// Ajustes de la app que dependen del despliegue.

/**
 * Modo pruebas: permite empezar en modo clásico con menos de 6 jugadores.
 * Está desactivado por defecto. Para probar la app con pocos móviles, define
 * PUBLIC_MODO_PRUEBAS=true en el entorno (en .env o en Vercel).
 */
export const TEST_MODE = import.meta.env.PUBLIC_MODO_PRUEBAS === 'true';
