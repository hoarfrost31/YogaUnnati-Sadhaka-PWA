const PROFILE_CACHE_PREFIX = "profile_cache_v1:";
const PROFILE_MEMBERSHIP_OVERRIDE_PREFIX = "profile_membership_override_v1:";
const DEFAULT_PROFILE_NAME = "Your Profile";
const DEFAULT_PROFILE_AVATAR = "images/profile-placeholder.svg";
const LEGACY_DEFAULT_AVATAR_PATHS = new Set([
  "images/profile.jpg",
  "/images/profile.jpg",
]);

function getProfileCacheKey(userId) {
  return `${PROFILE_CACHE_PREFIX}${userId}`;
}

function getProfileMembershipOverrideKey(userId) {
  return `${PROFILE_MEMBERSHIP_OVERRIDE_PREFIX}${userId}`;
}

function readProfileMembershipOverride(userId) {
  if (!userId) {
    return "";
  }

  try {
    const raw = localStorage.getItem(getProfileMembershipOverrideKey(userId));
    return raw === "premium" || raw === "free" ? raw : "";
  } catch (error) {
    console.error("Profile membership override read error:", error);
    return "";
  }
}

function writeProfileMembershipOverride(userId, membershipTier) {
  if (!userId) {
    return;
  }

  try {
    localStorage.setItem(
      getProfileMembershipOverrideKey(userId),
      String(membershipTier || "").toLowerCase() === "premium" ? "premium" : "free",
    );
  } catch (error) {
    console.error("Profile membership override write error:", error);
  }
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

function normalizeProfileData(profile = {}) {
  const membershipTier = String(profile.membershipTier || "").toLowerCase() === "premium"
    ? "premium"
    : "free";

  return {
    displayName: (profile.displayName || "").trim(),
    avatarUrl: normalizeAvatarUrl(profile.avatarUrl),
    classReminderEnabled: Boolean(profile.classReminderEnabled),
    membershipTier,
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

    const profile = normalizeProfileData(JSON.parse(raw));
    const membershipOverride = readProfileMembershipOverride(userId);
    return normalizeProfileData({
      ...profile,
      membershipTier: membershipOverride || profile.membershipTier,
    });
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
    classReminderEnabled: Boolean(metadata.class_reminder_enabled),
    membershipTier: metadata.membership_tier || "free",
  });
}

function getProfileFromRow(row, fallbackUser = null) {
  const fallback = getProfileFromUser(fallbackUser);

  return normalizeProfileData({
    displayName: row?.display_name || fallback.displayName,
    avatarUrl: row?.avatar_url || fallback.avatarUrl,
    membershipTier: row?.membership_tier || fallback.membershipTier,
  });
}

function isProfilesTableMissing(error) {
  return error?.code === "42P01";
}

function isMembershipTierColumnMissing(error) {
  return error?.code === "42703";
}

async function fetchProfileRow(userId) {
  const query = window.supabaseClient
    .from("profiles")
    .select("id, display_name, avatar_url, membership_tier")
    .eq("id", userId);

  const { data, error } = await query.maybeSingle();

  if (error) {
    if (isMembershipTierColumnMissing(error)) {
      const fallbackResult = await window.supabaseClient
        .from("profiles")
        .select("id, display_name, avatar_url")
        .eq("id", userId)
        .maybeSingle();

      if (fallbackResult.error) {
        throw fallbackResult.error;
      }

      return fallbackResult.data
        ? { ...fallbackResult.data, membership_tier: "free" }
        : null;
    }

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
          membership_tier: fallbackProfile.membershipTier || "free",
        },
        { onConflict: "id" }
      );

    if (upsertError) {
      if (isMembershipTierColumnMissing(upsertError)) {
        const fallbackUpsert = await window.supabaseClient
          .from("profiles")
          .upsert(
            {
              id: userId,
              display_name: fallbackProfile.displayName || DEFAULT_PROFILE_NAME,
              avatar_url: fallbackProfile.avatarUrl || null,
            },
            { onConflict: "id" }
          );

        if (fallbackUpsert.error) {
          throw fallbackUpsert.error;
        }
      } else {
        throw upsertError;
      }
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
      class_reminder_enabled: cleanProfile.classReminderEnabled,
    },
  });

  if (error) {
    throw error;
  }

  let savedProfile = getProfileFromUser(data.user);
  const currentProfile = readProfileCache(userId);
  savedProfile = normalizeProfileData({
    ...savedProfile,
    membershipTier: currentProfile.membershipTier,
  });

  try {
    const { error: profileError } = await window.supabaseClient
      .from("profiles")
      .upsert(
        {
          id: userId,
          display_name: cleanProfile.displayName || DEFAULT_PROFILE_NAME,
          avatar_url: cleanProfile.avatarUrl || null,
          membership_tier: currentProfile.membershipTier || "free",
        },
        { onConflict: "id" }
      );

    if (profileError && !isProfilesTableMissing(profileError)) {
      if (isMembershipTierColumnMissing(profileError)) {
        const fallbackUpsert = await window.supabaseClient
          .from("profiles")
          .upsert(
            {
              id: userId,
              display_name: cleanProfile.displayName || DEFAULT_PROFILE_NAME,
              avatar_url: cleanProfile.avatarUrl || null,
            },
            { onConflict: "id" }
          );

        if (fallbackUpsert.error) {
          throw fallbackUpsert.error;
        }
      } else {
        throw profileError;
      }
    }

    if (!profileError || isMembershipTierColumnMissing(profileError)) {
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
      class_reminder_enabled: enabled,
    },
  });

  if (error) {
    throw error;
  }

  const savedProfile = getProfileFromUser(data.user);
  writeProfileCache(userId, {
    ...savedProfile,
    membershipTier: currentProfile.membershipTier,
  });
  markRemoteRefresh("profile", userId);
  return normalizeProfileData({
    ...savedProfile,
    membershipTier: currentProfile.membershipTier,
  });
}

async function setCurrentUserMembershipTier(userId, membershipTier) {
  const nextTier = String(membershipTier || "").toLowerCase() === "premium" ? "premium" : "free";
  const currentProfile = readProfileCache(userId);
  const nextProfile = normalizeProfileData({
    ...currentProfile,
    membershipTier: nextTier,
  });

  writeProfileMembershipOverride(userId, nextTier);
  writeProfileCache(userId, nextProfile);
  markRemoteRefresh("profile", userId);

  let data = null;
  try {
    const result = await window.supabaseClient.auth.updateUser({
      data: {
        display_name: nextProfile.displayName,
        avatar_data_url: nextProfile.avatarUrl,
        class_reminder_enabled: nextProfile.classReminderEnabled,
        membership_tier: nextTier,
      },
    });

    if (result.error) {
      console.error("Membership auth update error:", result.error);
      return nextProfile;
    }

    data = result.data;
  } catch (error) {
    console.error("Membership auth update error:", error);
    return nextProfile;
  }

  let savedProfile = getProfileFromUser(data.user);
  savedProfile = normalizeProfileData({
    ...savedProfile,
    displayName: nextProfile.displayName || savedProfile.displayName,
    avatarUrl: nextProfile.avatarUrl || savedProfile.avatarUrl,
    classReminderEnabled: nextProfile.classReminderEnabled,
    membershipTier: nextTier,
  });

  try {
    const { error: profileError } = await window.supabaseClient
      .from("profiles")
      .upsert(
        {
          id: userId,
          display_name: nextProfile.displayName || DEFAULT_PROFILE_NAME,
          avatar_url: nextProfile.avatarUrl || null,
          membership_tier: nextTier,
        },
        { onConflict: "id" }
      );

    if (profileError && !isProfilesTableMissing(profileError)) {
      if (isMembershipTierColumnMissing(profileError)) {
        const fallbackUpsert = await window.supabaseClient
          .from("profiles")
          .upsert(
            {
              id: userId,
              display_name: nextProfile.displayName || DEFAULT_PROFILE_NAME,
              avatar_url: nextProfile.avatarUrl || null,
            },
            { onConflict: "id" }
          );

        if (fallbackUpsert.error) {
          throw fallbackUpsert.error;
        }
      } else {
        console.error("Membership profile upsert error:", profileError);
        writeProfileCache(userId, savedProfile);
        markRemoteRefresh("profile", userId);
        return savedProfile;
      }
    }

    if (!profileError || isMembershipTierColumnMissing(profileError)) {
      const row = await fetchProfileRow(userId);
      if (row) {
        savedProfile = getProfileFromRow(row, data.user);
      }
    }
  } catch (profilesError) {
    if (!isProfilesTableMissing(profilesError)) {
      console.error("Membership profile sync error:", profilesError);
      writeProfileCache(userId, savedProfile);
      markRemoteRefresh("profile", userId);
      return savedProfile;
    }
  }

  writeProfileCache(userId, savedProfile);
  markRemoteRefresh("profile", userId);
  return savedProfile;
}

async function fetchAllProfiles() {
  const { data, error } = await window.supabaseClient
    .from("profiles")
    .select("id, display_name, avatar_url, membership_tier");

  if (error) {
    if (isMembershipTierColumnMissing(error)) {
      const fallbackResult = await window.supabaseClient
        .from("profiles")
        .select("id, display_name, avatar_url");

      if (fallbackResult.error) {
        throw fallbackResult.error;
      }

      markRemoteRefresh("profiles_public", "");
      return (fallbackResult.data || []).map((row) => ({
        ...row,
        membership_tier: "free",
      }));
    }

    if (isProfilesTableMissing(error)) {
      return [];
    }

    throw error;
  }

  markRemoteRefresh("profiles_public", "");
  return data || [];
}
