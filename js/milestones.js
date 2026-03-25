const supabaseClient = window.supabaseClient;

let userId;
let isPremiumMember = false;

async function initUser() {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  if (sessionData?.session?.user) {
    userId = sessionData.session.user.id;
    return;
  }

  const { data } = await supabaseClient.auth.getUser();
  if (!data.user) {
    window.location.href = "auth.html";
    return;
  }

  userId = data.user.id;
}

const milestones = APP_MILESTONES;
const PRACTICE_REFRESH_TTL_MS = 90 * 1000;

function getCachedPremiumState() {
  const profile = readProfileCache(userId);
  return String(profile.membershipTier || "").toLowerCase() === "premium";
}

function scrollCurrentMilestoneIntoView() {
  const currentCard = document.querySelector(".milestone-card.current");

  if (!currentCard) {
    return;
  }

  const rect = currentCard.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const topThreshold = viewportHeight * 0.2;
  const bottomThreshold = viewportHeight * 0.82;

  if (rect.top >= topThreshold && rect.bottom <= bottomThreshold) {
    return;
  }

  window.requestAnimationFrame(() => {
    currentCard.scrollIntoView({
      behavior: "auto",
      block: "center",
    });
  });
}

async function refreshMilestones() {
  try {
    const dates = await fetchPracticeDates(userId);
    renderMilestones(dates);
  } catch (error) {
    console.error(error);
  }
}

function renderMilestonesLockedState(practiceDates = []) {
  const container = document.getElementById("milestoneList");
  if (!container) {
    return;
  }

  const milestoneProgressCount = getMilestoneProgressCount(practiceDates);
  const currentState = getCurrentMilestoneState(userId, Math.min(milestoneProgressCount, APP_MILESTONES[0].days));
  const previewMarkup = milestones.map((milestone, index) => {
    const isCompleted = index < currentState.index;
    const isCurrent = index === currentState.index;
    const status = isCompleted ? "completed" : isCurrent ? "current" : "locked";
    const progress = isCompleted ? 100 : isCurrent ? (Math.min(milestoneProgressCount, milestone.days) / milestone.days) * 100 : 0;
    const remaining = Math.max(0, milestone.days - Math.min(milestoneProgressCount, milestone.days));

    return `
      <div class="milestone-card ${status}">
        <div class="milestone-promo ${isCurrent ? "is-current" : ""} ${milestone.imageClass || ""}" aria-hidden="true">
          <img src="${milestone.image}" alt="" class="milestone-promo-img" />
        </div>
        <div class="milestone-top">
          <div>
            <div class="milestone-title-row">
              <div class="milestone-title-icon">${getMilestoneIconSvg(milestone.icon)}</div>
              <h3>${milestone.title}</h3>
            </div>
            <p>${milestone.level}</p>
            <span>${milestone.desc}</span>
          </div>
          <span class="badge-text">
            ${isCompleted
              ? `${getUiIconSvg("check-circle-2")}<span>Completed</span>`
              : isCurrent
                ? `${getUiIconSvg("activity")}<span>In Progress</span>`
                : `${getUiIconSvg("lock")}<span>Locked</span>`}
          </span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${progress}%"></div>
        </div>
        <div class="progress-text">
          ${isCurrent ? `${Math.min(milestoneProgressCount, milestone.days)} / ${milestone.days} days` : ""}
        </div>
        <div class="remaining">
          ${status === "locked" ? "" : !isCompleted ? `${remaining} days to go` : "Completed"}
        </div>
      </div>
    `;
  }).join("");

  container.innerHTML = `
    <div class="premium-preview-shell">
      <div class="premium-page-preview premium-page-preview-milestones">
        ${previewMarkup}
      </div>
      <div class="premium-page-lock-overlay">
        <section class="premium-hero-card premium-inline-lock-card">
          <span class="premium-hero-badge">Premium</span>
          <h2 class="premium-inline-title">Unlock the milestone journey</h2>
          <p class="subtitle premium-inline-subtitle">Milestones beyond Sankalpa open with premium access.</p>

          <div class="premium-benefits premium-inline-benefits">
            <div class="premium-benefit">
              <span class="premium-benefit-icon" aria-hidden="true">&#10003;</span>
              <span>See all milestone stages</span>
            </div>
            <div class="premium-benefit">
              <span class="premium-benefit-icon" aria-hidden="true">&#10003;</span>
              <span>Track your deeper journey</span>
            </div>
            <div class="premium-benefit">
              <span class="premium-benefit-icon" aria-hidden="true">&#10003;</span>
              <span>Unlock the full path ahead</span>
            </div>
          </div>

          <button type="button" class="primary-btn premium-unlock-btn" data-feature="milestones">Unlock Premium</button>
        </section>
      </div>
    </div>
  `;

  container.querySelector('[data-feature="milestones"]')?.addEventListener("click", () => {
    window.appAnalytics?.track("open_premium_paywall", {
      source: "milestones_page_lock",
      feature: "milestones",
    });
    window.premiumAccess?.handleLockedFeature?.("milestones", "milestones_page_lock");
  });
}

function renderMilestones(practiceDates = []) {
  const container = document.getElementById("milestoneList");
  if (!isPremiumMember) {
    renderMilestonesLockedState(practiceDates);
    return;
  }

  container.innerHTML = "";

  const milestoneProgressCount = getMilestoneProgressCount(practiceDates);
  const currentState = getCurrentMilestoneState(userId, milestoneProgressCount);
  const renderedCards = [];

  milestones.forEach((milestone, index) => {
    const isCompleted = index < currentState.index;
    const isCurrent = index === currentState.index;

    let status = "";
    if (isCompleted) status = "completed";
    else if (isCurrent) status = "current";
    else status = "locked";

    let progress = 0;
    if (isCompleted) {
      progress = 100;
    } else if (isCurrent) {
      progress = (milestoneProgressCount / milestone.days) * 100;
    }

    const remaining = Math.max(0, milestone.days - milestoneProgressCount);
    const cardMarkup = `
      <div class="milestone-card ${status}">
        <div class="milestone-promo ${isCurrent ? "is-current" : ""} ${milestone.imageClass || ""}" aria-hidden="true">
          <img src="${milestone.image}" alt="" class="milestone-promo-img" />
        </div>

        <div class="milestone-top">
          <div>
            <div class="milestone-title-row">
              <div class="milestone-title-icon">${getMilestoneIconSvg(milestone.icon)}</div>
              <h3>${milestone.title}</h3>
            </div>
            <p>${milestone.level}</p>
            <span>${milestone.desc}</span>
          </div>
          <span class="badge-text">
            ${isCompleted
              ? `${getUiIconSvg("check-circle-2")}<span>Completed</span>`
              : isCurrent
                ? `${getUiIconSvg("activity")}<span>In Progress</span>`
                : `${getUiIconSvg("lock")}<span>Locked</span>`}
          </span>
        </div>

        <div class="progress-bar">
          <div class="progress-fill" style="width: ${progress}%"></div>
        </div>

        <div class="progress-text">
          ${status === "current" ? `${Math.min(milestoneProgressCount, milestone.days)} / ${milestone.days} days` : ""}
        </div>

        <div class="remaining">
          ${status === "locked" ? "" : !isCompleted ? `${remaining} days to go` : "Completed"}
        </div>
      </div>
    `;

    renderedCards.push(cardMarkup);
  });

  container.innerHTML = renderedCards.join("");
  scrollCurrentMilestoneIntoView();
}

async function initApp() {
  await initUser();
  window.appAnalytics?.identify(userId);
  isPremiumMember = getCachedPremiumState();
  renderMilestones(readPracticeCache(userId));

  window.premiumAccess?.refresh?.()
    .then((premiumState) => {
      const nextPremiumState = Boolean(premiumState?.isPremium);
      if (nextPremiumState !== isPremiumMember) {
        isPremiumMember = nextPremiumState;
        renderMilestones(readPracticeCache(userId));
      }
    })
    .catch((error) => {
      console.error("Milestone premium refresh error:", error);
    });

  if (shouldRefreshRemote("practice_dates", userId, PRACTICE_REFRESH_TTL_MS)) {
    refreshMilestones();
  }
}

document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !userId) {
    return;
  }

  try {
    if (shouldRefreshRemote("practice_dates", userId, PRACTICE_REFRESH_TTL_MS)) {
      await refreshMilestones();
    }
  } catch (error) {
    console.error(error);
  }
});

initApp();
