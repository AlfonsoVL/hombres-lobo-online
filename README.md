# Hombres lobo online

Web app de partidas sociales de deducción con varias temáticas (Castronegro y Alien),
inspirada en «Los Hombres Lobo de Castronegro». Funciona solo con servicios gratuitos:
Astro + React + Tailwind en Vercel y Supabase (plan Free).

El diseño está en [docs/arquitectura.md](docs/arquitectura.md).

## Motor de la partida

El motor está en `src/lib/game` y las temáticas en `src/lib/tematicas`. No dependen de la UI.

```bash
npm install
npm test          # tests del motor
npm run typecheck
```

## Base de datos

Las migraciones están en `supabase/migrations`. Para probarlas en un Postgres local vacío:

```bash
createdb lobos_test
DATABASE_URL="postgresql://localhost/lobos_test" scripts/test-sql.sh
```

## Ejecutar en local

1. Crea un proyecto gratuito en [Supabase](https://supabase.com).
2. En el editor SQL del proyecto, ejecuta el contenido de
   `supabase/migrations/20261025000000_esquema_inicial.sql`.
3. Copia `.env.example` a `.env` y rellena la URL y la clave `anon` del proyecto
   (Project Settings → API). Nunca commitees el archivo `.env`.
4. Arranca la app:

```bash
npm install
npm run dev
```

Abre http://localhost:4321, crea una sala y abre el enlace en otros móviles o pestañas.

Las instrucciones para desplegar en Vercel se añadirán en el último paso.
