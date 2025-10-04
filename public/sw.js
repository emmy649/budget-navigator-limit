// public/sw.js
const CACHE = "budget-nav-v2";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll([
        "/",                    // app shell
        "/index.html",
        "/manifest.webmanifest",
        "/icons/icon-192.png",
        "/icons/icon-512.png",
      ]);
    })()
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // чистим стари кешове
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k === CACHE ? null : caches.delete(k))));
      // navigation preload ускорение
      if ("navigationPreload" in self.registration) {
        await self.registration.navigationPreload.enable();
      }
      await self.clients.claim();
    })()
  );
});

// helper: stale-while-revalidate за статични активи
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((networkResp) => {
      // кешираме успешните
      if (networkResp && networkResp.status === 200) {
        cache.put(request, networkResp.clone());
      }
      return networkResp;
    })
    .catch(() => null);
  return cached || fetchPromise;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // само GET
  if (req.method !== "GET") return;

  // 1) Навигации (SPA): network-first с fallback към кеширания index.html
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          // navigation preload > мрежа
          const preload = await event.preloadResponse;
          if (preload) return preload;
          const netResp = await fetch(req);
          return netResp;
        } catch (err) {
          // fallback към cached shell
          const cache = await caches.open(CACHE);
          const cachedShell = await cache.match("/index.html");
          return cachedShell || Response.error();
        }
      })()
    );
    return;
  }

  // 2) Статични активи (js, css, шрифтове, изображения): stale-while-revalidate
  const url = new URL(req.url);
  const isStatic =
    url.pathname.startsWith("/assets/") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".woff") ||
    url.pathname.endsWith(".woff2") ||
    url.pathname.endsWith(".ttf") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".jpeg") ||
    url.pathname.endsWith(".webp");

  if (isStatic) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // 3) Всичко останало: network-first с fallback от кеша (ако имаме)
  event.respondWith(
    (async () => {
      try {
        const resp = await fetch(req);
        // кеширай тихо успешни отговори
        if (resp && resp.status === 200) {
          const cache = await caches.open(CACHE);
          cache.put(req, resp.clone());
        }
        return resp;
      } catch {
        const cached = await caches.match(req);
        return cached || Response.error();
      }
    })()
  );
});
