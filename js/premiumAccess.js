const PREMIUM_PAGE_NAME = "premium.html";
const PREMIUM_REFRESH_TTL_MS = 2 * 60 * 1000;
let premiumAccessUserId = "";
let premiumAccessTier = "free";
let premiumAccessResolved = false;

function getPremiumCurrentPageName() {
  return window.location.pathname.split("/").pop() || "index.html";
}

function isPremiumTier(tier) {
  return String(tier || "").toLowerCase() === "premium";
}

function getPremiumFeatureFromPage(pageName) {
  if (pageName === "member.html") {
    return "community";
  }

  return "";
}

function getPremiumPageUrl(feature = "", source = "") {
  const url = new URL(PREMIUM_PAGE_NAME, window.location.href);
  if (feature) {
    url.searchParams.set("feature", feature);
  }
  if (source) {
    url.searchParams.set("from", source);
  }
  return `${url.pathname}${url.search}`;
}

function goToPremiumPage(feature = "", source = "") {
  const url = getPremiumPageUrl(feature, source);
  if (typeof window.navigateToPage === "function") {
    window.navigateToPage(url);
    return;
  }

  window.location.href = url;
}

function getProtectedFeatureFromAnchor(anchor) {
  if (!anchor) {
    return "";
  }

  if (anchor.dataset.premiumBypass === "self-profile") {
    return "";
  }

  const url = new URL(anchor.href, window.location.href);
  const pageName = url.pathname.split("/").pop() || "";
  if (pageName === "member.html") {
    const memberId = url.searchParams.get("uid") || "";
    if (memberId && premiumAccessUserId && memberId === premiumAccessUserId) {
      return "";
    }
  }
  return getPremiumFeatureFromPage(pageName);
}

function decoratePremiumLinks() {
  document.querySelectorAll("a[href]").forEach((anchor) => {
    const feature = getProtectedFeatureFromAnchor(anchor);
    if (!feature) {
      return;
    }

    if (premiumAccessTier === "premium") {
      anchor.classList.remove("is-premium-locked");
      delete anchor.dataset.premiumLink;
      return;
    }

    anchor.classList.add("is-premium-locked");
    anchor.dataset.premiumLink = feature;
  });
}

async function resolveCurrentUserId() {
  const { data: sessionData } = await window.supabaseClient.auth.getSession();
  if (sessionData?.session?.user?.id) {
    return sessionData.session.user.id;
  }

  const { data } = await window.supabaseClient.auth.getUser();
  return data?.user?.id || "";
}

async function resolvePremiumState(forceRefresh = false) {
  premiumAccessUserId = await resolveCurrentUserId();
  if (!premiumAccessUserId) {
    premiumAccessResolved = true;
    premiumAccessTier = "free";
    return { userId: "", tier: "free", isPremium: false };
  }

  let profile = readProfileCache(premiumAccessUserId);

  if (
    forceRefresh ||
    shouldRefreshRemote("profile", premiumAccessUserId, PREMIUM_REFRESH_TTL_MS) ||
    !profile.membershipTier
  ) {
    try {
      profile = await refreshCurrentUserProfile(premiumAccessUserId);
    } catch (error) {
      console.error("Premium membership refresh error:", error);
      profile = readProfileCache(premiumAccessUserId);
    }
  }

  premiumAccessTier = profile.membershipTier || "free";
  premiumAccessResolved = true;
  return {
    userId: premiumAccessUserId,
    tier: premiumAccessTier,
    isPremium: isPremiumTier(premiumAccessTier),
  };
}

async function guardProtectedPage() {
  const currentPage = getPremiumCurrentPageName();
  if (currentPage === PREMIUM_PAGE_NAME || currentPage === "auth.html") {
    return;
  }

  const feature = getPremiumFeatureFromPage(currentPage);
  if (!feature && currentPage !== "member.html") {
    return;
  }

  const state = await resolvePremiumState();
  if (!state.userId) {
    return;
  }

  if (currentPage === "member.html") {
    const memberId = new URLSearchParams(window.location.search).get("uid") || "";
    if (memberId && memberId === state.userId) {
      return;
    }
  }

  if (currentPage === "member.html" && !state.isPremium) {
    goToPremiumPage(feature || "community", currentPage);
  }
}

document.addEventListener("click", (event) => {
  const anchor = event.target.closest("a[href]");
  const feature = getProtectedFeatureFromAnchor(anchor);
  if (!feature || premiumAccessTier === "premium") {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  window.appAnalytics?.track("open_premium_paywall", {
    source: "locked_link",
    feature,
    from: getPremiumCurrentPageName(),
  });
  goToPremiumPage(feature, getPremiumCurrentPageName());
}, true);

window.premiumAccess = {
  async init() {
    const state = await resolvePremiumState();
    decoratePremiumLinks();
    return state;
  },
  async refresh() {
    const state = await resolvePremiumState(true);
    decoratePremiumLinks();
    return state;
  },
  isPremium() {
    return premiumAccessTier === "premium";
  },
  isResolved() {
    return premiumAccessResolved;
  },
  handleLockedFeature(feature, source = "") {
    if (premiumAccessResolved && premiumAccessTier === "premium") {
      return false;
    }

    if (!premiumAccessResolved) {
      return false;
    }

    window.appAnalytics?.track("open_premium_paywall", {
      source: source || "feature",
      feature,
      from: getPremiumCurrentPageName(),
    });
    goToPremiumPage(feature, source || getPremiumCurrentPageName());
    return true;
  },
};

guardProtectedPage().catch((error) => {
  console.error("Premium guard error:", error);
});

window.premiumAccess.init().catch((error) => {
  console.error("Premium access init error:", error);
});
