const PRACTICE_CACHE_PREFIX = "practice_logs_cache_v1:";
const MILESTONE_STATE_CACHE_PREFIX = "milestone_state_v1:";
const REMOTE_REFRESH_PREFIX = "remote_refresh_v1:";
const APP_MILESTONES = [
  { days: 7, title: "Sankalpa", level: "Level 1", desc: "Committed Beginning", icon: "flower", image: "images/stiffness.jpg", imageClass: "milestone-image-stiffness" },
  { days: 21, title: "Sthirata", level: "Level 2", desc: "Balanced Body, Steady Mind", icon: "balance", image: "images/strength.jpg", imageClass: "milestone-image-strength" },
  { days: 48, title: "Ananda", level: "Level 3", desc: "Joy, Ease and Vitality", icon: "sun", image: "images/energy.jpg", imageClass: "milestone-image-energy" },
  { days: 90, title: "Paramananda", level: "Level 4", desc: "Deeper Bliss and lasting Stillness", icon: "lotus", image: "images/calm.jpg", imageClass: "milestone-image-calm" }
];

function getMilestoneIconSvg(iconName) {
  const icons = {
    flower: `
      <svg viewBox="0 0 24 24" class="program-flower-icon milestone-icon-svg" fill="none">
        <path d="M12 6.2C10.9 4.8 9.5 4 8 4C6 4 4.7 5.5 4.7 7.3c0 2.7 2.7 4.4 7.3 7.9 4.6-3.5 7.3-5.2 7.3-7.9C19.3 5.5 18 4 16 4c-1.5 0-2.9.8-4 2.2Z" />
        <path d="M12 7.4c.9 1.5 1.4 2.8 1.4 4.1 0 2.7-1.4 5.2-1.4 8.5 0-3.3-1.4-5.8-1.4-8.5 0-1.3.5-2.6 1.4-4.1Z" />
        <path d="M8.2 11.8c-1.9-.1-3.3.2-4.4.9-1.5 1-1.9 3-.9 4.5 1.5 2.3 4.6 1.9 9.1 1.4-.9-5.7-1.8-6.4-3.8-6.8Z" />
        <path d="M15.8 11.8c1.9-.1 3.3.2 4.4.9 1.5 1 1.9 3 .9 4.5-1.5 2.3-4.6 1.9-9.1 1.4.9-5.7 1.8-6.4 3.8-6.8Z" />
      </svg>
    `,
    balance: `
      <svg viewBox="0 0 24 24" class="milestone-icon-svg" fill="none">
        <path d="M12 4v15" />
        <path d="M7 7h10" />
        <path d="M5 7 3 11h4L5 7Z" />
        <path d="m19 7-2 4h4l-2-4Z" />
        <path d="M9 20h6" />
      </svg>
    `,
    sun: `
      <svg viewBox="0 0 24 24" class="milestone-icon-svg" fill="none">
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 3.5v2.3" />
        <path d="M12 18.2v2.3" />
        <path d="M3.5 12h2.3" />
        <path d="M18.2 12h2.3" />
        <path d="m6.1 6.1 1.7 1.7" />
        <path d="m16.2 16.2 1.7 1.7" />
        <path d="m17.9 6.1-1.7 1.7" />
        <path d="m7.8 16.2-1.7 1.7" />
      </svg>
    `,
    lotus: `
      <svg viewBox="0 0 24 24" class="milestone-icon-svg" fill="none">
        <path d="M12 6.5c1.9 1.6 3 3.3 3 5.1 0 2.2-1.2 4.2-3 5.9-1.8-1.7-3-3.7-3-5.9 0-1.8 1.1-3.5 3-5.1Z" />
        <path d="M7 10.1c1.8 1 2.8 2.4 2.8 4 0 1.6-1 3-2.8 4.2-1.8-1.2-2.8-2.6-2.8-4.2 0-1.6 1-3 2.8-4Z" />
        <path d="M17 10.1c1.8 1 2.8 2.4 2.8 4 0 1.6-1 3-2.8 4.2-1.8-1.2-2.8-2.6-2.8-4.2 0-1.6 1-3 2.8-4Z" />
        <path d="M5.5 19.5h13" />
      </svg>
    `,
  };

  return icons[iconName] || icons.flower;
}

function getPracticeCacheKey(userId) {
  return `${PRACTICE_CACHE_PREFIX}${userId}`;
}

function getMilestoneStateCacheKey(userId) {
  return `${MILESTONE_STATE_CACHE_PREFIX}${userId}`;
}

function getRemoteRefreshKey(scope, userId = "") {
  return `${REMOTE_REFRESH_PREFIX}${scope}:${userId || "global"}`;
}

function shouldRefreshRemote(scope, userId, maxAgeMs) {
  try {
    const raw = localStorage.getItem(getRemoteRefreshKey(scope, userId));
    if (!raw) {
      return true;
    }

    const lastRefreshedAt = Number(raw);
    if (!Number.isFinite(lastRefreshedAt)) {
      return true;
    }

    return Date.now() - lastRefreshedAt > maxAgeMs;
  } catch (error) {
    console.error("Remote refresh check error:", error);
    return true;
  }
}

function markRemoteRefresh(scope, userId) {
  try {
    localStorage.setItem(getRemoteRefreshKey(scope, userId), String(Date.now()));
  } catch (error) {
    console.error("Remote refresh mark error:", error);
  }
}

function readPracticeCache(userId) {
  if (!userId) {
    return [];
  }

  try {
    const raw = localStorage.getItem(getPracticeCacheKey(userId));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.dates) ? parsed.dates : [];
  } catch (error) {
    console.error("Cache read error:", error);
    return [];
  }
}

function writePracticeCache(userId, dates) {
  if (!userId) {
    return;
  }

  try {
    const uniqueDates = [...new Set(dates)].sort();
    localStorage.setItem(
      getPracticeCacheKey(userId),
      JSON.stringify({
        dates: uniqueDates,
        updatedAt: Date.now(),
      })
    );
  } catch (error) {
    console.error("Cache write error:", error);
  }
}

function addPracticeDateToCache(userId, date) {
  const dates = readPracticeCache(userId);
  if (!dates.includes(date)) {
    dates.push(date);
  }
  writePracticeCache(userId, dates);
}

function removePracticeDateFromCache(userId, date) {
  const dates = readPracticeCache(userId).filter((item) => item !== date);
  writePracticeCache(userId, dates);
}

async function fetchPracticeDates(userId) {
  const { data, error } = await window.supabaseClient
    .from("practice_logs")
    .select("date")
    .eq("user_id", userId);

  if (error) {
    throw error;
  }

  const dates = data.map((item) => item.date);
  writePracticeCache(userId, dates);
  markRemoteRefresh("practice_dates", userId);
  return dates;
}

function normalizePracticeDates(practiceDates) {
  return [...new Set(practiceDates)].sort();
}

function getMilestoneProgressCount(practiceDates, referenceDate = new Date()) {
  const uniqueDates = normalizePracticeDates(practiceDates);

  if (uniqueDates.length === 0) {
    return 0;
  }

  const firstPracticeDate = new Date(`${uniqueDates[0]}T00:00:00`);
  const reference = new Date(referenceDate);
  reference.setHours(0, 0, 0, 0);

  if (reference < firstPracticeDate) {
    return uniqueDates.length;
  }

  const practicedSet = new Set(uniqueDates);
  let consecutiveMisses = 0;
  let maxPenalty = 0;

  for (
    let cursor = new Date(firstPracticeDate);
    cursor <= reference;
    cursor.setDate(cursor.getDate() + 1)
  ) {
    const yyyy = cursor.getFullYear();
    const mm = String(cursor.getMonth() + 1).padStart(2, "0");
    const dd = String(cursor.getDate()).padStart(2, "0");
    const formatted = `${yyyy}-${mm}-${dd}`;

    if (practicedSet.has(formatted)) {
      consecutiveMisses = 0;
      continue;
    }

    consecutiveMisses += 1;
    maxPenalty += Math.floor(consecutiveMisses / 2) > Math.floor((consecutiveMisses - 1) / 2) ? 1 : 0;
  }

  return Math.max(0, uniqueDates.length - maxPenalty);
}

function getInitialMilestoneIndex(totalDays) {
  let index = 0;

  for (let i = 1; i < APP_MILESTONES.length; i++) {
    if (totalDays >= APP_MILESTONES[i - 1].days) {
      index = i;
    }
  }

  return index;
}

function readMilestoneIndexCache(userId) {
  if (!userId) {
    return null;
  }

  try {
    const raw = localStorage.getItem(getMilestoneStateCacheKey(userId));
    if (raw == null) {
      return null;
    }

    const parsed = Number(raw);
    return Number.isInteger(parsed) ? parsed : null;
  } catch (error) {
    console.error("Milestone cache read error:", error);
    return null;
  }
}

function writeMilestoneIndexCache(userId, index) {
  if (!userId) {
    return;
  }

  try {
    localStorage.setItem(getMilestoneStateCacheKey(userId), String(index));
  } catch (error) {
    console.error("Milestone cache write error:", error);
  }
}

function getCurrentMilestoneState(userId, totalDays) {
  const uniqueTotalDays = Math.max(0, totalDays);
  let index = readMilestoneIndexCache(userId);

  if (index == null) {
    index = getInitialMilestoneIndex(uniqueTotalDays);
  }

  while (index < APP_MILESTONES.length - 1 && uniqueTotalDays >= APP_MILESTONES[index].days) {
    index += 1;
  }

  while (index > 0 && uniqueTotalDays < APP_MILESTONES[index - 1].days) {
    index -= 1;
  }

  index = Math.max(0, Math.min(index, APP_MILESTONES.length - 1));
  writeMilestoneIndexCache(userId, index);

  const milestone = APP_MILESTONES[index];
  const previousDays = index === 0 ? 0 : APP_MILESTONES[index - 1].days;

  return {
    milestone,
    index,
    previousDays,
    completedWithinMilestone: Math.min(uniqueTotalDays, milestone.days),
    totalWithinMilestone: milestone.days,
    remainingDays: Math.max(0, milestone.days - uniqueTotalDays),
  };
}
