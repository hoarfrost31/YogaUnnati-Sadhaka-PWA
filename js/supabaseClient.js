// Supabase config
const supabaseUrl = "https://wiqazuogcyxvtcoyekvc.supabase.co";
const supabaseKey = "sb_publishable_r5m-2kccX-q36GbBQc1jXQ_T-H7E1UY";
const AUTH_CACHE_KEY = "yogaunnati_auth_user_v1";
const AUTH_NOTICE_KEY = "yogaunnati_auth_notice_v1";
const DISABLED_ACCOUNT_MESSAGE = "Your account has been disabled. Contact admin.";

window.supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

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

window.supabaseClient.auth.onAuthStateChange((_event, session) => {
  writeCachedAuthUser(session?.user || null);
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
    }
  } catch (error) {
    console.error("Visibility auth access check error:", error);
  }
});
