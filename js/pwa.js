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
  async sendTestNotification() {
    if (!("Notification" in window) || Notification.permission !== "granted") {
      return false;
    }

    const registration = await navigator.serviceWorker?.getRegistration?.();
    const title = "YogaUnnati";
    const options = {
      body: "This is a test reminder for tomorrow's class at 9:00 PM.",
      icon: "images/pwa-192.png",
      badge: "images/pwa-192.png",
      tag: "yogaunnati-test-notification",
      data: {
        url: "./profile.html",
      },
    };

    if (registration?.showNotification) {
      await registration.showNotification(title, options);
      return true;
    }

    new Notification(title, options);
    return true;
  },
};
