const supabaseClient = window.supabaseClient;

let userId;

async function initUser() {
  const currentUser = await window.appAuth.getCurrentUser();
  if (!currentUser?.id) {
    window.location.href = "auth.html";
    return;
  }

  userId = currentUser.id;
}

function hydrateMilestonesFromCache() {
  if (!userId) {
    return;
  }

  renderMilestones(readPracticeCache(userId));
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
  container.innerHTML = "";

  const milestoneProgressCount = getMilestoneProgressCount(practiceDates);
  const currentState = getCurrentMilestoneState(userId, milestoneProgressCount);

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
            ${isCompleted ? `${getUiIconSvg("check-circle-2")}<span>Completed</span>` : isCurrent ? `${getUiIconSvg("activity")}<span>In Progress</span>` : `${getUiIconSvg("lock")}<span>Locked</span>`}
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
  });
  scrollCurrentMilestoneIntoView();
}

async function initApp() {
  const cachedUser = window.appAuth?.getCachedUser?.();
  if (cachedUser?.id) {
    userId = cachedUser.id;
    hydrateMilestonesFromCache();
  }

  await initUser();
  window.appAnalytics?.identify(userId);
  hydrateMilestonesFromCache();
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


