# Licencias de los avatares

## Castronegro

Los retratos de Castronegro los ha aportado el propietario del proyecto. Están
recortados de una sola lámina, sin la cinta del nombre, y se marcan con `"retrato": true` en `castronegro.json`.

| Archivo | Origen |
|---|---|
| castronegro/werewolf.webp | Lámina de retratos del proyecto |
| castronegro/villager.webp | Lámina de retratos del proyecto |
| castronegro/seer.webp | Lámina de retratos del proyecto |
| castronegro/witch.webp | Lámina de retratos del proyecto |
| castronegro/hunter.webp | Lámina de retratos del proyecto |
| castronegro/cupid.webp | Lámina de retratos del proyecto |
| castronegro/little_girl.webp | Lámina de retratos del proyecto |
| castronegro/thief.webp | Lámina de retratos del proyecto |

## Alien y Alcalde

Son los emojis 3D de [Fluent Emoji](https://github.com/microsoft/fluentui-emoji)
de Microsoft, con licencia MIT (copiada abajo). Los PNG están sin modificar; el
medallón de color de fondo se dibuja con CSS en `src/components/RoleAvatar.tsx`.

| Archivo | Emoji de Fluent |
|---|---|
| alien/xenomorph.png | Alien |
| alien/crew_member.png | Astronaut |
| alien/scientist.png | Scientist |
| alien/medic.png | Health worker |
| alien/marine.png | Military helmet |
| alien/android.png | Robot |
| alcalde.png | Person with crown |

## Licencia de Fluent Emoji

```
MIT License

Copyright (c) Microsoft Corporation.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Fuentes

Las fuentes de los títulos se instalan con npm (`@fontsource`) y se sirven desde
la propia web, sin llamar a Google:

- Cinzel (Castronegro y portada): SIL Open Font License 1.1.
- Orbitron (Alien): SIL Open Font License 1.1.
