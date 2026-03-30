const CACHE_NAME = "yogaunnati-admin-pwa-v4";
const APP_SHELL_PATHS = [
  "login.html",
  "index.html",
  "members.html",
  "member.html",
  "create-member.html",
  "manifest.webmanifest",
  "../css/styles.css",
  "../js/supabaseClient.js",
  "../js/adminShared.js",
  "../js/adminDashboard.js",
  "../js/adminMembers.js",
  "../js/adminMember.js",
  "../js/adminCreateMember.js",
  "../js/analytics.js",
  "../js/practiceData.js",
  "../js/profileData.js",
  "../js/membershipData.js",
  "../js/pwa.js",
  "../js/pageTransition.js",
  "../js/auth.js",
  "../images/logo.png",
  "../images/pwa-192.png",
  "../images/pwa-512.png",
  "../images/apple-touch-icon.png"
];

function getBaseUrl() {
  return new URL(self.registration.scope);
}

function toScopedUrl(pathname) {
  return new URL(pathname, getBaseUrl()).toString();
}

const APP_SHELL = APP_SHELL_PATHS.map((pathname) => toScopedUrl(pathname));

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(APP_SHELL.map(async (url) => {
      try {
        await cache.add(url);
      } catch (error) {
        console.warn("Admin SW cache add failed:", url, error);
      }
    }));
  })());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("yogaunnati-admin-pwa-") && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("push", (event) => {
  const fallbackPayload = { title: "YogaUnnati Admin", body: "Open the admin panel to review updates." };
  let payload = fallbackPayload;
  try { payload = event.data?.json() || fallbackPayload; } catch (error) { console.error("Push payload parse failed:", error); }
  event.waitUntil(self.registration.showNotification(payload.title || "YogaUnnati Admin", { body: payload.body || fallbackPayload.body, data: payload.data || { url: "./index.html" } }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "./index.html", self.registration.scope).toString();
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
    for (const client of clientList) {
      if (client.url === targetUrl && "focus" in client) return client.focus();
    }
    return clients.openWindow ? clients.openWindow(targetUrl) : null;
  }));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  const baseUrl = getBaseUrl();
  if (requestUrl.origin !== self.location.origin) return;

  if (requestUrl.pathname.startsWith(baseUrl.pathname) && event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).then((networkResponse) => {
      const responseClone = networkResponse.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
      return networkResponse;
    }).catch(() => caches.match(event.request).then((cachedPage) => cachedPage || caches.match(toScopedUrl("login.html")))));
    return;
  }

  const isCacheableAsset = requestUrl.pathname.endsWith('.js') || requestUrl.pathname.endsWith('.css') || requestUrl.pathname.endsWith('.html') || requestUrl.pathname.endsWith('.webmanifest') || requestUrl.pathname.endsWith('.png') || requestUrl.pathname.endsWith('.webp') || requestUrl.pathname.endsWith('.svg') || requestUrl.pathname.endsWith('.jpg') || requestUrl.pathname.endsWith('.jpeg');
  if (!isCacheableAsset) return;

  event.respondWith(caches.match(event.request).then((cachedResponse) => {
    const networkFetch = fetch(event.request).then((networkResponse) => {
      if (networkResponse && networkResponse.status === 200) {
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
      }
      return networkResponse;
    }).catch(() => cachedResponse);
    return cachedResponse || networkFetch;
  }));
});




