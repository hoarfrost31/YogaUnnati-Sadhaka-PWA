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

function renderMilestones(practiceDates = []) {
  const container = document.getElementById("milestoneList");
  const premiumNoteEl = document.getElementById("milestonePremiumNote");
  container.innerHTML = "";

  const milestoneProgressCount = getMilestoneProgressCount(practiceDates);
  const currentState = getCurrentMilestoneState(userId, milestoneProgressCount);
  const hasPremiumMask = !isPremiumMember;

  milestones.forEach((milestone, index) => {
    const isCompleted = index < currentState.index;
    const isCurrent = index === currentState.index;
    const isPremiumLocked = hasPremiumMask && index >= 1;

    let status = "";
    if (isCompleted) status = "completed";
    else if (isCurrent) status = "current";
    else status = "locked";

    if (isPremiumLocked) {
      status = "premium-locked";
    }

    let progress = 0;
    if (isCompleted) {
      progress = 100;
    } else if (isCurrent) {
      progress = (milestoneProgressCount / milestone.days) * 100;
    }

    const remaining = Math.max(0, milestone.days - milestoneProgressCount);
    container.innerHTML += `
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
            ${isPremiumLocked
              ? `${getUiIconSvg("lock")}<span>Premium</span>`
              : isCompleted
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
          ${isPremiumLocked ? "Unlock premium to continue beyond Sankalpa" : status === "locked" ? "" : !isCompleted ? `${remaining} days to go` : "Completed"}
        </div>

        ${isPremiumLocked ? `
          <div class="milestone-premium-overlay">
            <p>Keep going with premium to unlock the next stages of your journey.</p>
            <button type="button" class="milestone-premium-btn" data-feature="milestones">Unlock Premium</button>
          </div>
        ` : ""}
      </div>
    `;
  });

  if (hasPremiumMask) {
    container.innerHTML += `
      <div class="milestone-tail-note">
        <div class="milestone-tail-icon">${getUiIconSvg("sparkles")}</div>
        <div class="milestone-tail-copy">
          <h3>Many more milestones ahead</h3>
          <p>Stay curious. Your journey opens into deeper stages with premium access.</p>
        </div>
      </div>
    `;
  }

  if (premiumNoteEl) {
    premiumNoteEl.classList.toggle("hidden", !hasPremiumMask);
    premiumNoteEl.innerHTML = hasPremiumMask
      ? `<span>${getUiIconSvg("lock")}</span><p>Sankalpa stays open. Deeper milestones unlock with premium.</p>`
      : "";
  }

  container.querySelectorAll(".milestone-premium-btn").forEach((buttonEl) => {
    buttonEl.addEventListener("click", () => {
      window.appAnalytics?.track("open_premium_paywall", {
        source: "milestones_card",
        feature: "milestones",
      });
      window.premiumAccess?.handleLockedFeature?.("milestones", "milestones_card");
    });
  });
  scrollCurrentMilestoneIntoView();
}

async function initApp() {
  await initUser();
  window.appAnalytics?.identify(userId);
  const premiumState = await window.premiumAccess?.refresh?.();
  isPremiumMember = Boolean(premiumState?.isPremium);
  renderMilestones(readPracticeCache(userId));
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
