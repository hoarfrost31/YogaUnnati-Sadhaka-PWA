const premiumTitleEl = document.getElementById("premiumTitle");
const premiumSubtitleEl = document.getElementById("premiumSubtitle");
const premiumBackBtn = document.getElementById("premiumBackBtn");
const premiumUnlockBtn = document.getElementById("premiumUnlockBtn");
const premiumResetBtn = document.getElementById("premiumResetBtn");

const PREMIUM_COPY = {
  milestones: {
    title: "Unlock Milestones",
    subtitle: "Go deeper with full access to your milestone journey and all four stages of progress.",
  },
  community: {
    title: "Unlock Community",
    subtitle: "See the community board, explore member journeys, and feel part of the wider practice space.",
  },
  default: {
    title: "Unlock Premium",
    subtitle: "Go deeper with full access to your milestone journey and the YogaUnnati community.",
  },
};

function getPremiumFeature() {
  const feature = new URLSearchParams(window.location.search).get("feature") || "";
  return PREMIUM_COPY[feature] ? feature : "default";
}

function getPremiumReturnPage() {
  const feature = getPremiumFeature();
  if (feature === "milestones") {
    return "milestones.html";
  }

  if (feature === "community") {
    return "community.html";
  }

  return "index.html";
}

function applyPremiumCopy() {
  const feature = getPremiumFeature();
  const copy = PREMIUM_COPY[feature];

  if (premiumTitleEl) {
    premiumTitleEl.textContent = copy.title;
  }

  if (premiumSubtitleEl) {
    premiumSubtitleEl.textContent = copy.subtitle;
  }
}

if (premiumBackBtn) {
  premiumBackBtn.addEventListener("click", () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    window.location.href = "index.html";
  });
}

if (premiumUnlockBtn) {
  premiumUnlockBtn.addEventListener("click", async () => {
    window.appAnalytics?.track("unlock_premium_click", {
      source: "premium_page",
      feature: getPremiumFeature(),
    });

    premiumUnlockBtn.disabled = true;
    const originalLabel = premiumUnlockBtn.textContent;
    premiumUnlockBtn.textContent = "Unlocking...";

    try {
      const { data } = await window.supabaseClient.auth.getUser();
      const user = data?.user;

      if (!user?.id) {
        window.location.href = "auth.html";
        return;
      }

      await setCurrentUserMembershipTier(user.id, "premium");

      if (window.premiumAccess?.refresh) {
        await window.premiumAccess.refresh();
      }

      window.location.href = getPremiumReturnPage();
    } catch (error) {
      console.error("Premium unlock error:", error);
      premiumUnlockBtn.disabled = false;
      premiumUnlockBtn.textContent = originalLabel;
    }
  });
}

if (premiumResetBtn) {
  premiumResetBtn.addEventListener("click", async () => {
    premiumResetBtn.disabled = true;
    const originalLabel = premiumResetBtn.textContent;
    premiumResetBtn.textContent = "Resetting...";

    try {
      const { data } = await window.supabaseClient.auth.getUser();
      const user = data?.user;

      if (!user?.id) {
        window.location.href = "auth.html";
        return;
      }

      await setCurrentUserMembershipTier(user.id, "free");

      if (window.premiumAccess?.refresh) {
        await window.premiumAccess.refresh();
      }

      window.location.href = "index.html";
    } catch (error) {
      console.error("Premium reset error:", error);
      premiumResetBtn.disabled = false;
      premiumResetBtn.textContent = originalLabel;
    }
  });
}

applyPremiumCopy();
