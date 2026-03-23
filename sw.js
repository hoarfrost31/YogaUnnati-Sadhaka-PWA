const CACHE_NAME = "yogaunnati-pwa-v1";
const APP_SHELL = [
  "/",
  "/index.html",
  "/progress.html",
  "/milestones.html",
  "/community.html",
  "/profile.html",
  "/auth.html",
  "/manifest.webmanifest",
  "/css/styles.css",
  "/js/supabaseClient.js",
  "/js/practiceData.js",
  "/js/profileData.js",
  "/js/pageTransition.js",
  "/js/main.js",
  "/js/progress.js",
  "/js/milestones.js",
  "/js/communityBoard.js",
  "/js/community.js",
  "/js/auth.js",
  "/images/logo.png",
  "/images/pwa-192.png",
  "/images/pwa-512.png",
  "/images/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);

  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return networkResponse;
      });
    })
  );
});
