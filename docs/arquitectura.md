# Arquitectura

## Estructura de carpetas

```
/src
  /lib
    /game          Motor puro de la partida: composición, reparto, turnos, victoria. Sin UI, con tests.
    /tematicas     castronegro.json y alien.json: roles, fichas, composición, textos y rutas de audio.
    /realtime      Cliente de Supabase, canales Broadcast y Presence.
  /components      Islas de React (lobby, cámara, noche, votación, ayuda...).
  /pages
    index.astro          Crear sala.
    /sala/[codigo].astro Unirse y jugar.
/public
  /avatares/{tematica}/{rol}.svg
  /audio/{tematica}/*.mp3
/supabase
  /migrations      Esquema SQL, RLS y funciones.
  /tests           Tests SQL que se ejecutan con scripts/test-sql.sh.
/scripts           Utilidades de desarrollo.
/docs              Este documento.
.env.example       Variables necesarias, sin claves reales.
```

Los identificadores de los roles son los mismos en SQL, en el motor y en los nombres de los
avatares: `werewolf`, `villager`, `seer`, `witch`, `hunter`, `cupid`, `little_girl`, `thief`
(Castronegro) y `xenomorph`, `crew_member`, `scientist`, `medic`, `marine`, `android` (Alien).
Los nombres en español que ve el jugador salen del JSON de la temática.

## Base de datos

| Tabla | Contenido | Quién la lee |
|---|---|---|
| `theme_roles` | Catálogo de roles por temática: tipo, bando y si sale en modo clásico. | Solo funciones |
| `rooms` | Código, temática, modo, fase, turno de noche, ronda, versión y ganador. | Solo funciones |
| `players` | Nombre, hash del token, si es creador, si está vivo y rol revelado. | Solo funciones |
| `roles_privados` | Rol de cada jugador, bando y estado de poderes (pociones, etc.). | Solo funciones |
| `undealt_cards` | Cartas sin repartir, para el Ladrón. | Solo funciones |
| `night_actions` | Votos de los malos y acciones de los roles en cada noche. | Solo funciones |
| `day_votes` | Votos de linchamiento. | Solo funciones |
| `links` | Pareja vinculada por Cupido o el Androide. | Solo funciones |

Todas las tablas tienen RLS activado y ninguna política, y se revocan los permisos de `anon`.
Así, el navegador no puede leer ninguna tabla: todo pasa por funciones `SECURITY DEFINER`.
Esto también hace que las salas no aparezcan en ningún listado. No hay columnas para fotos.

El token del jugador se genera en el navegador (32 bytes aleatorios), se guarda en
localStorage y en la base de datos solo se guarda su hash SHA-256.

### Funciones (RPC)

| Función | Qué hace |
|---|---|
| `create_room(theme, mode, name, token)` | Crea la sala y su creador (que también juega). Devuelve código y id. |
| `join_room(code, name, token)` | Une a un jugador. Con un token ya presente devuelve el mismo jugador (reconexión). Máximo 24, solo en el lobby, nombres únicos. |
| `get_room(code, token)` | Estado público de la sala y lista de jugadores. Nunca incluye roles sin revelar. |
| `iniciar_partida(code, token, special_roles, bad_count)` | Solo el creador. Valida la configuración, calcula los buenos sin rol, baraja y reparte. Emite `partida_iniciada` sin datos de rol. |
| `obtener_mi_rol(token)` | Devuelve solo el rol de quien presenta el token, su estado de poderes y, si es malo, sus compañeros. Error con un token incorrecto. |

En los pasos siguientes se añadirán funciones para las acciones nocturnas, la votación, el
disparo del Cazador o Marine y el avance de fases, todas con la misma comprobación de token.

### Composición

El motor (`/src/lib/game`) calcula la composición a partir de la tabla clásica o de lo que
elige el creador, y se la pasa a `iniciar_partida`. La función vuelve a validar en el
servidor (al menos 1 malo, que todo quepa, roles de la temática y del modo, sin repetir en
personalizado) y es quien baraja y reparte, así que nadie puede elegir a quién le toca qué.

Cada rol especial sale como máximo una vez, también en modo clásico. Donde la tabla proponía
dos (2 «Investiga» de 20 a 24 y 2 «Dispara al morir» con 24), se reparte uno y el resto pasa a
buenos sin rol:

| Jugadores | Malos | Investiga | Salva/cura | Dispara al morir | Vincula a dos | Buenos sin rol |
|---|---|---|---|---|---|---|
| 20 | 5 | 1 | 1 | 1 | 1 | 11 |
| 22 | 6 | 1 | 1 | 1 | 1 | 12 |
| 24 | 6 | 1 | 1 | 1 | 1 | 14 |

### Ladrón

Si la partida tiene Ladrón, la baraja lleva 2 buenos sin rol extra (jugadores + 2 cartas). El
Ladrón siempre se reparte a alguien; el resto de cartas se baraja y las 2 que sobran se guardan
en `undealt_cards`. Esas son las que el Ladrón ve la primera noche, así que pueden ser malos
(y entonces la partida tiene un malo menos en juego), igual que en el juego de mesa.

### Eventos en tiempo real

- Canal Broadcast `sala:{codigo}`. Los cambios de estado los emite el servidor con
  `realtime.send` y llevan solo el cambio y un número de `version`.
- Las fotos las envía cada navegador al unirse y se reenvían a quien entra después.
- Presence indica quién está conectado.
- Como el canal es público, cualquiera con el código podría enviar un mensaje falso. Por eso
  Broadcast se usa como aviso y la verdad sale siempre de `get_room` y `obtener_mi_rol`.

### Limpieza

Al crear una sala se borran las salas sin actividad en las últimas 24 horas, para no llenar
el plan gratuito.

## Decisiones que necesito que confirmes

1. **Nombres.** Has pedido `iniciar_partida`, `obtener_mi_rol` y `roles_privados` en español
   y el resto de identificadores en inglés. He mantenido esos tres tal cual. ¿Los dejo así o
   los paso a inglés (`start_game`, `get_my_role`, `private_roles`)?
2. **Firma de `iniciar_partida`.** Además del código de sala recibe el token (para
   comprobar que es el creador) y la composición elegida.
3. **Creador.** Juega con su propio rol y dirige las fases, pero no ve los roles de nadie.

## Reglas que te preguntaré antes del paso 5

- Empates en el voto de los malos y en el linchamiento.
- Número mínimo de jugadores en modo personalizado.
- Si se revela el rol de las víctimas de la noche, no solo de los linchados.
- Bruja: si ve la víctima de esa noche, si puede curarse a sí misma y si puede usar las dos
  pociones la misma noche. Médico: si puede salvarse a sí mismo.
- Si el turno de un rol muerto se sigue anunciando para no dar pistas.
- Si los turnos de noche avanzan solos cuando el rol actúa o los avanza el creador.
- Enamorados: si saben quién es el otro y cómo ganan si son de bandos distintos.

## Motor (`src/lib/game`)

| Archivo | Qué hace |
|---|---|
| `composition.ts` | Tabla clásica, validación del modo personalizado y resumen para el creador. |
| `deal.ts` | Baraja y reparto (el mismo algoritmo que `iniciar_partida`). |
| `night.ts` | Orden de los turnos de noche y qué ve cada jugador: botón de poder, «Espera tu turno» o «Duerme». |
| `littleGirl.ts` | Espiar de la Niña: dado al 50 % y sin espiar dos noches seguidas. |
| `thief.ts` | Opciones y elección del Ladrón. |
| `victory.ts` | Condiciones de victoria. |
| `visibility.ts` | Vista de «Ver mi rol»: solo la ficha propia y, si es malo, sus compañeros. |
| `events.ts` | Tipos de eventos de Broadcast y comprobación de que no llevan roles. |

Orden de la noche: Ladrón y Cupido (solo la primera
noche), malos (y la Niña durante su turno), Vidente y Bruja.
