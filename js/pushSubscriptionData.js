const PUSH_SUBSCRIPTION_CACHE_PREFIX = "push_subscription_v1:";

function getPushSubscriptionCacheKey(userId) {
  return `${PUSH_SUBSCRIPTION_CACHE_PREFIX}${userId}`;
}

function readPushSubscriptionCache(userId) {
  if (!userId) {
    return null;
  }

  try {
    const raw = localStorage.getItem(getPushSubscriptionCacheKey(userId));
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error("Push subscription cache read error:", error);
    return null;
  }
}

function writePushSubscriptionCache(userId, record) {
  if (!userId) {
    return;
  }

  try {
    localStorage.setItem(getPushSubscriptionCacheKey(userId), JSON.stringify(record || null));
  } catch (error) {
    console.error("Push subscription cache write error:", error);
  }
}

function isPushSubscriptionsTableMissing(error) {
  return error?.code === "42P01";
}

function getPushPublicKey() {
  return window.PWA_PUSH_PUBLIC_KEY || localStorage.getItem("pwa_push_public_key") || "";
}

function isPushConfigured() {
  return Boolean(getPushPublicKey());
}

function isPushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window;
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

function subscriptionToRow(userId, subscription) {
  const payload = subscription.toJSON();
  return {
    user_id: userId,
    endpoint: payload.endpoint,
    p256dh: payload.keys?.p256dh || null,
    auth: payload.keys?.auth || null,
    enabled: true,
    user_agent: navigator.userAgent,
  };
}

async function upsertPushSubscription(userId, subscription) {
  const row = subscriptionToRow(userId, subscription);
  const { error } = await window.supabaseClient
    .from("push_subscriptions")
    .upsert(row, { onConflict: "endpoint" });

  if (error) {
    if (isPushSubscriptionsTableMissing(error)) {
      return { ok: false, reason: "table_missing" };
    }

    throw error;
  }

  const { data: confirmedRow, error: confirmError } = await window.supabaseClient
    .from("push_subscriptions")
    .select("endpoint")
    .eq("endpoint", row.endpoint)
    .maybeSingle();

  if (confirmError) {
    if (isPushSubscriptionsTableMissing(confirmError)) {
      return { ok: false, reason: "table_missing" };
    }

    throw confirmError;
  }

  if (!confirmedRow) {
    return { ok: false, reason: "not_confirmed" };
  }

  writePushSubscriptionCache(userId, row);
  return { ok: true, reason: "saved", row };
}

async function disablePushSubscription(userId) {
  const cached = readPushSubscriptionCache(userId);
  if (!cached?.endpoint) {
    return;
  }

  try {
    const { error } = await window.supabaseClient
      .from("push_subscriptions")
      .update({ enabled: false })
      .eq("endpoint", cached.endpoint);

    if (error && !isPushSubscriptionsTableMissing(error)) {
      throw error;
    }
  } catch (error) {
    console.error("Could not disable push subscription:", error);
  }
}

async function ensurePushSubscription(userId) {
  if (!isPushSupported()) {
    return { ok: false, reason: "unsupported" };
  }

  if (!isPushConfigured()) {
    return { ok: false, reason: "unconfigured" };
  }

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(getPushPublicKey()),
    });
  }

  const saveResult = await upsertPushSubscription(userId, subscription);
  return {
    ok: saveResult.ok,
    reason: saveResult.reason,
    subscription,
  };
}

window.pushSubscriptions = {
  isSupported: isPushSupported,
  isConfigured: isPushConfigured,
  ensureSubscribed: ensurePushSubscription,
  disable: disablePushSubscription,
  readCache: readPushSubscriptionCache,
};
