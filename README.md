# Hombres lobo online

Web app de partidas sociales de deducción con varias temáticas (Castronegro y Alien),
inspirada en «Los Hombres Lobo de Castronegro». Funciona solo con servicios gratuitos:
Astro + React + Tailwind en Vercel y Supabase (plan Free).

El diseño está en [docs/arquitectura.md](docs/arquitectura.md).

## Base de datos

Las migraciones están en `supabase/migrations`. Para probarlas en un Postgres local vacío:

```bash
createdb lobos_test
DATABASE_URL="postgresql://localhost/lobos_test" scripts/test-sql.sh
```

Las instrucciones para ejecutar la app en local y desplegarla en Vercel se añadirán
cuando exista el proyecto de Astro.
