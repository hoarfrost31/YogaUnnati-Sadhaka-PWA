const ADMIN_ACCESS_KEY = "yogaunnati_admin_access_v1";
const ADMIN_EMAILS = ["nkapse27@gmail.com"];

function normalizeAdminEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isAllowedAdminEmail(email) {
  return ADMIN_EMAILS.includes(normalizeAdminEmail(email));
}

function readAdminAccessRecord() {
  try {
    const raw = localStorage.getItem(ADMIN_ACCESS_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    console.error("Admin access read error:", error);
    return null;
  }
}

function writeAdminAccessRecord(record) {
  try {
    if (!record) {
      localStorage.removeItem(ADMIN_ACCESS_KEY);
      return;
    }

    localStorage.setItem(ADMIN_ACCESS_KEY, JSON.stringify(record));
  } catch (error) {
    console.error("Admin access write error:", error);
  }
}

async function resolveAdminUserWithRetry() {
  const attempts = [
    { forceRefresh: false, delay: 0 },
    { forceRefresh: true, delay: 150 },
    { forceRefresh: true, delay: 250 },
    { forceRefresh: true, delay: 400 },
    { forceRefresh: true, delay: 600 },
  ];

  for (const attempt of attempts) {
    if (attempt.delay) {
      await new Promise((resolve) => window.setTimeout(resolve, attempt.delay));
    }

    const user = await window.appAuth?.getCurrentUser?.({ forceRefresh: attempt.forceRefresh });
    if (user?.id) {
      return user;
    }
  }

  return null;
}

window.adminAccess = {
  isAllowedEmail(email) {
    return isAllowedAdminEmail(email);
  },
  grant(email) {
    const normalizedEmail = normalizeAdminEmail(email);
    if (!isAllowedAdminEmail(normalizedEmail)) {
      writeAdminAccessRecord(null);
      return false;
    }

    writeAdminAccessRecord({
      email: normalizedEmail,
      grantedAt: Date.now(),
    });
    return true;
  },
  clear() {
    writeAdminAccessRecord(null);
  },
  getRecord() {
    return readAdminAccessRecord();
  },
  async logout() {
    writeAdminAccessRecord(null);
    window.appAuth?.clearCachedUser?.();

    try {
      await window.supabaseClient?.auth?.signOut?.();
    } catch (error) {
      console.error("Admin logout failed:", error);
    }

    window.location.href = "admin-login.html";
  },
  async requireAdminAccess(options = {}) {
    const redirectTo = options.redirectTo || "admin-login.html";
    const user = await resolveAdminUserWithRetry();
    const record = readAdminAccessRecord();
    const email = normalizeAdminEmail(user?.email);

    if (!user?.id || !isAllowedAdminEmail(email) || !record?.email || record.email !== email) {
      writeAdminAccessRecord(null);
      window.location.href = redirectTo;
      return null;
    }

    return {
      id: user.id,
      email: user.email || "",
    };
  },
};

window.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-admin-logout]").forEach((button) => {
    button.addEventListener("click", () => {
      window.adminAccess?.logout?.();
    });
  });
});
