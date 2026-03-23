const PROFILE_CACHE_PREFIX = "profile_cache_v1:";
const DEFAULT_PROFILE_NAME = "Your Profile";
const DEFAULT_PROFILE_AVATAR = "images/profile-placeholder.svg";
const LEGACY_DEFAULT_AVATAR_PATHS = new Set([
  "images/profile.jpg",
  "/images/profile.jpg",
]);

function getProfileCacheKey(userId) {
  return `${PROFILE_CACHE_PREFIX}${userId}`;
}

function getInitials(name) {
  const safeName = (name || "").trim();
  if (!safeName) {
    return "Y";
  }

  return safeName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
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

function normalizeProfileData(profile = {}) {
  return {
    displayName: (profile.displayName || "").trim(),
    avatarUrl: normalizeAvatarUrl(profile.avatarUrl),
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
  const emailPrefix = user?.email ? user.email.split("@")[0] : "";

  return normalizeProfileData({
    displayName: metadata.display_name || emailPrefix || DEFAULT_PROFILE_NAME,
    avatarUrl: metadata.avatar_data_url || metadata.avatar_url || "",
  });
}

function getProfileFromRow(row, fallbackUser = null) {
  const fallback = getProfileFromUser(fallbackUser);

  return normalizeProfileData({
    displayName: row?.display_name || fallback.displayName,
    avatarUrl: row?.avatar_url || fallback.avatarUrl,
  });
}

function isProfilesTableMissing(error) {
  return error?.code === "42P01";
}

async function fetchProfileRow(userId) {
  const { data, error } = await window.supabaseClient
    .from("profiles")
    .select("id, display_name, avatar_url")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
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
    return profile;
  } catch (profilesError) {
    if (isProfilesTableMissing(profilesError)) {
      writeProfileCache(userId, fallbackProfile);
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
    return profile;
  } catch (profilesError) {
    if (isProfilesTableMissing(profilesError)) {
      const fallbackProfile = getProfileFromUser(fallbackUser);
      writeProfileCache(userId, fallbackProfile);
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
  return savedProfile;
}

async function fetchAllProfiles() {
  const { data, error } = await window.supabaseClient
    .from("profiles")
    .select("id, display_name, avatar_url");

  if (error) {
    if (isProfilesTableMissing(error)) {
      return [];
    }

    throw error;
  }

  return data || [];
}
