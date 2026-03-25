const memberProfileAvatarEl = document.getElementById("memberProfileAvatar");
const memberProfileInitialEl = document.getElementById("memberProfileInitial");
const memberBackLinkEl = document.getElementById("memberBackLink");
const memberProfileNameEl = document.getElementById("memberProfileName");
const memberProfileStatusEl = document.getElementById("memberProfileStatus");
const memberProfileSinceEl = document.getElementById("memberProfileSince");
const memberProfileEditLinkEl = document.getElementById("memberProfileEditLink");
const memberMilestoneIconEl = document.getElementById("memberMilestoneIcon");
const memberMilestoneTitleEl = document.getElementById("memberMilestoneTitle");
const memberMilestoneLevelEl = document.getElementById("memberMilestoneLevel");
const memberTotalDaysEl = document.getElementById("memberTotalDays");
const memberStreakEl = document.getElementById("memberStreak");
const MEMBER_PROFILE_CACHE_PREFIX = "member_profile_cache_v1:";
const MEMBER_PROFILE_REFRESH_TTL_MS = 2 * 60 * 1000;
let currentUserId = "";

function getTodayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMemberProfileCacheKey(memberId) {
  return `${MEMBER_PROFILE_CACHE_PREFIX}${memberId}`;
}

function readMemberProfileCache(memberId) {
  if (!memberId) {
    return null;
  }

  try {
    const raw = localStorage.getItem(getMemberProfileCacheKey(memberId));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    console.error("Member profile cache read error:", error);
    return null;
  }
}

function writeMemberProfileCache(memberId, snapshot) {
  if (!memberId) {
    return;
  }

  try {
    localStorage.setItem(
      getMemberProfileCacheKey(memberId),
      JSON.stringify({
        ...snapshot,
        cachedAt: Date.now(),
      })
    );
  } catch (error) {
    console.error("Member profile cache write error:", error);
  }
}

function shouldRefreshMemberProfile(snapshot) {
  if (!snapshot?.cachedAt) {
    return true;
  }

  return Date.now() - Number(snapshot.cachedAt) > MEMBER_PROFILE_REFRESH_TTL_MS;
}

function parseLocalDate(dateString) {
  const [year, month, day] = String(dateString).split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function calculateStreak(practiceDates) {
  const dates = [...practiceDates].sort().reverse();
  let streak = 0;
  let compareDate = new Date();
  compareDate.setHours(0, 0, 0, 0);

  for (let i = 0; i < dates.length; i++) {
    const date = parseLocalDate(dates[i]);
    const diff = Math.floor((compareDate - date) / (1000 * 60 * 60 * 24));

    if (diff === 0 || diff === 1) {
      streak += 1;
      compareDate = date;
    } else {
      break;
    }
  }

  return streak;
}

function getMemberStatus({ practicedToday, streak, milestoneTitle, totalDays }) {
  if (practicedToday) {
    return "Practiced today and showing up with intention.";
  }

  if (streak >= 5) {
    return `${streak} day streak and still staying on track.`;
  }

  if (totalDays > 0) {
    return `Currently walking the path of ${milestoneTitle}.`;
  }

  return "A new journey is just beginning.";
}

function formatLongDate(dateString) {
  if (!dateString) {
    return "";
  }

  const date = parseLocalDate(dateString);
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function buildMemberSnapshot(memberId, profileRow, practiceDates) {
  const uniquePracticeDates = [...new Set(practiceDates)].sort();
  const totalDays = uniquePracticeDates.length;
  const streak = calculateStreak(uniquePracticeDates);
  const milestoneState = getCurrentMilestoneState(memberId, getMilestoneProgressCount(uniquePracticeDates));
  const profile = getProfileFromRow(profileRow || {}, null);
  const displayName = profile.displayName || "Yoga Member";
  const avatarUrl = profile.avatarUrl || "";
  const practicedToday = uniquePracticeDates.includes(getTodayIsoDate());
  const firstPracticeDate = uniquePracticeDates[0] || "";

  return {
    memberId,
    displayName,
    avatarUrl,
    practicedToday,
    totalDays,
    streak,
    firstPracticeDate,
    status: getMemberStatus({
      practicedToday,
      streak,
      milestoneTitle: milestoneState.milestone.title,
      totalDays,
    }),
    milestoneTitle: milestoneState.milestone.title,
    milestoneLevel: milestoneState.milestone.level,
    milestoneIcon: milestoneState.milestone.icon,
  };
}

function buildCachedSelfSnapshot(memberId) {
  const profile = readProfileCache(memberId);
  const practiceDates = readPracticeCache(memberId);
  return buildMemberSnapshot(
    memberId,
    {
      display_name: profile.displayName,
      avatar_url: profile.avatarUrl,
    },
    practiceDates,
  );
}

function renderMemberProfile(snapshot) {
  if (!snapshot) {
    return;
  }

  memberProfileNameEl.textContent = snapshot.displayName || "Yoga Member";
  memberProfileStatusEl.textContent = snapshot.status || "Walking the path with steady practice.";
  memberProfileSinceEl.textContent = snapshot.firstPracticeDate
    ? `Practicing since ${formatLongDate(snapshot.firstPracticeDate)}`
    : "Practice journey just beginning";

  if (snapshot.avatarUrl) {
    memberProfileAvatarEl.src = snapshot.avatarUrl;
    memberProfileAvatarEl.classList.remove("hidden");
    memberProfileInitialEl.classList.add("hidden");
  } else {
    memberProfileInitialEl.textContent = getInitials(snapshot.displayName || "Yoga Member");
    memberProfileInitialEl.classList.remove("hidden");
    memberProfileAvatarEl.classList.add("hidden");
  }

  memberMilestoneIconEl.innerHTML = getMilestoneIconSvg(snapshot.milestoneIcon);
  memberMilestoneTitleEl.textContent = snapshot.milestoneTitle;
  memberMilestoneLevelEl.textContent = snapshot.milestoneLevel;
  memberTotalDaysEl.textContent = String(snapshot.totalDays);
  memberStreakEl.textContent = String(snapshot.streak);
}

async function initMemberProfile() {
  const params = new URLSearchParams(window.location.search);
  const memberId = params.get("uid");

  if (!memberId) {
    window.location.href = "community.html";
    return;
  }

  const { data: sessionData } = await window.supabaseClient.auth.getSession();
  if (!sessionData?.session?.user) {
    const { data } = await window.supabaseClient.auth.getUser();
    if (!data.user) {
      window.location.href = "auth.html";
      return;
    }
    currentUserId = data.user.id;
  } else {
    currentUserId = sessionData.session.user.id;
  }

  if (memberProfileEditLinkEl) {
    memberProfileEditLinkEl.classList.toggle("hidden", memberId !== currentUserId);
  }

  if (memberId === currentUserId) {
    const selfSnapshot = buildCachedSelfSnapshot(memberId);
    writeMemberProfileCache(memberId, selfSnapshot);
    renderMemberProfile(selfSnapshot);
  }

  const cachedSnapshot = readMemberProfileCache(memberId);
  if (cachedSnapshot) {
    renderMemberProfile(cachedSnapshot);
  }

  if (cachedSnapshot && !shouldRefreshMemberProfile(cachedSnapshot)) {
    return;
  }

  const [profileResult, practiceResult] = await Promise.all([
    window.supabaseClient
      .from("profiles")
      .select("id, display_name, avatar_url")
      .eq("id", memberId)
      .maybeSingle(),
    window.supabaseClient
      .from("practice_logs")
      .select("date")
      .eq("user_id", memberId),
  ]);

  if (profileResult.error && profileResult.error.code !== "PGRST116") {
    console.error(profileResult.error);
  }

  if (practiceResult.error) {
    console.error(practiceResult.error);
  }

  const snapshot = buildMemberSnapshot(
    memberId,
    profileResult.data || {},
    (practiceResult.data || []).map((row) => row.date)
  );

  writeMemberProfileCache(memberId, snapshot);
  renderMemberProfile(snapshot);
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const memberId = params.get("uid");
  if (!memberId || memberId !== currentUserId) {
    return;
  }

  const selfSnapshot = buildCachedSelfSnapshot(memberId);
  writeMemberProfileCache(memberId, selfSnapshot);
  renderMemberProfile(selfSnapshot);
});

if (memberBackLinkEl) {
  memberBackLinkEl.addEventListener("click", (event) => {
    event.preventDefault();

    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    window.location.href = "index.html";
  });
}

initMemberProfile();
