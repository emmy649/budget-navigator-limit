// public/sw.js
const CACHE = "budget-nav-v3"; // ↑ увеличавай при промени
const BASE = self.location.pathname.replace(/sw\.js$/, "");

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll([
      `${BASE}`,
      `${BASE}index.html`,
      `${BASE}manifest.webmanifest`,
      `${BASE}icons/icon-192.png`,
      `${BASE}icons/icon-512.png`,
    ]);
  })());
  self.skipWaiting(); // новият SW става "waiting" веднага
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k === CACHE ? null : caches.delete(k))));
    if ("navigationPreload" in self.registration) {
      await self.registration.navigationPreload.enable();
    }
    await self.clients.claim();
  })());
});

// слушаме "SKIP_WAITING" от приложението (бутон „Обнови“)
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((r) => { if (r && r.status === 200) cache.put(request, r.clone()); return r; })
    .catch(() => null);
  return cached || fetchPromise;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const preload = await event.preloadResponse;
        if (preload) return preload;
        return await fetch(req);
      } catch {
        const cache = await caches.open(CACHE);
        return (await cache.match(`${BASE}index.html`)) || Response.error();
      }
    })());
    return;
  }

  const url = new URL(req.url);
  const isStatic = url.pathname.startsWith(`${BASE}assets/`) ||
    [".js",".css",".woff",".woff2",".ttf",".png",".svg",".jpg",".jpeg",".webp"].some(ext => url.pathname.endsWith(ext));

  if (isStatic) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  event.respondWith((async () => {
    try {
      const resp = await fetch(req);
      if (resp && resp.status === 200) {
        const cache = await caches.open(CACHE);
        cache.put(req, resp.clone());
      }
      return resp;
    } catch {
      const cached = await caches.match(req);
      return cached || Response.error();
    }
  })());
});
