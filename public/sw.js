// Service worker de La Aldea Maldita.
//
// Reglas, a propósito conservadoras:
// - Solo se tocan peticiones GET del propio dominio. Supabase (API, Realtime,
//   Storage) va a otro dominio, así que nunca pasa por aquí ni se cachea.
// - El audio (/audio/) no se intercepta: los <audio> piden rangos (206) y
//   cachearlos rompe la reproducción en Safari. Va directo a la red.
// - Las páginas van primero a la red (son SSR y dependen de la sala); sin
//   conexión se muestra la última copia o la página «sin conexión».
// - Los ficheros de /_astro/ llevan hash en el nombre: caché primero.
// - Imágenes, iconos y fuentes: se sirven de caché y se refrescan detrás.

const VERSION = 'v1';
const CACHE_ESTATICOS = `aldea-estaticos-${VERSION}`;
const CACHE_PAGINAS = `aldea-paginas-${VERSION}`;
const OFFLINE_URL = '/sin-conexion.html';
const PRECACHE = [OFFLINE_URL, '/manifest.webmanifest', '/iconos/icono-192.png', '/favicon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_ESTATICOS)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('aldea-') && k !== CACHE_ESTATICOS && k !== CACHE_PAGINAS)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/audio/') || request.headers.has('range')) return;
  if (url.pathname === '/sw.js') return;

  if (request.mode === 'navigate') {
    event.respondWith(redPrimero(request));
    return;
  }
  if (url.pathname.startsWith('/_astro/')) {
    event.respondWith(cachePrimero(request));
    return;
  }
  if (/\.(?:png|jpe?g|webp|avif|svg|gif|ico|woff2?|webmanifest)$/i.test(url.pathname)) {
    event.respondWith(cacheYRefresco(request, event));
  }
});

async function redPrimero(request) {
  const cache = await caches.open(CACHE_PAGINAS);
  try {
    const respuesta = await fetch(request);
    if (respuesta.ok) cache.put(request, respuesta.clone());
    return respuesta;
  } catch {
    return (await cache.match(request)) || (await caches.match(OFFLINE_URL)) || Response.error();
  }
}

async function cachePrimero(request) {
  const cache = await caches.open(CACHE_ESTATICOS);
  const guardada = await cache.match(request);
  if (guardada) return guardada;
  const respuesta = await fetch(request);
  if (respuesta.ok) cache.put(request, respuesta.clone());
  return respuesta;
}

async function cacheYRefresco(request, event) {
  const cache = await caches.open(CACHE_ESTATICOS);
  const guardada = await cache.match(request);
  const deRed = fetch(request)
    .then((respuesta) => {
      if (respuesta.ok) cache.put(request, respuesta.clone());
      return respuesta;
    })
    .catch(() => undefined);
  if (guardada) {
    event.waitUntil(deRed);
    return guardada;
  }
  return (await deRed) || Response.error();
}
