// Supabase config
const supabaseUrl = "https://wiqazuogcyxvtcoyekvc.supabase.co";
const supabaseKey = "sb_publishable_r5m-2kccX-q36GbBQc1jXQ_T-H7E1UY";
const AUTH_CACHE_KEY = "yogaunnati_auth_user_v1";
const AUTH_NOTICE_KEY = "yogaunnati_auth_notice_v1";
const DISABLED_ACCOUNT_MESSAGE = "Your account has been disabled. Contact admin.";
const SUPABASE_AUTH_STORAGE_KEY = "sb-wiqazuogcyxvtcoyekvc-auth-token";

window.supabaseClient = supabase.createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: window.localStorage,
    storageKey: SUPABASE_AUTH_STORAGE_KEY,
  },
});

async function syncCurrentUserLastSeen(options = {}) {
  if (typeof window.touchCurrentUserLastSeen !== "function") {
    return false;
  }

  try {
    const user = await window.appAuth.getCurrentUser({ forceRefresh: Boolean(options.forceRefresh) });
    if (!user?.id) {
      return false;
    }

    return await window.touchCurrentUserLastSeen(user.id, { force: Boolean(options.force) });
  } catch (error) {
    console.error("Last seen sync error:", error);
    return false;
  }
}

function readCachedAuthUser() {
  try {
    const raw = sessionStorage.getItem(AUTH_CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    console.error("Auth cache read error:", error);
    return null;
  }
}

function readPersistedSessionUser() {
  try {
    const raw = localStorage.getItem(SUPABASE_AUTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    const session = Array.isArray(parsed) ? parsed[0] : parsed;
    const user = session?.user || session?.currentSession?.user || null;

    if (!user?.id) {
      return null;
    }

    return {
      id: user.id,
      email: user.email || "",
    };
  } catch (error) {
    console.error("Persisted auth read error:", error);
    return null;
  }
}
function writeCachedAuthUser(user) {
  try {
    if (!user) {
      sessionStorage.removeItem(AUTH_CACHE_KEY);
      return;
    }

    sessionStorage.setItem(
      AUTH_CACHE_KEY,
      JSON.stringify({
        id: user.id || "",
        email: user.email || "",
      }),
    );
  } catch (error) {
    console.error("Auth cache write error:", error);
  }
}

function setAuthNotice(message) {
  try {
    if (!message) {
      sessionStorage.removeItem(AUTH_NOTICE_KEY);
      return;
    }

    sessionStorage.setItem(AUTH_NOTICE_KEY, String(message));
  } catch (error) {
    console.error("Auth notice write error:", error);
  }
}

async function isLoginDisabled(userId) {
  if (!userId) {
    return false;
  }

  try {
    const { data, error } = await window.supabaseClient
      .from("profiles")
      .select("login_disabled")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      if (["42P01", "42703", "PGRST116", "PGRST204"].includes(String(error.code || ""))) {
        return false;
      }

      throw error;
    }

    return Boolean(data?.login_disabled);
  } catch (error) {
    console.error("Login access check error:", error);
    return false;
  }
}

window.appAuth = {
  getCachedUser() {
    const cachedUser = readCachedAuthUser();
    if (cachedUser?.id) {
      return cachedUser;
    }

    const persistedUser = readPersistedSessionUser();
    return persistedUser?.id ? persistedUser : null;
  },
  consumeNotice() {
    try {
      const message = sessionStorage.getItem(AUTH_NOTICE_KEY) || "";
      sessionStorage.removeItem(AUTH_NOTICE_KEY);
      return message;
    } catch (error) {
      console.error("Auth notice read error:", error);
      return "";
    }
  },
  async ensureLoginAllowed(options = {}) {
    const user = options.user || null;
    const redirectTo = Object.prototype.hasOwnProperty.call(options, "redirectTo") ? options.redirectTo : null;

    if (!user?.id) {
      return true;
    }

    const blocked = await isLoginDisabled(user.id);
    if (!blocked) {
      return true;
    }

    setAuthNotice(DISABLED_ACCOUNT_MESSAGE);
    writeCachedAuthUser(null);

    try {
      await window.supabaseClient.auth.signOut();
    } catch (error) {
      console.error("Blocked account sign-out error:", error);
    }

    if (redirectTo) {
      window.location.href = redirectTo;
    }

    return false;
  },
  async getCurrentUser(options = {}) {
    const forceRefresh = Boolean(options.forceRefresh);

    if (!forceRefresh) {
      const cachedUser = readCachedAuthUser();
      if (cachedUser?.id) {
        const allowed = await this.ensureLoginAllowed({ user: cachedUser });
        return allowed ? cachedUser : null;
      }
    }

    try {
      const { data: sessionData } = await window.supabaseClient.auth.getSession();
      const sessionUser = sessionData?.session?.user || null;
      if (sessionUser?.id) {
        const allowed = await this.ensureLoginAllowed({ user: sessionUser });
        if (!allowed) {
          return null;
        }

        writeCachedAuthUser(sessionUser);
        return {
          id: sessionUser.id,
          email: sessionUser.email || "",
        };
      }

      const { data } = await window.supabaseClient.auth.getUser();
      const user = data?.user || null;
      if (user?.id) {
        const allowed = await this.ensureLoginAllowed({ user });
        if (!allowed) {
          return null;
        }

        writeCachedAuthUser(user);
        return {
          id: user.id,
          email: user.email || "",
        };
      }
    } catch (error) {
      console.error("Auth resolve error:", error);
    }

    writeCachedAuthUser(null);
    return null;
  },
  clearCachedUser() {
    writeCachedAuthUser(null);
  },
};

const APP_RESUME_SYNC_MIN_INTERVAL_MS = 1400;

window.registerAppResumeSync = function registerAppResumeSync(handler, options = {}) {
  if (typeof handler !== "function") {
    return {
      refresh: async () => {},
      detach() {},
    };
  }

  const minIntervalMs = Math.max(0, Number(options.minIntervalMs) || APP_RESUME_SYNC_MIN_INTERVAL_MS);
  let lastRunAt = 0;
  let inFlight = null;
  let detached = false;

  async function run(reason, runOptions = {}) {
    if (detached) {
      return null;
    }

    const force = Boolean(runOptions.force);
    const now = Date.now();

    if (!force) {
      if (inFlight) {
        return inFlight;
      }

      if (now - lastRunAt < minIntervalMs) {
        return null;
      }
    }

    lastRunAt = now;
    inFlight = Promise.resolve(
      handler({
        reason,
        force,
        isOnline: navigator.onLine !== false,
      })
    )
      .catch((error) => {
        console.error("App resume sync error:", error);
      })
      .finally(() => {
        inFlight = null;
      });

    return inFlight;
  }

  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      run("visibilitychange");
    }
  };
  const onPageShow = () => {
    run("pageshow");
  };
  const onFocus = () => {
    run("focus");
  };
  const onOnline = () => {
    run("online", { force: true });
  };

  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pageshow", onPageShow);
  window.addEventListener("focus", onFocus);
  window.addEventListener("online", onOnline);

  return {
    refresh(runOptions = {}) {
      return run(runOptions.reason || "manual", { force: Boolean(runOptions.force) });
    },
    detach() {
      detached = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
    },
  };
};

window.supabaseClient.auth.onAuthStateChange((_event, session) => {
  writeCachedAuthUser(session?.user || null);

  if (session?.user?.id) {
    syncCurrentUserLastSeen({ force: true });
  }
});

window.addEventListener("pageshow", () => {
  syncCurrentUserLastSeen();
});

document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible") {
    return;
  }

  try {
    const { data } = await window.supabaseClient.auth.getSession();
    const sessionUser = data?.session?.user || null;
    if (sessionUser?.id) {
      await window.appAuth.ensureLoginAllowed({
        user: sessionUser,
        redirectTo: "auth.html",
      });
      await syncCurrentUserLastSeen();
    }
  } catch (error) {
    console.error("Visibility auth access check error:", error);
  }
});



