(function installPageSetup() {
  const installButton = document.getElementById("installAppBtn");
  const supportCopy = document.getElementById("installSupportCopy");
  const helpCard = document.getElementById("installHelpCard");
  const helpTitle = document.getElementById("installHelpTitle");
  const helpText = document.getElementById("installHelpText");
  const helpClose = document.getElementById("installHelpClose");

  if (!installButton || !supportCopy || !helpCard || !helpTitle || !helpText || !helpClose) {
    return;
  }

  let deferredInstallPrompt = null;

  function isIos() {
    return /iphone|ipad|ipod/i.test(window.navigator.userAgent || "");
  }

  function isAndroid() {
    return /android/i.test(window.navigator.userAgent || "");
  }

  function isStandalone() {
    return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
  }

  function showHelp(title, text) {
    helpTitle.textContent = title;
    helpText.textContent = text;
    helpCard.classList.remove("hidden");
  }

  function hideHelp() {
    helpCard.classList.add("hidden");
  }

  function setInstalledState() {
    installButton.textContent = "Open YogaUnnati";
    supportCopy.textContent = "YogaUnnati is already available like an app on this device.";
  }

  function setPromptReadyState() {
    installButton.textContent = "Install App";
    supportCopy.textContent = "Install YogaUnnati for a smoother daily practice experience.";
  }

  function setFallbackState() {
    installButton.textContent = "How to Install";

    if (isIos()) {
      supportCopy.textContent = "On iPhone, use Share and then Add to Home Screen.";
      return;
    }

    if (isAndroid()) {
      supportCopy.textContent = "On Android, open the browser menu and choose Install app or Add to Home screen.";
      return;
    }

    supportCopy.textContent = "Open this page in a supported browser to install YogaUnnati like an app.";
  }

  function refreshButtonState() {
    if (isStandalone()) {
      setInstalledState();
      return;
    }

    if (deferredInstallPrompt) {
      setPromptReadyState();
      return;
    }

    setFallbackState();
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    hideHelp();
    refreshButtonState();
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    hideHelp();
    setInstalledState();
  });

  installButton.addEventListener("click", async () => {
    if (isStandalone()) {
      window.location.href = "auth.html";
      return;
    }

    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();

      try {
        await deferredInstallPrompt.userChoice;
      } catch (_error) {
        // Ignore dismissal errors and fall back to the instruction state.
      }

      deferredInstallPrompt = null;
      refreshButtonState();
      return;
    }

    if (isIos()) {
      showHelp(
        "Install on iPhone",
        "Tap Share in Safari, then choose Add to Home Screen to install YogaUnnati."
      );
      return;
    }

    if (isAndroid()) {
      showHelp(
        "Install on Android",
        "Open the browser menu, then choose Install app or Add to Home screen."
      );
      return;
    }

    showHelp(
      "Install YogaUnnati",
      "Open this page in Chrome, Safari, or another supported mobile browser to install the app."
    );
  });

  helpClose.addEventListener("click", hideHelp);

  refreshButtonState();
})();
