// Supabase config
const supabaseUrl = "https://wiqazuogcyxvtcoyekvc.supabase.co";
const supabaseKey = "sb_publishable_r5m-2kccX-q36GbBQc1jXQ_T-H7E1UY";
const AUTH_CACHE_KEY = "yogaunnati_auth_user_v1";

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

window.appAuth = {
  async getCurrentUser(options = {}) {
    const forceRefresh = Boolean(options.forceRefresh);

    if (!forceRefresh) {
      const cachedUser = readCachedAuthUser();
      if (cachedUser?.id) {
        return cachedUser;
      }
    }

    try {
      const { data: sessionData } = await window.supabaseClient.auth.getSession();
      const sessionUser = sessionData?.session?.user || null;
      if (sessionUser?.id) {
        writeCachedAuthUser(sessionUser);
        return {
          id: sessionUser.id,
          email: sessionUser.email || "",
        };
      }

      const { data } = await window.supabaseClient.auth.getUser();
      const user = data?.user || null;
      if (user?.id) {
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
