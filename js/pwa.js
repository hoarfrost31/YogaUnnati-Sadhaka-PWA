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

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    let hasRefreshedForUpdate = false;

    navigator.serviceWorker.register("sw.js").then((registration) => {
      registration.update().catch(() => {});

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
    const body = messageOverride || "Your reminder preview is ready.";

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
};
