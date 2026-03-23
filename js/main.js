
// 🎯 Elements
const button = document.querySelector(".program-btn");
const weekStripEl = document.getElementById("weekStrip");
const weekCardLinkEl = document.getElementById("weekCardLink");
const homeAvatarEl = document.getElementById("homeAvatar");
const homeAvatarInitialEl = document.getElementById("homeAvatarInitial");
const communityAvatarImgEl = document.getElementById("communityAvatarImg");
const communityAvatarInitialEl = document.getElementById("communityAvatarInitial");
const communityProfileNameEl = document.getElementById("communityProfileName");
const homeMilestoneIconEl = document.getElementById("homeMilestoneIcon");
const homeMilestoneImageEl = document.getElementById("homeMilestoneImage");
const homeMilestonePromoEl = document.getElementById("homeMilestonePromo");
const homeMilestoneTitleEl = document.getElementById("homeMilestoneTitle");
const homeMilestoneLevelEl = document.getElementById("homeMilestoneLevel");
const homeMilestoneProgressEl = document.getElementById("homeMilestoneProgress");
const homeMilestoneRemainingEl = document.getElementById("homeMilestoneRemaining");
const homeMilestoneDotsEl = document.getElementById("homeMilestoneDots");
const brandTaglineEl = document.getElementById("brandTagline");

// 👤 Temporary user (replace later with auth)
// const userId = "user_1";
let userId;
let practiceDates = [];
let taglineIndex = 0;
let taglineTimer = null;

const BRAND_TAGLINES = [
  "Hatha Yoga in its purest form",
  "Mastering body and mind",
];

function initBrandTaglineRotation() {
  if (!brandTaglineEl || BRAND_TAGLINES.length < 2 || taglineTimer) {
    return;
  }

  brandTaglineEl.textContent = BRAND_TAGLINES[taglineIndex];

  taglineTimer = window.setInterval(() => {
    brandTaglineEl.classList.add("is-switching");

    window.setTimeout(() => {
      taglineIndex = (taglineIndex + 1) % BRAND_TAGLINES.length;
      brandTaglineEl.textContent = BRAND_TAGLINES[taglineIndex];
      brandTaglineEl.classList.remove("is-switching");
    }, 420);
  }, 5000);
}

function applyHomeProfile(profile) {
  const activeProfile = normalizeProfileData(profile);
  const displayName = activeProfile.displayName || DEFAULT_PROFILE_NAME;
  const avatarSrc = activeProfile.avatarUrl || DEFAULT_PROFILE_AVATAR;
  const hasCustomAvatar = Boolean(activeProfile.avatarUrl);

  if (homeAvatarEl) {
    homeAvatarEl.src = avatarSrc;
    homeAvatarEl.classList.toggle("hidden", !hasCustomAvatar);
  }

  if (homeAvatarInitialEl) {
    homeAvatarInitialEl.textContent = getInitials(displayName);
    homeAvatarInitialEl.classList.toggle("hidden", hasCustomAvatar);
  }

  if (communityAvatarImgEl) {
    if (hasCustomAvatar) {
      communityAvatarImgEl.src = avatarSrc;
      communityAvatarImgEl.classList.remove("hidden");
    } else {
      communityAvatarImgEl.classList.add("hidden");
    }
  }

  if (communityAvatarInitialEl) {
    communityAvatarInitialEl.textContent = getInitials(displayName);
    communityAvatarInitialEl.classList.toggle("hidden", hasCustomAvatar);
  }

  if (communityProfileNameEl) {
    communityProfileNameEl.textContent = displayName;
  }
}

async function loadHomeProfile() {
  if (!userId) {
    return;
  }

  applyHomeProfile(readProfileCache(userId));

  try {
    const profile = await refreshCurrentUserProfile(userId);
    applyHomeProfile(profile);
  } catch (error) {
    console.error("Profile refresh error:", error);
  }
}

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

function getTodayIsoDate() {
  return new Date().toISOString().split("T")[0];
}

// 🧠 State
let isMarked = false;

function updateProgramButtonState() {
  button.classList.toggle("is-done", isMarked);

  if (isMarked) {
    button.textContent = "Done for Today";
    button.setAttribute("aria-label", "Done for today");
  } else {
    button.textContent = "Mark Today";
    button.setAttribute("aria-label", "Mark today");
  }
}

function syncHomeUI() {
  const today = getTodayIsoDate();
  isMarked = practiceDates.includes(today);
  updateProgramButtonState();
  renderWeek(practiceDates);
  renderHomeMilestoneProgress();
}

function renderHomeMilestoneProgress() {
  const milestoneProgressCount = getMilestoneProgressCount(practiceDates);
  const state = getCurrentMilestoneState(userId, milestoneProgressCount);
  const total = state.totalWithinMilestone;
  const completed = Math.min(state.completedWithinMilestone, total);
  const remaining = Math.max(0, state.remainingDays);

  if (homeMilestoneTitleEl) {
    homeMilestoneTitleEl.textContent = state.milestone.title;
  }

  if (homeMilestoneIconEl) {
    homeMilestoneIconEl.innerHTML = getMilestoneIconSvg(state.milestone.icon);
  }

  if (homeMilestoneImageEl) {
    homeMilestoneImageEl.src = state.milestone.image;
  }

  if (homeMilestonePromoEl) {
    homeMilestonePromoEl.className = `program-promo ${state.milestone.imageClass || ""}`.trim();
  }

  if (homeMilestoneLevelEl) {
    homeMilestoneLevelEl.textContent = state.milestone.level;
  }

  if (homeMilestoneProgressEl) {
    homeMilestoneProgressEl.textContent = `Day ${completed} / ${total}`;
  }

  if (homeMilestoneRemainingEl) {
    homeMilestoneRemainingEl.textContent = remaining === 0 ? "Completed" : `${remaining} days to go`;
  }

  if (homeMilestoneDotsEl) {
    const dots = homeMilestoneDotsEl.querySelectorAll("span");
    dots.forEach((dot, index) => {
      dot.classList.toggle("active", index < completed);
    });
  }
}

// ➕ Insert today's practice
async function markToday() {
  const today = getTodayIsoDate();

    if (!userId) {
    console.error("User not loaded");
    return;
  }

  const { error } = await supabaseClient
    .from("practice_logs")
    .insert([
      {
        user_id: userId,
        date: today,
      },
    ]);

  if (error) {
    console.error("Insert error:", error);
    return;
  }

  addPracticeDateToCache(userId, today);
  if (!practiceDates.includes(today)) {
    practiceDates.push(today);
  }
  syncHomeUI();
}


// ❌ Remove today's practice
async function unmarkToday() {
  const today = getTodayIsoDate();
  const { error } = await supabaseClient
    .from("practice_logs")
    .delete()
    .eq("user_id", userId)
    .eq("date", today);

  if (error) {
    console.error("Delete error:", error);
    return;
  }

  removePracticeDateFromCache(userId, today);
  practiceDates = practiceDates.filter((date) => date !== today);
  syncHomeUI();
}

function renderWeek(practiceDates) {
  if (!weekStripEl) {
    return;
  }

  const today = getTodayIsoDate();
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);

  const startOfWeek = new Date(todayDate);
  startOfWeek.setDate(todayDate.getDate() - todayDate.getDay());

  const practicedSet = new Set(practiceDates);
  weekStripEl.innerHTML = "";

  for (let i = 0; i < 7; i++) {
    const date = new Date(startOfWeek);
    date.setDate(startOfWeek.getDate() + i);

    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const formattedDate = `${yyyy}-${mm}-${dd}`;

    const isToday = formattedDate === today;
    const isDone = practicedSet.has(formattedDate);

    const dayLabel = date.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 1);

    weekStripEl.innerHTML += `
      <div class="week-day ${isDone ? "done" : ""} ${isToday ? "today" : ""}">
        <span class="week-day-label">${dayLabel}</span>
        <span class="week-day-date">${date.getDate()}</span>
      </div>
    `;
  }

}

async function refreshPracticeDates() {
  try {
    practiceDates = await fetchPracticeDates(userId);
    syncHomeUI();
  } catch (error) {
    console.error("Week error:", error);
  }
}

document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !userId) {
    return;
  }

  try {
    await Promise.all([
      refreshPracticeDates(),
      loadHomeProfile(),
    ]);
  } catch (error) {
    console.error("Home refresh error:", error);
  }
});

// 🔁 Button toggle
button.addEventListener("click", async () => {
  if (isMarked) {
    await unmarkToday();
  } else {
    await markToday();
  }
});

// LogOut
const logoutBtn = document.getElementById("logoutBtn");

if (logoutBtn) {
  logoutBtn.onclick = async () => {
    await supabaseClient.auth.signOut();
    window.location.href = "auth.html";
  };
}

if (weekCardLinkEl) {
  weekCardLinkEl.addEventListener("click", () => {
    window.location.href = "progress.html";
  });

  weekCardLinkEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      window.location.href = "progress.html";
    }
  });
}

// 🚀 Init

// checkToday();
// loadStats();

async function initApp() {
  await initUser();   // 🔥 must complete first
  loadHomeProfile();
  practiceDates = readPracticeCache(userId);
  syncHomeUI();
  refreshPracticeDates();

}

initBrandTaglineRotation();
initApp();
