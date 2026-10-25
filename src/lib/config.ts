// Ajustes de la app que dependen del despliegue.

/**
 * Modo pruebas: permite empezar en modo clásico con menos de 6 jugadores.
 * Está activado mientras la app está en desarrollo. Para desactivarlo, define
 * PUBLIC_MODO_PRUEBAS=false en el entorno (por ejemplo, en Vercel).
 */
export const TEST_MODE = import.meta.env.PUBLIC_MODO_PRUEBAS !== 'false';
