const CACHE_NAME = "yogaunnati-pwa-v106";`r`nconst APP_SHELL_PATHS = [
  "",
  "install.html",
  "install-ios.html",
  "index.html",
  "progress.html",
  "milestones.html",
  "community.html",
  "memberprofile.html",
  "profile-settings.html",
  "membership.html",
  "payment.html",
  "auth.html",
  "admin-login.html",
  "admin.html",
  "admin-members.html",
  "admin-member.html",
  "admin-create-member.html",
  "manifest.webmanifest",
  "css/styles.css",
  "js/supabaseClient.js",
  "js/adminShared.js",
  "js/adminDashboard.js",
  "js/adminMembers.js",
  "js/adminMember.js",
  "js/adminCreateMember.js",
  "js/analytics.js",
  "js/pwaConfig.js",
  "js/practiceData.js",
  "js/profileData.js",
  "js/membershipData.js",
  "js/membershipPage.js",
  "js/paymentPage.js",
  "js/paymentGatewayConfig.js",
  "js/pushSubscriptionData.js",
  "js/pageTransition.js",
  "js/pwa.js",
  "js/main.js",
  "js/progress.js",
  "js/milestones.js",
  "js/communityBoard.js",
  "js/community.js",
  "js/memberProfile.js",
  "js/auth.js",
  "images/logo.png",
  "images/sankalpa.webp",
  "images/sthirata.webp",
  "images/calm.webp",
  "images/ananda.webp",
  "images/install-android.webp",
  "images/install-ios.webp",
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
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(
      APP_SHELL.map(async (url) => {
        try {
          await cache.add(url);
        } catch (error) {
          console.warn("SW cache add failed:", url, error);
        }
      })
    );
  })());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("yogaunnati-pwa-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
      .then(() => clients.matchAll({ type: "window", includeUncontrolled: true }))
      .then((clientList) =>
        Promise.all(
          clientList.map((client) =>
            client.postMessage({
              type: "SW_ACTIVATED",
              cacheName: CACHE_NAME,
            })
          )
        )
      )
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("push", (event) => {
  const fallbackPayload = {
    title: "YogaUnnati",
    body: "Stay on track. See you tomorrow morning.",
  };

  let payload = fallbackPayload;

  try {
    payload = event.data?.json() || fallbackPayload;
  } catch (error) {
    console.error("Push payload parse failed:", error);
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "YogaUnnati", {
      body: payload.body || fallbackPayload.body,
      data: payload.data || { url: "./index.html" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = new URL(event.notification.data?.url || "./index.html", self.registration.scope).toString();

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && "focus" in client) {
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }

      return null;
    })
  );
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













































<<<<<<< HEAD


=======
>>>>>>> parent of ecc1246 (Update home payment reminder copy)

