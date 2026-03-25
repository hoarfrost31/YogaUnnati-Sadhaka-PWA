const premiumTitleEl = document.getElementById("premiumTitle");
const premiumSubtitleEl = document.getElementById("premiumSubtitle");
const premiumBackBtn = document.getElementById("premiumBackBtn");
const premiumUnlockBtn = document.getElementById("premiumUnlockBtn");

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
  premiumUnlockBtn.addEventListener("click", () => {
    window.appAnalytics?.track("unlock_premium_click", {
      source: "premium_page",
      feature: getPremiumFeature(),
    });
    window.open("https://www.yogaunnati.com/en", "_blank", "noopener,noreferrer");
  });
}

applyPremiumCopy();
