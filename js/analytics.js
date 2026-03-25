const ANALYTICS_QUEUE_KEY = "analytics_queue_v1";
const ANALYTICS_ANON_ID_KEY = "analytics_anon_id_v1";
const ANALYTICS_SESSION_ID_KEY = "analytics_session_id_v1";
const ANALYTICS_PAGEVIEW_KEY_PREFIX = "analytics_pageview_v1:";
const ANALYTICS_MAX_QUEUE_SIZE = 200;
const ANALYTICS_BATCH_SIZE = 20;
window.ANALYTICS_ENABLED = window.ANALYTICS_ENABLED ?? false;

function analyticsIsEnabled() {
  return window.ANALYTICS_ENABLED !== false;
}

function analyticsSafeRandomId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `id_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function analyticsReadStorage(storage, key) {
  try {
    return storage.getItem(key);
  } catch (_error) {
    return null;
  }
}

function analyticsWriteStorage(storage, key, value) {
  try {
    storage.setItem(key, value);
  } catch (_error) {
    // Ignore storage failures.
  }
}

function analyticsGetAnonymousId() {
  const existing = analyticsReadStorage(window.localStorage, ANALYTICS_ANON_ID_KEY);
  if (existing) {
    return existing;
  }

  const nextId = analyticsSafeRandomId();
  analyticsWriteStorage(window.localStorage, ANALYTICS_ANON_ID_KEY, nextId);
  return nextId;
}

function analyticsGetSessionId() {
  const existing = analyticsReadStorage(window.sessionStorage, ANALYTICS_SESSION_ID_KEY);
  if (existing) {
    return existing;
  }

  const nextId = analyticsSafeRandomId();
  analyticsWriteStorage(window.sessionStorage, ANALYTICS_SESSION_ID_KEY, nextId);
  return nextId;
}

function analyticsReadQueue() {
  try {
    const raw = window.localStorage.getItem(ANALYTICS_QUEUE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function analyticsWriteQueue(queue) {
  try {
    window.localStorage.setItem(
      ANALYTICS_QUEUE_KEY,
      JSON.stringify(queue.slice(-ANALYTICS_MAX_QUEUE_SIZE)),
    );
  } catch (_error) {
    // Ignore queue persistence failures.
  }
}

function analyticsPageNameFromPath() {
  const path = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
  const pageNames = {
    "": "home",
    "index.html": "home",
    "progress.html": "progress",
    "milestones.html": "milestones",
    "community.html": "community",
    "member.html": "member_profile",
    "profile.html": "profile_settings",
    "auth.html": "auth",
  };

  return pageNames[path] || path.replace(".html", "") || "home";
}

function analyticsPageviewCacheKey() {
  return `${ANALYTICS_PAGEVIEW_KEY_PREFIX}${window.location.pathname}${window.location.search}`;
}

window.appAnalytics = (() => {
  let currentUserId = null;
  let flushTimer = null;
  let isFlushing = false;
  let initStarted = false;

  function createEvent(eventName, properties = {}) {
    return {
      event_name: eventName,
      user_id: currentUserId,
      anonymous_id: analyticsGetAnonymousId(),
      session_id: analyticsGetSessionId(),
      page_name: analyticsPageNameFromPath(),
      path: `${window.location.pathname}${window.location.search || ""}`,
      properties,
      occurred_at: new Date().toISOString(),
    };
  }

  function enqueue(eventName, properties = {}) {
    if (!analyticsIsEnabled()) {
      return;
    }

    const queue = analyticsReadQueue();
    queue.push(createEvent(eventName, properties));
    analyticsWriteQueue(queue);
  }

  function scheduleFlush(delayMs = 500) {
    if (flushTimer) {
      window.clearTimeout(flushTimer);
    }

    flushTimer = window.setTimeout(() => {
      flushTimer = null;
      flush();
    }, delayMs);
  }

  async function resolveCurrentUserId() {
    if (!window.supabaseClient?.auth) {
      return null;
    }

    try {
      const { data: sessionData } = await window.supabaseClient.auth.getSession();
      if (sessionData?.session?.user?.id) {
        return sessionData.session.user.id;
      }

      const { data } = await window.supabaseClient.auth.getUser();
      return data?.user?.id || null;
    } catch (error) {
      console.error("Analytics user resolve error:", error);
      return null;
    }
  }

  async function flush() {
    if (!analyticsIsEnabled() || isFlushing || !navigator.onLine || !window.supabaseClient) {
      return;
    }

    const queue = analyticsReadQueue();
    if (!queue.length) {
      return;
    }

    isFlushing = true;

    try {
      const batch = queue.slice(0, ANALYTICS_BATCH_SIZE);
      const { error } = await window.supabaseClient
        .from("analytics_events")
        .insert(batch);

      if (error) {
        console.error("Analytics flush error:", error);
        return;
      }

      analyticsWriteQueue(queue.slice(batch.length));

      if (queue.length > batch.length) {
        scheduleFlush(150);
      }
    } catch (error) {
      console.error("Analytics flush failure:", error);
    } finally {
      isFlushing = false;
    }
  }

  function trackPageView(extraProperties = {}) {
    if (!analyticsIsEnabled()) {
      return;
    }

    const cacheKey = analyticsPageviewCacheKey();
    if (analyticsReadStorage(window.sessionStorage, cacheKey) === "sent") {
      return;
    }

    analyticsWriteStorage(window.sessionStorage, cacheKey, "sent");
    enqueue("page_view", {
      page_title: document.title,
      referrer: document.referrer || "",
      ...extraProperties,
    });
    scheduleFlush(300);
  }

  async function init() {
    if (initStarted) {
      return;
    }

    initStarted = true;
    if (!analyticsIsEnabled()) {
      return;
    }

    currentUserId = await resolveCurrentUserId();
    trackPageView();
    scheduleFlush(150);

    if (window.supabaseClient?.auth?.onAuthStateChange) {
      window.supabaseClient.auth.onAuthStateChange((_event, session) => {
        currentUserId = session?.user?.id || null;
        scheduleFlush(150);
      });
    }

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        flush();
      }
    });

    window.addEventListener("online", () => {
      scheduleFlush(150);
    });
  }

  init().catch((error) => {
    console.error("Analytics init error:", error);
  });

  return {
    isEnabled() {
      return analyticsIsEnabled();
    },
    setEnabled(enabled) {
      window.ANALYTICS_ENABLED = Boolean(enabled);
    },
    identify(userId) {
      if (!analyticsIsEnabled()) {
        return;
      }
      currentUserId = userId || null;
      scheduleFlush(150);
    },
    track(eventName, properties = {}) {
      if (!analyticsIsEnabled()) {
        return;
      }
      enqueue(eventName, properties);
      scheduleFlush(250);
    },
    trackPageView,
    flush,
  };
})();
