const PROFILE_CACHE_PREFIX = "profile_cache_v1:";
const DEFAULT_PROFILE_NAME = "Your Profile";
const DEFAULT_PROFILE_AVATAR = "images/profile-placeholder.svg";
const LEGACY_DEFAULT_AVATAR_PATHS = new Set([
  "images/profile.jpg",
  "/images/profile.jpg",
]);
const LAST_SEEN_SYNC_KEY_PREFIX = "profile_last_seen_sync_v1:";
const LAST_SEEN_MIN_UPDATE_MS = 5 * 60 * 1000;

function getProfileCacheKey(userId) {
  return `${PROFILE_CACHE_PREFIX}${userId}`;
}

function getLastSeenSyncKey(userId) {
  return `${LAST_SEEN_SYNC_KEY_PREFIX}${userId}`;
}

function normalizeFallbackName(name = "") {
  return (name || "")
    .trim()
    .replace(/^[^A-Za-z0-9]+/, "")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getInitials(name) {
  const safeName = normalizeFallbackName(name);
  if (!safeName) {
    return "Y";
  }

  const initials = safeName
    .split(/[\s._-]+/)
    .slice(0, 2)
    .map((part) => part.replace(/^[^A-Za-z0-9]+/, ""))
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return initials || "Y";
}

function normalizeAvatarUrl(avatarUrl = "") {
  const safeAvatarUrl = (avatarUrl || "").trim();

  if (!safeAvatarUrl) {
    return "";
  }

  if (LEGACY_DEFAULT_AVATAR_PATHS.has(safeAvatarUrl)) {
    return "";
  }

  if (/\/images\/profile\.jpg(?:\?|#|$)/i.test(safeAvatarUrl)) {
    return "";
  }

  return safeAvatarUrl;
}

function normalizeIndianPhone(input = "") {
  const digits = String(input || "").replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  return "";
}

function normalizeProfileData(profile = {}) {
  return {
    displayName: (profile.displayName || "").trim(),
    avatarUrl: normalizeAvatarUrl(profile.avatarUrl),
    phone: normalizeIndianPhone(profile.phone),
    classReminderEnabled: Boolean(profile.classReminderEnabled),
  };
}

function readProfileCache(userId) {
  if (!userId) {
    return normalizeProfileData();
  }

  try {
    const raw = localStorage.getItem(getProfileCacheKey(userId));
    if (!raw) {
      return normalizeProfileData();
    }

    return normalizeProfileData(JSON.parse(raw));
  } catch (error) {
    console.error("Profile cache read error:", error);
    return normalizeProfileData();
  }
}

function writeProfileCache(userId, profile) {
  if (!userId) {
    return;
  }

  try {
    localStorage.setItem(getProfileCacheKey(userId), JSON.stringify(normalizeProfileData(profile)));
  } catch (error) {
    console.error("Profile cache write error:", error);
  }
}

function getProfileFromUser(user) {
  const metadata = user?.user_metadata || {};
  const emailPrefix = normalizeFallbackName(user?.email ? user.email.split("@")[0] : "");
  const displayName = (metadata.display_name || "").trim();

  return normalizeProfileData({
    displayName: displayName || emailPrefix || DEFAULT_PROFILE_NAME,
    avatarUrl: metadata.avatar_data_url || metadata.avatar_url || "",
    phone: metadata.phone || metadata.phone_number || metadata.mobile || user?.phone || "",
    classReminderEnabled: Boolean(metadata.class_reminder_enabled),
  });
}

function getProfileFromRow(row, fallbackUser = null) {
  const fallback = getProfileFromUser(fallbackUser);

  return normalizeProfileData({
    displayName: row?.display_name || fallback.displayName,
    avatarUrl: row?.avatar_url || fallback.avatarUrl,
    phone: row?.phone || fallback.phone,
  });
}

function isProfilesTableMissing(error) {
  return error?.code === "42P01";
}

function isLastSeenColumnMissing(error) {
  return ["42703", "PGRST204"].includes(String(error?.code || ""));
}

async function fetchProfilesSelect(builderFactory) {
  const { data, error } = await builderFactory(true);
  if (!error) {
    return data || [];
  }

  if (!isLastSeenColumnMissing(error)) {
    throw error;
  }

  const fallbackResult = await builderFactory(false);
  if (fallbackResult.error) {
    throw fallbackResult.error;
  }

  return (fallbackResult.data || []).map((row) => ({
    ...row,
    last_seen_at: "",
  }));
}

async function fetchProfileRow(userId) {
  const rows = await fetchProfilesSelect((includeLastSeen) =>
    window.supabaseClient
      .from("profiles")
      .select(includeLastSeen ? "id, display_name, avatar_url, phone, last_seen_at" : "id, display_name, avatar_url, phone")
      .eq("id", userId)
      .limit(1)
  );

  return rows[0] || null;
}

async function ensureCurrentUserProfile(userId) {
  const { data, error } = await window.supabaseClient.auth.getUser();
  if (error) {
    throw error;
  }

  const fallbackUser = data.user;
  const fallbackProfile = getProfileFromUser(fallbackUser);

  try {
    const existingRow = await fetchProfileRow(userId);

    if (existingRow) {
      const profile = getProfileFromRow(existingRow, fallbackUser);
      writeProfileCache(userId, profile);
      markRemoteRefresh("profile", userId);
      return profile;
    }

    const { error: upsertError } = await window.supabaseClient
      .from("profiles")
      .upsert(
        {
          id: userId,
          display_name: fallbackProfile.displayName || DEFAULT_PROFILE_NAME,
          avatar_url: fallbackProfile.avatarUrl || null,
        },
        { onConflict: "id" }
      );

    if (upsertError) {
      throw upsertError;
    }

    const createdRow = await fetchProfileRow(userId);
    const profile = createdRow ? getProfileFromRow(createdRow, fallbackUser) : fallbackProfile;
    writeProfileCache(userId, profile);
    markRemoteRefresh("profile", userId);
    return profile;
  } catch (profilesError) {
    if (isProfilesTableMissing(profilesError)) {
      writeProfileCache(userId, fallbackProfile);
      markRemoteRefresh("profile", userId);
      return fallbackProfile;
    }

    throw profilesError;
  }

  writeProfileCache(userId, fallbackProfile);
  return fallbackProfile;
}

async function refreshCurrentUserProfile(userId) {
  const { data, error } = await window.supabaseClient.auth.getUser();
  if (error) {
    throw error;
  }

  const fallbackUser = data.user;

  try {
    const row = await fetchProfileRow(userId);
    const profile = row ? getProfileFromRow(row, fallbackUser) : getProfileFromUser(fallbackUser);
    writeProfileCache(userId, profile);
    markRemoteRefresh("profile", userId);
    return profile;
  } catch (profilesError) {
    if (isProfilesTableMissing(profilesError)) {
      const fallbackProfile = getProfileFromUser(fallbackUser);
      writeProfileCache(userId, fallbackProfile);
      markRemoteRefresh("profile", userId);
      return fallbackProfile;
    }

    throw profilesError;
  }
}

async function saveCurrentUserProfile(userId, profile) {
  const cleanProfile = normalizeProfileData(profile);
  const { data, error } = await window.supabaseClient.auth.updateUser({
    data: {
      display_name: cleanProfile.displayName,
      avatar_data_url: cleanProfile.avatarUrl,
      phone: cleanProfile.phone,
      phone_number: cleanProfile.phone,
      mobile: cleanProfile.phone,
      class_reminder_enabled: cleanProfile.classReminderEnabled,
    },
  });

  if (error) {
    throw error;
  }

  let savedProfile = getProfileFromUser(data.user);

  try {
    const { error: profileError } = await window.supabaseClient
      .from("profiles")
      .upsert(
        {
          id: userId,
          display_name: cleanProfile.displayName || DEFAULT_PROFILE_NAME,
          avatar_url: cleanProfile.avatarUrl || null,
        },
        { onConflict: "id" }
      );

    if (profileError && !isProfilesTableMissing(profileError)) {
      throw profileError;
    }

    if (!profileError) {
      const row = await fetchProfileRow(userId);
      if (row) {
        savedProfile = getProfileFromRow(row, data.user);
      }
    }
  } catch (profilesError) {
    if (!isProfilesTableMissing(profilesError)) {
      throw profilesError;
    }
  }

  writeProfileCache(userId, savedProfile);
  markRemoteRefresh("profile", userId);
  return savedProfile;
}

async function saveReminderPreference(userId, enabled) {
  const currentProfile = readProfileCache(userId);
  const nextProfile = normalizeProfileData({
    ...currentProfile,
    classReminderEnabled: enabled,
  });

  const { data, error } = await window.supabaseClient.auth.updateUser({
    data: {
      display_name: nextProfile.displayName,
      avatar_data_url: nextProfile.avatarUrl,
      phone: nextProfile.phone,
      phone_number: nextProfile.phone,
      mobile: nextProfile.phone,
      class_reminder_enabled: enabled,
    },
  });

  if (error) {
    throw error;
  }

  const savedProfile = getProfileFromUser(data.user);
  writeProfileCache(userId, savedProfile);
  markRemoteRefresh("profile", userId);
  return savedProfile;
}

async function fetchProfilesByIds(userIds = []) {
  const uniqueIds = [...new Set((userIds || []).filter(Boolean))];
  if (!uniqueIds.length) {
    return [];
  }

  try {
    const data = await fetchProfilesSelect((includeLastSeen) =>
      window.supabaseClient
        .from("profiles")
        .select(includeLastSeen ? "id, display_name, avatar_url, phone, last_seen_at" : "id, display_name, avatar_url, phone")
        .in("id", uniqueIds)
    );

    markRemoteRefresh("profiles_public", "");
    return data || [];
  } catch (error) {
    if (isProfilesTableMissing(error)) {
      return [];
    }

    throw error;
  }
}

async function fetchAllProfiles() {
  try {
    const data = await fetchProfilesSelect((includeLastSeen) =>
      window.supabaseClient
        .from("profiles")
        .select(includeLastSeen ? "id, display_name, avatar_url, phone, last_seen_at" : "id, display_name, avatar_url, phone")
    );

    markRemoteRefresh("profiles_public", "");
    return data || [];
  } catch (error) {
    if (isProfilesTableMissing(error)) {
      return [];
    }

    throw error;
  }
}

function readLastSeenSyncAt(userId) {
  if (!userId) {
    return 0;
  }

  try {
    const raw = localStorage.getItem(getLastSeenSyncKey(userId));
    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
  } catch (error) {
    console.error("Last seen sync read error:", error);
    return 0;
  }
}

function writeLastSeenSyncAt(userId, timestampMs) {
  if (!userId) {
    return;
  }

  try {
    localStorage.setItem(getLastSeenSyncKey(userId), String(timestampMs));
  } catch (error) {
    console.error("Last seen sync write error:", error);
  }
}

async function touchCurrentUserLastSeen(userId, options = {}) {
  if (!userId) {
    return false;
  }

  const force = Boolean(options.force);
  const nowMs = Date.now();
  if (!force && nowMs - readLastSeenSyncAt(userId) < LAST_SEEN_MIN_UPDATE_MS) {
    return false;
  }

  const { data, error } = await window.supabaseClient.auth.getUser();
  if (error) {
    throw error;
  }

  const fallbackUser = data.user;
  const fallbackProfile = getProfileFromUser(fallbackUser);

  try {
    const { error: upsertError } = await window.supabaseClient
      .from("profiles")
      .upsert(
        {
          id: userId,
          display_name: fallbackProfile.displayName || DEFAULT_PROFILE_NAME,
          avatar_url: fallbackProfile.avatarUrl || null,
          phone: fallbackProfile.phone || null,
          last_seen_at: new Date(nowMs).toISOString(),
        },
        { onConflict: "id" }
      );

    if (upsertError) {
      if (isProfilesTableMissing(upsertError) || isLastSeenColumnMissing(upsertError)) {
        return false;
      }

      throw upsertError;
    }

    writeLastSeenSyncAt(userId, nowMs);
    markRemoteRefresh("profile", userId);
    markRemoteRefresh("profiles_public", "");
    return true;
  } catch (profilesError) {
    if (isProfilesTableMissing(profilesError) || isLastSeenColumnMissing(profilesError)) {
      return false;
    }

    throw profilesError;
  }
}


