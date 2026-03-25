function ensureUpdatePrompt() {
  let prompt = document.getElementById("pwaUpdatePrompt");
  if (prompt) {
    return prompt;
  }

  prompt = document.createElement("div");
  prompt.id = "pwaUpdatePrompt";
  prompt.className = "pwa-update-prompt hidden";
  prompt.innerHTML = `
    <div class="pwa-update-copy">
      <strong>Update available</strong>
      <span>Tap refresh to load the latest version.</span>
    </div>
    <button id="pwaUpdateBtn" class="pwa-update-btn" type="button">Refresh</button>
  `;

  document.body.appendChild(prompt);
  return prompt;
}

function showUpdatePrompt(registration) {
  const prompt = ensureUpdatePrompt();
  const updateBtn = document.getElementById("pwaUpdateBtn");

  prompt.classList.remove("hidden");

  updateBtn.onclick = () => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
      return;
    }

    window.location.reload();
  };
}

document.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

document.addEventListener("selectstart", (event) => {
  if (event.target.closest("input, textarea, [contenteditable='true'], [contenteditable='']")) {
    return;
  }

  event.preventDefault();
});

document.addEventListener("dragstart", (event) => {
  if (event.target instanceof HTMLImageElement) {
    event.preventDefault();
  }
});

document.addEventListener("selectionchange", () => {
  const activeElement = document.activeElement;
  const isEditable =
    activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement ||
    activeElement?.getAttribute?.("contenteditable") === "true" ||
    activeElement?.getAttribute?.("contenteditable") === "";

  if (isEditable) {
    return;
  }

  const selection = window.getSelection?.();
  if (selection && selection.rangeCount > 0 && String(selection).trim()) {
    selection.removeAllRanges();
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    let hasRefreshedForUpdate = false;
    let activeRegistration = null;

    const checkForServiceWorkerUpdate = () => {
      activeRegistration?.update?.().catch(() => {});

      if (activeRegistration?.waiting) {
        showUpdatePrompt(activeRegistration);
      }
    };

    navigator.serviceWorker.register("sw.js").then((registration) => {
      activeRegistration = registration;
      checkForServiceWorkerUpdate();

      if (registration.waiting) {
        showUpdatePrompt(registration);
      }

      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (!newWorker) {
          return;
        }

        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            showUpdatePrompt(registration);
          }
        });
      });

      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (hasRefreshedForUpdate) {
          return;
        }

        hasRefreshedForUpdate = true;
        window.location.reload();
      });

      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type !== "APP_UPDATED" || hasRefreshedForUpdate) {
          return;
        }

        hasRefreshedForUpdate = true;
        window.location.reload();
      });

      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "visible") {
          return;
        }

        checkForServiceWorkerUpdate();
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
  async sendNotification(title = "YogaUnnati", body = "Your reminder is ready.") {
    if (!("Notification" in window) || Notification.permission !== "granted") {
      return false;
    }

    let registration = null;

    try {
      registration = await navigator.serviceWorker?.ready;
    } catch (error) {
      console.error("Service worker not ready for notification:", error);
    }

    if (registration?.showNotification) {
      try {
        await registration.showNotification(title, { body });
        return true;
      } catch (error) {
        console.error("Service worker notification failed:", error);
      }
    }

    try {
      new Notification(title, { body });
      return true;
    } catch (error) {
      console.error("Direct notification failed:", error);
      throw error;
    }
  },
  async sendTestNotification(messageOverride = "") {
    return this.sendNotification("YogaUnnati", messageOverride || "Your reminder preview is ready.");
  },
};
