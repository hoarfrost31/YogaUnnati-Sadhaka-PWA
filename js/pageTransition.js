const TAB_HISTORY_KEY = "yogaunnati_tab_history";
const TAB_PAGES = new Set(["index.html", "progress.html", "milestones.html", "community.html", "profile.html"]);
const EXIT_PROMPT_KEY = "yogaunnati_exit_prompt_at";
const EXIT_PROMPT_WINDOW_MS = 1800;

function getAppPlugin() {
  return window.Capacitor?.Plugins?.App || null;
}

function exitAppIfPossible() {
  const appPlugin = getAppPlugin();

  if (typeof appPlugin?.exitApp === "function") {
    appPlugin.exitApp();
    return true;
  }

  if (typeof window.navigator?.app?.exitApp === "function") {
    window.navigator.app.exitApp();
    return true;
  }

  if (typeof window.close === "function") {
    window.close();
  }

  return false;
}

function isInternalPageLink(anchor) {
  if (!anchor) {
    return false;
  }

  const href = anchor.getAttribute("href");

  if (!href || href.startsWith("#") || href.startsWith("javascript:")) {
    return false;
  }

  if (anchor.target && anchor.target !== "_self") {
    return false;
  }

  if (anchor.hasAttribute("download")) {
    return false;
  }

  const url = new URL(anchor.href, window.location.href);
  return url.origin === window.location.origin;
}

function getCurrentPageName() {
  const pathname = window.location.pathname.split("/").pop();
  return pathname || "index.html";
}

function readTabHistory() {
  try {
    const raw = sessionStorage.getItem(TAB_HISTORY_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function writeTabHistory(history) {
  sessionStorage.setItem(TAB_HISTORY_KEY, JSON.stringify(history.slice(-12)));
}

function clearExitPrompt() {
  sessionStorage.removeItem(EXIT_PROMPT_KEY);
}

function shouldExitOnThisBackPress() {
  const now = Date.now();
  const lastPromptAt = Number(sessionStorage.getItem(EXIT_PROMPT_KEY) || 0);

  if (now - lastPromptAt <= EXIT_PROMPT_WINDOW_MS) {
    clearExitPrompt();
    return true;
  }

  sessionStorage.setItem(EXIT_PROMPT_KEY, String(now));
  return false;
}

function getOrCreateExitToast() {
  let toast = document.getElementById("appExitToast");

  if (toast) {
    return toast;
  }

  toast = document.createElement("div");
  toast.id = "appExitToast";
  toast.className = "toast hidden";
  document.body.appendChild(toast);
  return toast;
}

function showExitPrompt() {
  const toast = getOrCreateExitToast();
  toast.textContent = "Press back again to exit";
  toast.classList.remove("hidden");
  toast.classList.remove("show");

  window.setTimeout(() => {
    toast.classList.add("show");
  }, 10);

  window.setTimeout(() => {
    toast.classList.remove("show");

    window.setTimeout(() => {
      toast.classList.add("hidden");
    }, 300);
  }, EXIT_PROMPT_WINDOW_MS);
}

function getPreviousTrackedPage(currentPage) {
  const stack = readTabHistory();

  if (stack[stack.length - 1] === currentPage) {
    stack.pop();
  }

  const previousPage = stack[stack.length - 1] || "";
  return {
    previousPage,
    nextHistory: stack,
  };
}

function enableTabHistoryNavigation() {
  const currentPage = getCurrentPageName();

  if (!TAB_PAGES.has(currentPage)) {
    return;
  }

  const history = readTabHistory();
  const lastPage = history[history.length - 1];

  if (lastPage !== currentPage) {
    history.push(currentPage);
    writeTabHistory(history);
  }

  window.history.pushState({ tabBackGuard: true, page: currentPage }, "", window.location.href);

  window.addEventListener("popstate", () => {
    const { previousPage, nextHistory } = getPreviousTrackedPage(currentPage);

    if (previousPage && previousPage !== currentPage) {
      writeTabHistory(previousPage === "index.html" ? ["index.html"] : nextHistory);
      window.location.href = previousPage;
      return;
    }

    if (currentPage === "index.html") {
      if (shouldExitOnThisBackPress()) {
        if (!exitAppIfPossible()) {
          window.history.back();
        }
        return;
      }

      writeTabHistory(["index.html"]);
      showExitPrompt();
      window.history.pushState({ tabBackGuard: true, page: currentPage }, "", window.location.href);
      return;
    }

    writeTabHistory([currentPage]);
    window.history.pushState({ tabBackGuard: true, page: currentPage }, "", window.location.href);
  });
}

function enableNativeBackNavigation() {
  const currentPage = getCurrentPageName();

  if (!TAB_PAGES.has(currentPage)) {
    return;
  }

  const appPlugin = getAppPlugin();

  if (!appPlugin?.addListener) {
    return;
  }

  appPlugin.addListener("backButton", () => {
    const { previousPage, nextHistory } = getPreviousTrackedPage(currentPage);

    if (previousPage && previousPage !== currentPage) {
      writeTabHistory(previousPage === "index.html" ? ["index.html"] : nextHistory);
      window.location.href = previousPage;
      return;
    }

    if (currentPage !== "index.html") {
      clearExitPrompt();
      writeTabHistory(["index.html"]);
      window.location.href = "index.html";
      return;
    }

    writeTabHistory(["index.html"]);

    if (!shouldExitOnThisBackPress()) {
      showExitPrompt();
      return;
    }

    exitAppIfPossible();
  });
}

window.addEventListener("pageshow", () => {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      document.body.classList.add("page-ready");
    });
  });
});

enableTabHistoryNavigation();
enableNativeBackNavigation();

document.addEventListener("click", (event) => {
  if (event.defaultPrevented || event.button !== 0) {
    return;
  }

  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }

  const anchor = event.target.closest("a[href]");

  if (!isInternalPageLink(anchor)) {
    return;
  }
});
