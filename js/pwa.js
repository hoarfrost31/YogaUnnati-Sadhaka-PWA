if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    let hasRefreshedForUpdate = false;

    navigator.serviceWorker.register("sw.js").then((registration) => {
      registration.update().catch(() => {});

      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (hasRefreshedForUpdate) {
          return;
        }

        hasRefreshedForUpdate = true;
        window.location.reload();
      });
    }).catch((error) => {
      console.error("Service worker registration failed:", error);
    });
  });
}

window.pwaNotifications = {
  getAssetUrl(pathname) {
    return new URL(pathname, window.location.href).toString();
  },
  isStandalone() {
    return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
  },
  isSupported() {
    return "Notification" in window;
  },
  getPermission() {
    if (!("Notification" in window)) {
      return "unsupported";
    }

    return Notification.permission;
  },
  async requestPermission() {
    if (!("Notification" in window)) {
      return "unsupported";
    }

    return Notification.requestPermission();
  },
  async sendTestNotification(messageOverride = "") {
    if (!("Notification" in window) || Notification.permission !== "granted") {
      return false;
    }

    let registration = null;

    try {
      registration = await navigator.serviceWorker?.ready;
    } catch (error) {
      console.error("Service worker not ready for notification:", error);
    }

    const title = "YogaUnnati";
    const options = {
      body: messageOverride || "Your reminder preview is ready.",
      icon: this.getAssetUrl("images/pwa-192.png"),
      tag: "yogaunnati-test-notification",
      data: {
        url: this.getAssetUrl("profile.html"),
      },
    };

    if (registration?.showNotification) {
      try {
        await registration.showNotification(title, {
          ...options,
          badge: this.getAssetUrl("images/pwa-192.png"),
        });
        return true;
      } catch (error) {
        console.error("Service worker notification failed:", error);
      }
    }

    try {
      new Notification(title, options);
      return true;
    } catch (error) {
      console.error("Direct notification failed:", error);
      throw error;
    }
  },
};
