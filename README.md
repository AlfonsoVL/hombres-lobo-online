# Hombres lobo online

Web app de partidas sociales de deducción con varias temáticas (Castronegro y Alien),
inspirada en «Los Hombres Lobo de Castronegro». Cada jugador usa su móvil: recibe su rol en
secreto, actúa de noche cuando le toca y vota de día. Quien crea la sala también juega, pasa
los turnos y su móvil hace de narrador. El sonido viene activado en su móvil y desactivado en
el de los demás, que pueden activarlo para oír también la narración en cada fase.

Funciona solo con servicios gratuitos: Astro + React + Tailwind en Vercel (plan Hobby) y
Supabase (plan Free). El diseño y las reglas confirmadas están en
[docs/arquitectura.md](docs/arquitectura.md).

## Cómo se juega

1. Una persona abre la web, elige la temática y el modo, escribe su nombre y crea la sala.
2. Comparte el enlace (por WhatsApp o copiándolo). Los demás lo abren, escriben su nombre y,
   si quieren, se hacen una foto.
3. El creador configura los roles (y si hay Alcalde) e inicia la partida.
4. Cada uno mantiene pulsada su carta para ver su rol. Después el creador pasa la noche turno a
   turno, el amanecer, la votación y el linchamiento hasta que gana un bando.

En el modo clásico hacen falta al menos 6 jugadores. En la portada hay un enlace a la ayuda
con las reglas y la ficha de cada rol.

## Privacidad y seguridad

- **Fotos.** Se hacen en el móvil, viajan solo por Supabase Realtime (Broadcast) a los móviles
  de la sala y se guardan solo en memoria. Nunca se guardan fotos ni datos biométricos en la
  base de datos ni en Storage.
- **Token.** Cada jugador tiene un token secreto generado en su navegador y guardado en
  `localStorage`. No se muestra nunca en la interfaz.
- **Roles.** El reparto se hace en el servidor (`iniciar_partida`, solo el creador). La tabla
  `roles_privados` tiene RLS y ningún acceso para `anon`; `obtener_mi_rol` devuelve solo el
  rol de quien llama (y sus compañeros si es malo). Los roles nunca se envían por Broadcast
  ni por Presence ni en los datos generales de la sala.
- **Base de datos.** Todas las tablas tienen RLS sin políticas, así que `anon` no puede leerlas
  ni escribirlas. Todo pasa por funciones `SECURITY DEFINER` que comprueban el token. Por eso
  el asesor de Supabase avisa de que `anon` puede ejecutar esas funciones: es intencionado.
- **Claves.** La app solo usa la URL y la clave pública (`anon` o *publishable*) de Supabase,
  nunca la *service role*. El archivo `.env` está en `.gitignore`: no lo subas nunca.

## Despliegue

### 1. Supabase

1. Crea un proyecto gratuito en [Supabase](https://supabase.com).
2. En **SQL Editor**, ejecuta en orden los archivos de `supabase/migrations`:
   1. `20261025000000_esquema_inicial.sql`
   2. `20261025010000_avanzar_fase.sql`
   3. `20261025020000_noche_dia.sql`
   4. `20261025030000_lobos_acuerdo.sql`
   5. `20261029000000_cancelar_sala.sql`
   6. `20261029010000_historial.sql`

   Con la [CLI de Supabase](https://supabase.com/docs/guides/cli) también puedes hacer
   `supabase link` y `supabase db push`.
3. En **Project Settings → API** copia la URL del proyecto y la clave pública (`anon` o
   *publishable*). No hace falta configurar Realtime: los canales públicos vienen activados.

### 2. Vercel

1. Importa el repositorio en [Vercel](https://vercel.com/new). Detecta Astro solo; no cambies
   los comandos de build.
2. En **Settings → Environment Variables** añade:

   | Variable | Valor |
   |---|---|
   | `PUBLIC_SUPABASE_URL` | URL del proyecto de Supabase |
   | `PUBLIC_SUPABASE_ANON_KEY` | Clave pública (`anon` o *publishable*) |

   Si conectas el proyecto con la integración de Supabase de Vercel no hace falta crearlas: la
   app también lee las que crea la integración (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_ANON_KEY`, etc.).
3. No definas `PUBLIC_MODO_PRUEBAS` en producción.
4. Despliega. Cada cambio en `main` se publica solo y cada pull request tiene su propia
   preview.

### Modo pruebas

Para probar con menos de 6 móviles, define `PUBLIC_MODO_PRUEBAS=true` (en `.env` o solo en
el entorno *Preview* de Vercel). Así el modo clásico permite empezar con 2 jugadores, con 1
malo y hasta 2 roles especiales. Si no se define, la app exige el mínimo normal.

## Desarrollo en local

```bash
npm install
cp .env.example .env   # y rellena la URL y la clave pública
npm run dev            # http://localhost:4321
```

Crea una sala y abre el enlace en otras pestañas o móviles de la misma red. La cámara solo
funciona en `localhost` o con HTTPS.

### Comprobaciones

```bash
npm run typecheck
npm test                          # motor, temáticas, narración y tiempo real
npm run build
scripts/test-vercel-function.sh   # la función de Vercel arranca sin el node_modules del proyecto
```

Las migraciones y sus tests SQL se prueban en un Postgres local vacío:

```bash
createdb lobos_test
DATABASE_URL="postgresql://localhost/lobos_test" scripts/test-sql.sh
```

GitHub Actions ejecuta todo esto en cada pull request.

## Estructura

| Carpeta | Contenido |
|---|---|
| `src/lib/game` | Motor de la partida (composición, Ladrón, narración), sin UI |
| `src/lib/tematicas` | Temáticas en JSON: roles, textos y audios |
| `src/lib/realtime` | Cliente de Supabase, RPC, canal de la sala y token |
| `src/components` | Islas de React: crear sala, sala de espera, partida, noche, ayuda |
| `supabase/migrations` | Esquema, funciones RPC y tests SQL (`supabase/tests`) |
| `public/audio/{tematica}` | Narración en MP3 (ElevenLabs). Si falta un audio, se usa la voz del navegador |
| `public/avatares` | Avatares de rol ([licencias](public/avatares/LICENCIAS.md)) |

## Añadir audios de narración

Los textos y los nombres exactos de los MP3 están en `src/lib/tematicas/{tematica}.json`
(campo `audio`). Copia cada MP3 a `public/audio/{tematica}/` con ese nombre. Hoy están los de
Castronegro; Alien usa la voz del navegador hasta que se añadan los suyos.
