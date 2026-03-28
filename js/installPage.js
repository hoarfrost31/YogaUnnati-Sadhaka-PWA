(function installPageSetup() {
  const installButton = document.getElementById("installAppBtn");
  const helpButton = document.getElementById("installHelpBtn");
  const helpCard = document.getElementById("installHelpCard");
  const helpClose = document.getElementById("installHelpClose");
  const guideVisual = document.getElementById("installGuideVisual");
  const pathName = window.location.pathname || "";
  const searchParams = new URLSearchParams(window.location.search || "");
  const previewMode = (searchParams.get("preview") || "").toLowerCase();
  const isIosPage = /install-ios\.html$/i.test(pathName);
  const isDefaultInstallPage = /install\.html$/i.test(pathName) || /\/install$/i.test(pathName);

  if (!installButton) {
    return;
  }

  let deferredInstallPrompt = null;

  function isIos() {
    return /iphone|ipad|ipod/i.test(window.navigator.userAgent || "");
  }

  function isStandalone() {
    return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
  }

  function routeByPlatform() {
    if (isStandalone() || previewMode === "ios" || previewMode === "android") {
      return;
    }

    if (isIos() && isDefaultInstallPage) {
      window.location.replace("install-ios.html");
      return;
    }

    if (!isIos() && isIosPage) {
      window.location.replace("install.html");
    }
  }

  function setInstalledState() {
    installButton.textContent = "App";
  }

  function setIosState() {
    installButton.textContent = "How to Install";
  }

  function setInstallState() {
    installButton.textContent = "Install YogaUnnati";
  }

  function refreshButtonState() {
    if (isStandalone()) {
      setInstalledState();
      return;
    }

    if (isIosPage || isIos()) {
      setIosState();
      return;
    }

    setInstallState();
  }

  function hideHelp() {
    helpCard?.classList.add("hidden");
  }

  function showHelp() {
    helpCard?.classList.remove("hidden");
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    refreshButtonState();
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    setInstalledState();
    hideHelp();
  });

  installButton.addEventListener("click", async () => {
    if (isStandalone()) {
      window.location.href = "auth.html";
      return;
    }

    if (isIosPage || isIos()) {
      guideVisual?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();

      try {
        await deferredInstallPrompt.userChoice;
      } catch (_error) {
        // Ignore dismissal errors.
      }

      deferredInstallPrompt = null;
      refreshButtonState();
      return;
    }

    showHelp();
  });

  helpButton?.addEventListener("click", showHelp);
  helpClose?.addEventListener("click", hideHelp);

  routeByPlatform();
  refreshButtonState();
})();
