const CACHE_NAME = "yogaunnati-pwa-v3";
const APP_SHELL_PATHS = [
  "",
  "index.html",
  "progress.html",
  "milestones.html",
  "community.html",
  "profile.html",
  "auth.html",
  "manifest.webmanifest",
  "css/styles.css",
  "js/supabaseClient.js",
  "js/practiceData.js",
  "js/profileData.js",
  "js/pageTransition.js",
  "js/pwa.js",
  "js/main.js",
  "js/progress.js",
  "js/milestones.js",
  "js/communityBoard.js",
  "js/community.js",
  "js/auth.js",
  "images/logo.png",
  "images/pwa-192.png",
  "images/pwa-512.png",
  "images/apple-touch-icon.png"
];

function getBaseUrl() {
  return new URL(self.registration.scope);
}

function toScopedUrl(pathname) {
  return new URL(pathname, getBaseUrl()).toString();
}

const APP_SHELL = APP_SHELL_PATHS.map((pathname) => toScopedUrl(pathname));

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
  const baseUrl = getBaseUrl();

  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (!requestUrl.pathname.startsWith(baseUrl.pathname)) {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return networkResponse;
        })
        .catch(() =>
          caches.match(event.request).then((cachedPage) => {
            if (cachedPage) {
              return cachedPage;
            }

            return caches.match(toScopedUrl("index.html"));
          })
        )
    );
    return;
  }

  const isImageAsset =
    requestUrl.pathname.endsWith(".svg") ||
    requestUrl.pathname.endsWith(".png") ||
    requestUrl.pathname.endsWith(".jpg") ||
    requestUrl.pathname.endsWith(".jpeg") ||
    requestUrl.pathname.endsWith(".webp");

  const isCoreAsset =
    requestUrl.pathname.endsWith(".js") ||
    requestUrl.pathname.endsWith(".css") ||
    requestUrl.pathname.endsWith(".html") ||
    requestUrl.pathname.endsWith(".webmanifest");

  if (isImageAsset) {
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
    return;
  }

  if (isCoreAsset) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
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
