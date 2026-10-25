// Genera los avatares ilustrados de los roles en public/avatares/.
// Son dibujos originales de este proyecto, sin iconos de terceros, y se
// publican como CC0 1.0 (dominio público).
// Uso: node scripts/generar-avatares.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'avatares');

const SKIN = '#f1c9a5';
const SKIN_SHADE = '#d9a77f';
const INK = '#1b1424';

// ── Piezas comunes ─────────────────────────────────────────────

function svg(label, defs, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="${label}">
<!-- Ilustración original de Hombres lobo online (CC0 1.0, dominio público) -->
<defs>
<clipPath id="c"><circle cx="128" cy="128" r="124"/></clipPath>
${defs}
</defs>
<g clip-path="url(#c)">
${body}
</g>
<circle cx="128" cy="128" r="122" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="5"/>
<circle cx="128" cy="128" r="125" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="2"/>
</svg>
`;
}

function radial(id, inner, outer) {
  return `<radialGradient id="${id}" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="${inner}"/><stop offset="1" stop-color="${outer}"/></radialGradient>`;
}

function glow(id, color) {
  return `<radialGradient id="${id}"><stop offset="0" stop-color="${color}" stop-opacity=".9"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`;
}

/** Fondo nocturno de Castronegro: cielo, luna y tejados. */
function nightSky(top, bottom, moon = true) {
  return `<rect width="256" height="256" fill="url(#bg)"/>
${moon ? '<circle cx="202" cy="58" r="18" fill="#fdf3c7" opacity=".85"/><circle cx="202" cy="58" r="30" fill="#fdf3c7" opacity=".08"/>' : ''}
<g fill="#fff" opacity=".7"><circle cx="40" cy="50" r="1.6"/><circle cx="70" cy="28" r="1.2"/><circle cx="150" cy="30" r="1.4"/><circle cx="226" cy="110" r="1.2"/><circle cx="30" cy="110" r="1.1"/></g>
<path d="M0 200 L20 186 L34 196 L52 176 L70 194 L90 182 L110 196 L130 184 L150 198 L172 178 L190 194 L210 182 L230 196 L256 184 V256 H0Z" fill="${bottom}" opacity=".85"/>`;
}

/** Fondo espacial de Alien: estrellas y rejilla de la nave. */
function space(alarm = false) {
  return `<rect width="256" height="256" fill="url(#bg)"/>
<g stroke="${alarm ? '#fca5a5' : '#6ee7b7'}" stroke-opacity=".12" stroke-width="1">
<path d="M0 64H256M0 128H256M0 192H256M64 0V256M128 0V256M192 0V256"/>
</g>
<g fill="#fff" opacity=".8"><circle cx="34" cy="44" r="1.5"/><circle cx="210" cy="36" r="1.2"/><circle cx="62" cy="96" r="1"/><circle cx="222" cy="98" r="1.6"/><circle cx="150" cy="22" r="1"/></g>`;
}

function shoulders(color, shade) {
  return `<path d="M28 262 C30 206 70 184 128 184 C186 184 226 206 228 262Z" fill="${color}"/>
<path d="M128 184 C108 184 92 186 80 190 C96 206 112 214 128 214 C144 214 160 206 176 190 C164 186 148 184 128 184Z" fill="${shade}"/>`;
}

function head(skin = SKIN, shade = SKIN_SHADE) {
  return `<rect x="112" y="150" width="32" height="44" rx="12" fill="${shade}"/>
<ellipse cx="86" cy="122" rx="9" ry="12" fill="${shade}"/>
<ellipse cx="170" cy="122" rx="9" ry="12" fill="${shade}"/>
<ellipse cx="128" cy="116" rx="42" ry="48" fill="${skin}"/>`;
}

function face({ eyes = 'open', mouth = 'smile', blush = true, y = 0 } = {}) {
  const ey = 118 + y;
  let e;
  if (eyes === 'closed') {
    e = `<path d="M104 ${ey} q8 6 16 0M136 ${ey} q8 6 16 0" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>`;
  } else if (eyes === 'narrow') {
    e = `<path d="M103 ${ey - 2} l17 4M153 ${ey - 2} l-17 4" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
<circle cx="112" cy="${ey + 4}" r="4.5" fill="${INK}"/><circle cx="144" cy="${ey + 4}" r="4.5" fill="${INK}"/>`;
  } else {
    e = `<ellipse cx="112" cy="${ey}" rx="5.5" ry="7" fill="${INK}"/><ellipse cx="144" cy="${ey}" rx="5.5" ry="7" fill="${INK}"/>
<circle cx="114" cy="${ey - 3}" r="2" fill="#fff"/><circle cx="146" cy="${ey - 3}" r="2" fill="#fff"/>`;
  }
  const my = 142 + y;
  const m = {
    smile: `<path d="M116 ${my} q12 10 24 0" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>`,
    flat: `<path d="M118 ${my + 2} h20" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>`,
    smirk: `<path d="M116 ${my + 2} q14 4 24 -6" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>`,
    open: `<path d="M118 ${my} q10 12 20 0z" fill="${INK}"/>`,
  }[mouth];
  const b = blush
    ? `<ellipse cx="100" cy="${136 + y}" rx="8" ry="5" fill="#f87171" opacity=".35"/><ellipse cx="156" cy="${136 + y}" rx="8" ry="5" fill="#f87171" opacity=".35"/>`
    : '';
  return `${b}${e}${m}`;
}

// ── Castronegro ───────────────────────────────────────────────

const VILLAGE_BG = radial('bg', '#33406b', '#121729');
const WOLF_BG = radial('bg', '#7a1f1f', '#1d0808');

const castronegro = {
  werewolf: svg(
    'Hombre lobo',
    `${WOLF_BG}${glow('eye', '#facc15')}`,
    `${nightSky('#7a1f1f', '#140404')}
<circle cx="128" cy="104" r="78" fill="#fde68a" opacity=".16"/>
<path d="M30 262 C36 200 74 176 128 176 C182 176 220 200 226 262Z" fill="#4b4453"/>
<path d="M70 70 L86 10 L112 58Z" fill="#5d5566"/><path d="M186 70 L170 10 L144 58Z" fill="#5d5566"/>
<path d="M80 60 L88 26 L104 56Z" fill="#c084fc" opacity=".25"/><path d="M176 60 L168 26 L152 56Z" fill="#c084fc" opacity=".25"/>
<path d="M58 120 C58 66 92 44 128 44 C164 44 198 66 198 120 C198 150 186 176 168 190 L128 214 L88 190 C70 176 58 150 58 120Z" fill="#6b6375"/>
<path d="M58 120 L40 138 L66 140 L52 160 L80 158Z M198 120 L216 138 L190 140 L204 160 L176 158Z" fill="#6b6375"/>
<path d="M100 124 C100 150 108 170 128 176 C148 170 156 150 156 124 C146 118 110 118 100 124Z" fill="#9a91a3"/>
<path d="M104 176 C112 196 144 196 152 176 L148 168 L140 176 L134 166 L128 176 L122 166 L116 176 L108 168Z" fill="#2a2430"/>
<path d="M112 168 l4 10 l4 -10M136 168 l4 10 l4 -10" fill="#f8fafc"/>
<ellipse cx="128" cy="150" rx="13" ry="9" fill="#1b1424"/>
<circle cx="102" cy="106" r="16" fill="url(#eye)"/><circle cx="154" cy="106" r="16" fill="url(#eye)"/>
<path d="M88 104 L114 100 L108 114Z" fill="#facc15"/><path d="M168 104 L142 100 L148 114Z" fill="#facc15"/>
<path d="M102 102 v10M154 102 v10" stroke="#1b1424" stroke-width="3.5" stroke-linecap="round"/>
<path d="M86 92 L114 98M170 92 L142 98" stroke="#2a2430" stroke-width="5" stroke-linecap="round"/>`,
  ),

  villager: svg(
    'Aldeano',
    VILLAGE_BG,
    `${nightSky('#33406b', '#0b0f1c')}
${shoulders('#8a5a34', '#6e4426')}
<path d="M96 192 L128 236 L160 192" fill="none" stroke="#e7d3a8" stroke-width="6" stroke-linejoin="round"/>
${head()}
<path d="M86 112 C84 74 104 62 128 62 C152 62 172 74 170 112 C162 92 150 84 128 84 C106 84 94 92 86 112Z" fill="#7c4a1e"/>
<path d="M66 92 C70 70 96 54 128 54 C160 54 186 70 190 92 C170 84 150 80 128 80 C106 80 86 84 66 92Z" fill="#d6b36a"/>
<path d="M86 68 C96 40 160 40 170 68 C150 62 106 62 86 68Z" fill="#c9a258"/>
<path d="M74 88 C96 80 160 80 182 88" stroke="#8b6b2e" stroke-width="3" fill="none"/>
${face()}`,
  ),

  seer: svg(
    'Vidente',
    `${radial('bg', '#4c3a7a', '#151027')}${glow('orb', '#a5f3fc')}`,
    `${nightSky('#4c3a7a', '#0d0a1a')}
<path d="M22 262 C26 196 66 168 128 168 C190 168 230 196 234 262Z" fill="#5b3d99"/>
<path d="M60 150 C52 70 92 34 128 34 C164 34 204 70 196 150 C188 176 178 190 168 196 L88 196 C78 190 68 176 60 150Z" fill="#6d4bb3"/>
<path d="M128 34 C164 34 204 70 196 150 C190 120 170 82 128 78 C86 82 66 120 60 150 C52 70 92 34 128 34Z" fill="#7f5cc8"/>
<ellipse cx="128" cy="124" rx="38" ry="44" fill="${SKIN}"/>
<path d="M90 110 C96 84 160 84 166 110 C150 98 106 98 90 110Z" fill="#3b2a63" opacity=".55"/>
<g transform="translate(0 4)">${face({ eyes: 'closed', mouth: 'flat', blush: false })}</g>
<circle cx="128" cy="96" r="5" fill="#a5f3fc"/>
<circle cx="128" cy="218" r="56" fill="url(#orb)"/>
<circle cx="128" cy="218" r="32" fill="#67e8f9" opacity=".85"/>
<circle cx="128" cy="218" r="32" fill="none" stroke="#ecfeff" stroke-width="2" opacity=".8"/>
<path d="M112 206 a18 18 0 0 1 14 -10" stroke="#fff" stroke-width="4" stroke-linecap="round" fill="none"/>
<path d="M88 236 C96 226 108 224 116 232M168 236 C160 226 148 224 140 232" stroke="${SKIN}" stroke-width="10" stroke-linecap="round" fill="none"/>`,
  ),

  witch: svg(
    'Bruja',
    `${radial('bg', '#2f5a4a', '#0c1a15')}${glow('pot', '#86efac')}`,
    `${nightSky('#2f5a4a', '#08110d')}
${shoulders('#3b2752', '#2a1b3b')}
${head('#e9d2b4', '#cdb08c')}
<path d="M82 112 C70 140 72 176 84 196 L94 140Z M174 112 C186 140 184 176 172 196 L162 140Z" fill="#c2410c"/>
<path d="M54 88 C82 74 174 74 202 88 C184 98 72 98 54 88Z" fill="#2a1b3b"/>
<path d="M78 84 C96 54 118 26 150 4 C146 30 160 52 178 84 C150 92 106 92 78 84Z" fill="#3b2752"/>
<path d="M150 4 C164 10 176 22 186 18 C176 34 164 30 156 26Z" fill="#3b2752"/>
<path d="M82 80 C110 86 148 86 174 80 L176 70 C148 76 110 76 80 70Z" fill="#a855f7"/>
<rect x="120" y="68" width="16" height="16" rx="2" fill="none" stroke="#fde68a" stroke-width="3"/>
${face({ eyes: 'narrow', mouth: 'smirk' })}
<path d="M124 132 q4 6 8 0" fill="none" stroke="${SKIN_SHADE}" stroke-width="3" stroke-linecap="round"/>
<g transform="translate(-10 -26)"><circle cx="190" cy="214" r="44" fill="url(#pot)"/>
<path d="M182 186 h16 v14 c14 6 22 18 22 30 c0 18 -14 30 -30 30 s-30 -12 -30 -30 c0 -12 8 -24 22 -30Z" fill="#bbf7d0" opacity=".35" stroke="#ecfdf5" stroke-width="2.5"/>
<path d="M162 232 c0 14 12 26 28 26 s28 -12 28 -26 c-10 6 -46 6 -56 0Z" fill="#4ade80"/>
<rect x="178" y="180" width="24" height="8" rx="3" fill="#92400e"/>
<circle cx="184" cy="226" r="3" fill="#ecfdf5"/><circle cx="196" cy="216" r="2" fill="#ecfdf5"/></g>`,
  ),

  hunter: svg(
    'Cazador',
    VILLAGE_BG,
    `${nightSky('#33406b', '#0b0f1c')}
<path d="M196 262 L214 40" stroke="#57534e" stroke-width="10" stroke-linecap="round"/>
<path d="M200 190 L208 96" stroke="#78350f" stroke-width="16" stroke-linecap="round"/>
${shoulders('#4d6b3a', '#3a5229')}
<path d="M60 226 L196 196" stroke="#78350f" stroke-width="8"/>
${head()}
<path d="M86 116 C86 136 92 150 98 156 C94 140 94 126 96 116Z M170 116 C170 136 164 150 158 156 C162 140 162 126 160 116Z" fill="#6b3f1d"/>
<path d="M110 150 C116 160 140 160 146 150 C142 166 114 166 110 150Z" fill="#6b3f1d"/>
<path d="M76 92 C80 60 104 50 128 50 C152 50 176 60 180 92Z" fill="#3f5a2e"/>
<path d="M64 94 C90 84 166 84 192 94 C186 102 70 102 64 94Z" fill="#2f4522"/>
<path d="M150 64 C170 38 196 30 206 26 C196 44 180 58 158 72Z" fill="#dc2626"/>
<path d="M152 66 C172 46 192 36 206 26" stroke="#7f1d1d" stroke-width="2" fill="none"/>
${face({ eyes: 'narrow', mouth: 'flat', blush: false })}`,
  ),

  cupid: svg(
    'Cupido',
    `${radial('bg', '#9d3b6b', '#2a0c1e')}`,
    `${nightSky('#9d3b6b', '#1f0816')}
<path d="M40 150 C10 120 16 80 40 70 C44 100 60 120 84 140Z" fill="#fff" opacity=".9"/>
<path d="M216 150 C246 120 240 80 216 70 C212 100 196 120 172 140Z" fill="#fff" opacity=".9"/>
<path d="M44 140 C28 120 30 98 40 88M212 140 C228 120 226 98 216 88" stroke="#fbcfe8" stroke-width="3" fill="none"/>
${shoulders('#fbcfe8', '#f9a8d4')}
${head()}
<g fill="#fbbf24"><circle cx="96" cy="84" r="16"/><circle cx="116" cy="70" r="17"/><circle cx="140" cy="70" r="17"/><circle cx="160" cy="84" r="16"/><circle cx="88" cy="104" r="12"/><circle cx="168" cy="104" r="12"/></g>
<g fill="#f59e0b"><circle cx="106" cy="78" r="6"/><circle cx="150" cy="78" r="6"/></g>
${face({ mouth: 'open' })}
<path d="M70 222 C110 200 146 200 186 222" stroke="#facc15" stroke-width="6" fill="none" stroke-linecap="round"/>
<path d="M60 246 L190 206" stroke="#78350f" stroke-width="4"/>
<path d="M200 204 c-6 -10 -20 -4 -14 6 l10 10 l10 -10 c6 -10 -8 -16 -14 -6" fill="#ef4444" transform="translate(-6 -6)"/>
<path d="M60 246 l-10 -2 l4 8z M60 246 l-4 -10 l-6 6z" fill="#fde68a"/>`,
  ),

  little_girl: svg(
    'Niña',
    VILLAGE_BG,
    `${nightSky('#33406b', '#0b0f1c')}
<path d="M24 262 C28 194 70 160 128 160 C186 160 228 194 232 262Z" fill="#b91c1c"/>
<path d="M58 154 C46 76 88 40 128 40 C168 40 210 76 198 154 C190 176 176 190 168 198 L88 198 C80 190 66 176 58 154Z" fill="#dc2626"/>
<path d="M128 40 C168 40 210 76 198 154 C192 120 172 82 128 80 C84 82 64 120 58 154 C46 76 88 40 128 40Z" fill="#ef4444"/>
<ellipse cx="128" cy="126" rx="38" ry="42" fill="${SKIN}"/>
<path d="M90 120 C88 92 106 82 128 82 C150 82 168 92 166 120 C156 104 146 100 128 100 C110 100 100 104 90 120Z" fill="#a16207"/>
<path d="M92 136 C86 160 86 182 94 200 M164 136 C170 160 170 182 162 200" stroke="#a16207" stroke-width="12" stroke-linecap="round" fill="none"/>
<circle cx="94" cy="202" r="6" fill="#fde047"/><circle cx="162" cy="202" r="6" fill="#fde047"/>
<g transform="translate(0 8)">
<ellipse cx="112" cy="118" rx="7" ry="9" fill="${INK}"/><ellipse cx="144" cy="118" rx="7" ry="9" fill="${INK}"/>
<circle cx="115" cy="114" r="2.6" fill="#fff"/><circle cx="147" cy="114" r="2.6" fill="#fff"/>
<ellipse cx="128" cy="142" rx="5" ry="6" fill="${INK}"/>
<ellipse cx="100" cy="134" rx="8" ry="5" fill="#f87171" opacity=".4"/><ellipse cx="156" cy="134" rx="8" ry="5" fill="#f87171" opacity=".4"/>
</g>`,
  ),

  thief: svg(
    'Ladrón',
    `${radial('bg', '#3f3f46', '#111114')}`,
    `${nightSky('#3f3f46', '#09090b')}
<path d="M24 262 C28 194 70 164 128 164 C186 164 228 194 232 262Z" fill="#27272a"/>
<path d="M60 150 C50 72 90 38 128 38 C166 38 206 72 196 150 C188 174 176 190 168 196 L88 196 C80 190 68 174 60 150Z" fill="#3f3f46"/>
<ellipse cx="128" cy="124" rx="38" ry="44" fill="${SKIN}"/>
<path d="M90 112 C94 92 162 92 166 112 C154 100 102 100 90 112Z" fill="#18181b" opacity=".6"/>
<path d="M84 108 C100 100 156 100 172 108 L170 130 C156 136 140 132 128 124 C116 132 100 136 86 130Z" fill="#18181b"/>
<path d="M172 112 l16 -6 l-4 12z" fill="#18181b"/>
<ellipse cx="110" cy="117" rx="9" ry="6" fill="${SKIN}"/><ellipse cx="146" cy="117" rx="9" ry="6" fill="${SKIN}"/>
<circle cx="111" cy="117" r="4" fill="${INK}"/><circle cx="147" cy="117" r="4" fill="${INK}"/>
<path d="M114 146 q14 6 26 -6" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>
<g transform="translate(-10 -12)"><circle cx="190" cy="214" r="24" fill="#facc15" stroke="#a16207" stroke-width="4"/>
<path d="M190 202 v24M182 208 q8 -6 14 0 q-14 4 0 10 q-6 6 -14 0" stroke="#a16207" stroke-width="3" fill="none" stroke-linecap="round"/></g>`,
  ),
};

// ── Alien ─────────────────────────────────────────────────────

const SHIP_BG = radial('bg', '#134e4a', '#041312');
const ALARM_BG = radial('bg', '#5b1414', '#0a0303');

function helmetRing(color) {
  return `<path d="M56 196 C70 178 96 172 128 172 C160 172 186 178 200 196" stroke="${color}" stroke-width="10" fill="none" stroke-linecap="round"/>`;
}

const alien = {
  xenomorph: svg(
    'Xenomorfo',
    `${ALARM_BG}${glow('drool', '#a3e635')}`,
    `${space(true)}
<path d="M40 262 C46 214 80 196 120 196 L160 200 C196 206 216 226 220 262Z" fill="#1c1917"/>
<path d="M60 214 C80 204 100 200 120 200M180 210 C196 218 206 230 212 246" stroke="#44403c" stroke-width="4" fill="none"/>
<path d="M70 150 C56 110 74 64 120 52 C170 38 236 40 252 28 C246 64 214 92 180 118 C170 150 160 176 140 196 C112 200 84 186 70 150Z" fill="#1c1917"/>
<path d="M120 52 C170 38 236 40 252 28 C230 52 190 64 150 72 C126 76 104 70 120 52Z" fill="#44403c" opacity=".8"/>
<path d="M90 70 C120 62 160 62 200 56" stroke="#78716c" stroke-width="2.5" fill="none"/>
<path d="M84 90 C112 84 150 84 186 80" stroke="#78716c" stroke-width="2.5" fill="none"/>
<path d="M82 150 C96 170 124 182 150 176 L146 160 C124 164 104 158 92 144Z" fill="#0c0a09"/>
<path d="M92 146 l6 10 l4 -12 l6 12 l5 -12 l6 12 l5 -12 l6 12 l5 -12 l6 10" fill="none" stroke="#e7e5e4" stroke-width="3" stroke-linejoin="round"/>
<path d="M98 170 l5 -10 l5 10 l5 -10 l5 10 l5 -10 l5 10 l5 -10 l5 10" fill="none" stroke="#e7e5e4" stroke-width="3" stroke-linejoin="round"/>
<path d="M116 178 C116 196 112 210 118 222" stroke="#a3e635" stroke-width="4" stroke-linecap="round" fill="none"/>
<circle cx="118" cy="226" r="10" fill="url(#drool)"/><circle cx="118" cy="224" r="4" fill="#bef264"/>
<path d="M74 118 C90 108 120 108 150 116" stroke="#57534e" stroke-width="3" fill="none"/>`,
  ),

  crew_member: svg(
    'Tripulante',
    SHIP_BG,
    `${space()}
${shoulders('#ea580c', '#c2410c')}
<rect x="88" y="206" width="30" height="14" rx="3" fill="#fef3c7"/>
<path d="M92 213 h22" stroke="#c2410c" stroke-width="3"/>
${helmetRing('#d6d3d1')}
${head()}
<path d="M86 110 C82 74 104 60 128 60 C152 60 174 74 170 110 C164 88 146 80 128 80 C108 80 92 88 86 110Z" fill="#292524"/>
<path d="M78 120 C78 88 98 72 128 72 C158 72 178 88 178 120" stroke="#57534e" stroke-width="6" fill="none"/>
<rect x="70" y="110" width="16" height="26" rx="6" fill="#44403c"/>
<path d="M78 136 C78 150 92 156 106 150" stroke="#44403c" stroke-width="4" fill="none" stroke-linecap="round"/>
<circle cx="108" cy="150" r="4" fill="#22c55e"/>
${face()}`,
  ),

  scientist: svg(
    'Científico',
    `${SHIP_BG}${glow('tube', '#38bdf8')}`,
    `${space()}
${shoulders('#f5f5f4', '#d6d3d1')}
<path d="M128 186 L104 262M128 186 L152 262" stroke="#a8a29e" stroke-width="3"/>
<path d="M112 186 L128 212 L144 186" fill="#1e3a8a"/>
<rect x="160" y="212" width="20" height="5" rx="2" fill="#2563eb"/>
${head()}
<path d="M84 112 C76 76 98 56 128 56 C160 56 182 76 172 112 C170 96 164 90 160 88 C150 98 110 98 96 88 C92 92 86 100 84 112Z" fill="#9ca3af"/>
<path d="M90 78 C100 60 116 54 128 56 C120 62 112 72 110 86Z" fill="#d1d5db"/>
<circle cx="112" cy="118" r="14" fill="#e0f2fe" fill-opacity=".35" stroke="${INK}" stroke-width="3.5"/>
<circle cx="144" cy="118" r="14" fill="#e0f2fe" fill-opacity=".35" stroke="${INK}" stroke-width="3.5"/>
<path d="M126 118 h4" stroke="${INK}" stroke-width="3.5"/>
${face({ mouth: 'flat', blush: false })}
<g transform="translate(10 -6)"><circle cx="66" cy="208" r="40" fill="url(#tube)"/>
<path d="M58 168 h16 v62 a8 8 0 0 1 -16 0Z" fill="#e0f2fe" fill-opacity=".3" stroke="#f0f9ff" stroke-width="3"/>
<path d="M60 202 h12 v28 a6 6 0 0 1 -12 0Z" fill="#38bdf8"/>
<circle cx="66" cy="196" r="3" fill="#bae6fd"/><circle cx="68" cy="186" r="2" fill="#bae6fd"/></g>`,
  ),

  medic: svg(
    'Médico',
    SHIP_BG,
    `${space()}
${shoulders('#e2e8f0', '#cbd5e1')}
<path d="M98 190 C88 220 100 240 128 240 C156 240 168 220 158 190" stroke="#334155" stroke-width="5" fill="none"/>
<circle cx="128" cy="242" r="9" fill="#94a3b8" stroke="#334155" stroke-width="4"/>
${head()}
<path d="M84 104 C80 70 104 56 128 56 C152 56 176 70 172 104 C160 94 96 94 84 104Z" fill="#7c2d12"/>
<path d="M82 92 C84 58 108 44 128 44 C148 44 172 58 174 92 C150 84 106 84 82 92Z" fill="#f8fafc"/>
<rect x="118" y="54" width="20" height="22" rx="2" fill="#16a34a"/>
<rect x="108" y="58" width="40" height="14" rx="2" fill="#16a34a"/>
<path d="M128 58 v14M121 65 h14" stroke="#f8fafc" stroke-width="3"/>
${face()}`,
  ),

  marine: svg(
    'Marine',
    SHIP_BG,
    `${space()}
<path d="M24 262 C28 204 66 180 128 180 C190 180 228 204 232 262Z" fill="#3f6212"/>
<path d="M52 214 C70 196 98 190 128 190 C158 190 186 196 204 214 L196 246 L60 246Z" fill="#4d7c0f"/>
<path d="M72 214 h112" stroke="#365314" stroke-width="4"/>
<rect x="98" y="222" width="18" height="12" rx="2" fill="#365314"/><rect x="140" y="222" width="18" height="12" rx="2" fill="#365314"/>
${head('#d9a77f', '#b98660')}
<path d="M72 120 C68 70 96 44 128 44 C160 44 188 70 184 120 L176 124 C174 92 156 72 128 72 C100 72 82 92 80 124Z" fill="#4d7c0f"/>
<path d="M72 96 C96 84 160 84 184 96" stroke="#365314" stroke-width="4" fill="none"/>
<rect x="88" y="98" width="80" height="18" rx="6" fill="#0f172a" opacity=".85"/>
<path d="M94 104 h30" stroke="#22d3ee" stroke-width="3" stroke-linecap="round" opacity=".8"/>
<rect x="172" y="104" width="10" height="20" rx="3" fill="#365314"/>
<circle cx="177" cy="100" r="3" fill="#ef4444"/>
${face({ eyes: 'narrow', mouth: 'flat', blush: false, y: 6 })}`,
  ),

  android: svg(
    'Androide',
    `${SHIP_BG}${glow('eye', '#22d3ee')}`,
    `${space()}
${shoulders('#e7e5e4', '#a8a29e')}
<path d="M70 210 h40M146 210 h40" stroke="#78716c" stroke-width="3"/>
<rect x="112" y="150" width="32" height="44" rx="10" fill="#a8a29e"/>
<path d="M118 158 v28M128 158 v28M138 158 v28" stroke="#57534e" stroke-width="2"/>
<ellipse cx="128" cy="116" rx="42" ry="48" fill="${SKIN}"/>
<path d="M128 68 C152 68 170 84 170 116 C170 148 152 164 128 164Z" fill="#e7e5e4"/>
<path d="M128 68 v96" stroke="#57534e" stroke-width="2"/>
<path d="M136 86 h18 v14 h10M140 140 h16 v-12 h8M134 156 h12" stroke="#06b6d4" stroke-width="2.5" fill="none"/>
<circle cx="164" cy="100" r="3" fill="#06b6d4"/><circle cx="164" cy="128" r="3" fill="#06b6d4"/>
<path d="M86 112 C82 76 104 62 128 62 L128 84 C110 84 96 92 86 112Z" fill="#fafaf9"/>
<ellipse cx="112" cy="118" rx="5.5" ry="7" fill="${INK}"/><circle cx="114" cy="115" r="2" fill="#fff"/>
<circle cx="144" cy="118" r="14" fill="url(#eye)"/><circle cx="144" cy="118" r="6" fill="#67e8f9"/>
<path d="M116 142 h12" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/><path d="M128 142 h10" stroke="#06b6d4" stroke-width="3.5" stroke-linecap="round"/>`,
  ),
};

// ── Alcalde (común a todas las temáticas) ─────────────────────

const alcalde = svg(
  'Alcalde',
  `${radial('bg', '#8a6a1f', '#1f1607')}`,
  `<rect width="256" height="256" fill="url(#bg)"/>
<g fill="#fde68a" opacity=".5"><circle cx="40" cy="60" r="2"/><circle cx="214" cy="54" r="2"/><circle cx="60" cy="30" r="1.4"/><circle cx="200" cy="100" r="1.4"/></g>
${shoulders('#1e3a8a', '#172554')}
<path d="M64 206 L192 262" stroke="#dc2626" stroke-width="26"/>
<path d="M64 206 L192 262" stroke="#facc15" stroke-width="8"/>
${head()}
<path d="M86 104 C84 74 104 60 128 60 C152 60 172 74 170 104 C160 88 96 88 86 104Z" fill="#78716c"/>
<path d="M96 146 C108 136 120 138 128 144 C136 138 148 136 160 146 C150 150 138 150 128 146 C118 150 106 150 96 146Z" fill="#57534e"/>
${face({ mouth: 'smile', blush: true, y: -2 })}
<path d="M86 60 L94 22 L112 44 L128 14 L144 44 L162 22 L170 60Z" fill="#facc15" stroke="#a16207" stroke-width="3" stroke-linejoin="round"/>
<circle cx="128" cy="40" r="5" fill="#dc2626"/><circle cx="102" cy="48" r="3.5" fill="#2563eb"/><circle cx="154" cy="48" r="3.5" fill="#2563eb"/>
<path d="M98 190 C104 206 118 214 128 214 C138 214 152 206 158 190" stroke="#facc15" stroke-width="4" fill="none"/>
<circle cx="128" cy="220" r="12" fill="#facc15" stroke="#a16207" stroke-width="3"/>`,
);

function write(path, content) {
  const file = join(OUT, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

for (const [id, content] of Object.entries(castronegro)) write(`castronegro/${id}.svg`, content);
for (const [id, content] of Object.entries(alien)) write(`alien/${id}.svg`, content);
write('alcalde.svg', alcalde);
console.log('Avatares generados en', OUT);
