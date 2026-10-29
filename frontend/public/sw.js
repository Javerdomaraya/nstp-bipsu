const STATIC_CACHE = 'nstp-static-v2';
const DYNAMIC_CACHE = 'nstp-dynamic-v2';
const PUBLIC_API_CACHE = 'nstp-public-api-v1';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/bipsu-logo.png',
  '/nstp-logo.svg',
  '/favicon.ico',
];

const PUBLIC_API_PATHS = new Set([
  '/api/address/provinces',
  '/api/address/municipalities',
  '/api/address/barangays/search',
]);

function isCacheablePublicApiRequest(request, url) {
  return request.method === 'GET'
    && request.credentials === 'omit'
    && !request.headers.has('authorization')
    && PUBLIC_API_PATHS.has(url.pathname);
}

async function clearSensitiveApiCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(cacheNames
    .filter((name) => name.startsWith('nstp-api-'))
    .map((name) => caches.delete(name)));
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await Promise.allSettled(
      STATIC_ASSETS.map(async (asset) => {
        try {
          const res = await fetch(asset, { cache: 'no-cache' });
          if (res.ok) {
            await cache.put(asset, res);
          }
        } catch {
          // Resilient: ignore asset cache failure without crashing installation
        }
      })
    );
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => ![STATIC_CACHE, DYNAMIC_CACHE, PUBLIC_API_CACHE].includes(name))
      .map((name) => caches.delete(name)));
    await clearSensitiveApiCaches();
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'CLEAR_SENSITIVE_CACHES') {
    event.waitUntil(clearSensitiveApiCaches());
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.pathname.startsWith('/api/')) {
    // Authenticated and sensitive API traffic is always network-only.
    event.respondWith(isCacheablePublicApiRequest(request, url)
      ? networkFirstPublicApi(request)
      : networkOnly(request));
    return;
  }

  if (url.origin === self.location.origin && (
    request.destination === 'style'
    || request.destination === 'script'
    || request.destination === 'font'
    || request.destination === 'image'
    || url.pathname.startsWith('/assets/')
  )) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
  }
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(DYNAMIC_CACHE)).put(request, response.clone());
  return response;
}

async function networkFirstPublicApi(request) {
  try {
    const response = await fetch(request);
    if (response.ok) (await caches.open(PUBLIC_API_CACHE)).put(request, response.clone());
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response(JSON.stringify({ offline: true }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function networkOnly(request) {
  try {
    return await fetch(request);
  } catch {
    return new Response(JSON.stringify({ offline: true }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) (await caches.open(DYNAMIC_CACHE)).put(request, response.clone());
    return response;
  } catch {
    return (await caches.match('/index.html')) || new Response('Offline', { status: 503 });
  }
}
