const PRACTICE_CACHE_PREFIX = "practice_logs_cache_v1:";
const PRACTICE_MUTATION_QUEUE_PREFIX = "practice_mutations_v1:";
const MILESTONE_STATE_CACHE_PREFIX = "milestone_state_v1:";
const REMOTE_REFRESH_PREFIX = "remote_refresh_v1:";
const HOME_COMMUNITY_CACHE_PREFIX = "home_community_today_v1:";
const APP_MILESTONES = [
  { days: 7, title: "Sankalpa", level: "Level 1", desc: "Committed Beginning", icon: "flower", image: "images/Sankalpa.jpg", imageClass: "milestone-image-stiffness" },
  { days: 21, title: "Sthirata", level: "Level 2", desc: "Balanced Body, Steady Mind", icon: "mountain", image: "images/strength.jpg", imageClass: "milestone-image-strength" },
  { days: 48, title: "Ananda", level: "Level 3", desc: "Joy, Ease and Vitality", icon: "sun", image: "images/Ananda.jpg", imageClass: "milestone-image-energy" },
  { days: 90, title: "Paramananda", level: "Level 4", desc: "Deeper Bliss and lasting Stillness", icon: "lotus", image: "images/calm.jpg", imageClass: "milestone-image-calm" }
];

function getMilestoneIconSvg(iconName) {
  const icons = {
    flame: `
      <svg viewBox="0 0 24 24" class="milestone-icon-svg" fill="none">
        <path d="M12.4 4.2c2.8 2.1 4.8 4.7 4.8 8 0 3.5-2.2 6.3-5.2 7.6-3-1.3-5.2-4.1-5.2-7.6 0-2.2 1.1-4 3-5.7.2 1.8 1.1 3.1 2.6 4.1-.2-2.2.6-4.4 2-6.4Z" />
        <path d="M12 11.1c1.5 1.1 2.4 2.3 2.4 3.8 0 1.7-1 3.2-2.4 4.2-1.4-1-2.4-2.5-2.4-4.2 0-1.5.9-2.7 2.4-3.8Z" />
      </svg>
    `,
    mountain: `
      <svg viewBox="0 0 24 24" class="milestone-icon-svg" fill="none">
        <path d="M3.8 19.2 9.5 9.1l3 4.4" />
        <path d="M9.8 19.2 14.8 11l5.4 8.2" />
        <path d="m13.7 12.8 1.1-1.8 1.2 1.8" />
      </svg>
    `,
    sunrise: `
      <svg viewBox="0 0 24 24" class="milestone-icon-svg" fill="none">
        <path d="M5 17a7 7 0 0 1 14 0" />
        <path d="M3.5 19.5h17" />
        <path d="M12 6.2v3.2" />
        <path d="m6.9 10.2 1.7 1.4" />
        <path d="m17.1 10.2-1.7 1.4" />
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
    flower: `
      <svg viewBox="0 0 24 24" class="program-flower-icon milestone-icon-svg" fill="none">
        <path d="M12 6.2C10.9 4.8 9.5 4 8 4C6 4 4.7 5.5 4.7 7.3c0 2.7 2.7 4.4 7.3 7.9 4.6-3.5 7.3-5.2 7.3-7.9C19.3 5.5 18 4 16 4c-1.5 0-2.9.8-4 2.2Z" />
        <path d="M12 7.4c.9 1.5 1.4 2.8 1.4 4.1 0 2.7-1.4 5.2-1.4 8.5 0-3.3-1.4-5.8-1.4-8.5 0-1.3.5-2.6 1.4-4.1Z" />
        <path d="M8.2 11.8c-1.9-.1-3.3.2-4.4.9-1.5 1-1.9 3-.9 4.5 1.5 2.3 4.6 1.9 9.1 1.4-.9-5.7-1.8-6.4-3.8-6.8Z" />
        <path d="M15.8 11.8c1.9-.1 3.3.2 4.4.9 1.5 1 1.9 3 .9 4.5-1.5 2.3-4.6 1.9-9.1 1.4.9-5.7 1.8-6.4 3.8-6.8Z" />
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

function getUiIconSvg(iconName, className = "") {
  const classAttr = className ? ` class="${className}"` : "";
  const icons = {
    "arrow-left": `<svg viewBox="0 0 24 24"${classAttr} fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"></path><path d="m12 19-7-7 7-7"></path></svg>`,
    "settings-2": `<svg viewBox="0 0 24 24"${classAttr} fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7h-9"></path><path d="M14 17H4"></path><circle cx="7" cy="17" r="2"></circle><circle cx="17" cy="7" r="2"></circle></svg>`,
    calendar: `<svg viewBox="0 0 24 24"${classAttr} fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"></rect><path d="M8 3.5v3"></path><path d="M16 3.5v3"></path><path d="M3.5 9.5h17"></path></svg>`,
    flame: `<img src="images/flame_icon.svg"${classAttr} alt="" aria-hidden="true">`,
    leaf: `<svg viewBox="0 0 24 24"${classAttr} fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M7 19.2c6 0 10.3-4.3 10.8-11.6-6.7.6-10.8 4.8-10.8 11.6Z"></path><path d="M8.2 17.7c1.9-4 4.8-7 8.6-9"></path></svg>`,
    heart: `<svg viewBox="0 0 24 24"${classAttr} fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20c-5.2-3.9-8-6.2-8-9.6 0-2.4 1.8-4.4 4.2-4.4 1.7 0 3 .9 3.8 2.2.8-1.3 2.1-2.2 3.8-2.2 2.4 0 4.2 2 4.2 4.4 0 3.4-2.8 5.7-8 9.6Z"></path></svg>`,
    infinity: `<svg viewBox="0 0 24 24"${classAttr} fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M18.5 8.5c-2.4 0-3.7 1.5-6.5 4.5-2.8-3-4.1-4.5-6.5-4.5a4 4 0 1 0 0 8c2.4 0 3.7-1.5 6.5-4.5 2.8 3 4.1 4.5 6.5 4.5a4 4 0 1 0 0-8Z"></path></svg>`,
    "chevron-right": `<svg viewBox="0 0 24 24"${classAttr} fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"></path></svg>`,
    trophy: `<svg viewBox="0 0 24 24"${classAttr} fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4.5h8v3a4 4 0 0 1-8 0v-3Z"></path><path d="M6 6H4.8A1.8 1.8 0 0 0 3 7.8 3.2 3.2 0 0 0 6.2 11"></path><path d="M18 6h1.2A1.8 1.8 0 0 1 21 7.8 3.2 3.2 0 0 1 17.8 11"></path><path d="M12 11.5v3.5"></path><path d="M9.5 19.5h5"></path></svg>`,
    "user-plus": `<svg viewBox="0 0 24 24"${classAttr} fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M16 20a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4"></path><circle cx="10" cy="9" r="3"></circle><path d="M19 8v6"></path><path d="M16 11h6"></path></svg>`,
    crown: `<svg viewBox="0 0 24 24"${classAttr} fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m4.5 8 4.3 4.1L12 6.4l3.2 5.7L19.5 8l-1.7 9H6.2L4.5 8Z"></path><path d="M7 19.5h10"></path></svg>`,
    star: `<svg viewBox="0 0 24 24"${classAttr} fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.5-4.8-2.6-4.8 2.6.9-5.5L4.2 9.7l5.4-.8L12 4Z"></path></svg>`,
    check: `<svg viewBox="0 0 24 24"${classAttr} fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4.2 4.2L19 6.8"></path></svg>`,
    medal: `<svg viewBox="0 0 24 24"${classAttr} fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m7 4 2.5 5"></path><path d="M17 4 14.5 9"></path><circle cx="12" cy="14" r="4.5"></circle><path d="m12 11.5.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3.9-1.8Z"></path></svg>`,
    sparkles: `<svg viewBox="0 0 24 24"${classAttr} fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 1.3 3.7L17 8l-3.7 1.3L12 13l-1.3-3.7L7 8l3.7-1.3L12 3Z"></path><path d="m18.5 14 0.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"></path><path d="m5.5 14 0.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"></path></svg>`,
    lock: `<svg viewBox="0 0 24 24"${classAttr} fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"></rect><path d="M8 11V8.5a4 4 0 1 1 8 0V11"></path></svg>`,
    activity: `<svg viewBox="0 0 24 24"${classAttr} fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l2-4 4 8 2-4h6"></path></svg>`,
    "check-circle-2": `<svg viewBox="0 0 24 24"${classAttr} fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="m8.5 12 2.2 2.2 4.8-4.8"></path></svg>`,
    "calendar-heart": `<svg viewBox="0 0 24 24"${classAttr} fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"></rect><path d="M8 3.5v3"></path><path d="M16 3.5v3"></path><path d="M3.5 9.5h17"></path><path d="M12 17c-2.4-1.8-3.7-3-3.7-4.6 0-1.2.9-2.1 2-2.1.8 0 1.4.4 1.7 1 .3-.6.9-1 1.7-1 1.1 0 2 1 2 2.1 0 1.6-1.3 2.8-3.7 4.6Z"></path></svg>`,
    "log-out": `<svg viewBox="0 0 24 24"${classAttr} fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><path d="M16 17 21 12 16 7"></path><path d="M21 12H9"></path></svg>`,
  };

  return icons[iconName] || "";
}

function getPracticeCacheKey(userId) {
  return `${PRACTICE_CACHE_PREFIX}${userId}`;
}

function getMilestoneStateCacheKey(userId) {
  return `${MILESTONE_STATE_CACHE_PREFIX}${userId}`;
}

function getPracticeMutationQueueKey(userId) {
  return `${PRACTICE_MUTATION_QUEUE_PREFIX}${userId}`;
}

function getRemoteRefreshKey(scope, userId = "") {
  return `${REMOTE_REFRESH_PREFIX}${scope}:${userId || "global"}`;
}

function getHomeCommunityCacheKey(userId) {
  return `${HOME_COMMUNITY_CACHE_PREFIX}${userId}`;
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

function readHomeCommunityCache(userId) {
  if (!userId) {
    return null;
  }

  try {
    const raw = localStorage.getItem(getHomeCommunityCacheKey(userId));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    console.error("Home community cache read error:", error);
    return null;
  }
}

function writeHomeCommunityCache(userId, snapshot) {
  if (!userId || !snapshot) {
    return;
  }

  try {
    localStorage.setItem(
      getHomeCommunityCacheKey(userId),
      JSON.stringify({
        count: Number(snapshot.count) || 0,
        members: Array.isArray(snapshot.members) ? snapshot.members : [],
        updatedAt: Date.now(),
      }),
    );
  } catch (error) {
    console.error("Home community cache write error:", error);
  }
}

function syncHomeCommunityCacheForTodayMutation(userId, mutationType) {
  if (!userId) {
    return;
  }

  const profile = typeof readProfileCache === "function" ? readProfileCache(userId) : {};
  const currentUserMember = {
    id: userId,
    displayName: profile?.displayName || "Sadhaka",
    avatarUrl: profile?.avatarUrl || "",
  };
  const baseSnapshot = readHomeCommunityCache(userId) || { count: 0, members: [] };
  const existingMembers = Array.isArray(baseSnapshot.members) ? [...baseSnapshot.members] : [];
  const withoutCurrentUser = existingMembers.filter((member) => member.id !== userId);
  const hadCurrentUser = existingMembers.some((member) => member.id === userId);
  let nextCount = Math.max(0, Number(baseSnapshot.count) || 0);
  let nextMembers = withoutCurrentUser;

  if (mutationType === "mark") {
    nextMembers = [currentUserMember, ...withoutCurrentUser];
    if (!hadCurrentUser) {
      nextCount += 1;
    }
  } else if (hadCurrentUser) {
    nextCount = Math.max(0, nextCount - 1);
  }

  writeHomeCommunityCache(userId, {
    count: nextCount,
    members: nextMembers.slice(0, Math.max(3, nextCount)),
  });
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

function readPracticeMutationQueue(userId) {
  if (!userId) {
    return [];
  }

  try {
    const raw = localStorage.getItem(getPracticeMutationQueueKey(userId));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Practice mutation queue read error:", error);
    return [];
  }
}

function writePracticeMutationQueue(userId, queue) {
  if (!userId) {
    return;
  }

  try {
    localStorage.setItem(
      getPracticeMutationQueueKey(userId),
      JSON.stringify(Array.isArray(queue) ? queue : []),
    );
  } catch (error) {
    console.error("Practice mutation queue write error:", error);
  }
}

function hasQueuedPracticeMutations(userId) {
  return readPracticeMutationQueue(userId).length > 0;
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

function applyPracticeMutationLocally(userId, practiceDates, mutationType, date) {
  const nextDates = [...new Set(practiceDates)];

  if (mutationType === "mark") {
    if (!nextDates.includes(date)) {
      nextDates.push(date);
    }
  } else {
    const index = nextDates.indexOf(date);
    if (index >= 0) {
      nextDates.splice(index, 1);
    }
  }

  const normalizedDates = [...new Set(nextDates)].sort();
  writePracticeCache(userId, normalizedDates);
  markRemoteRefresh("practice_dates", userId);
  if (date === formatPracticeIsoDate(new Date())) {
    syncHomeCommunityCacheForTodayMutation(userId, mutationType);
  }
  return normalizedDates;
}

function enqueuePracticeMutation(userId, mutationType, date) {
  const queue = readPracticeMutationQueue(userId)
    .filter((item) => item.date !== date);

  queue.push({
    type: mutationType,
    date,
    queuedAt: Date.now(),
  });

  writePracticeMutationQueue(userId, queue);
}

function isRetryablePracticeSyncError(error) {
  if (!navigator.onLine) {
    return true;
  }

  const message = String(error?.message || error?.details || error || "");
  return /failed to fetch|networkerror|load failed|fetch/i.test(message);
}

async function syncQueuedPracticeMutations(userId) {
  if (!userId || !navigator.onLine) {
    return { applied: 0, pending: readPracticeMutationQueue(userId).length };
  }

  const queue = [...readPracticeMutationQueue(userId)];
  let applied = 0;

  while (queue.length) {
    const mutation = queue[0];

    try {
      if (mutation.type === "mark") {
        const { error } = await window.supabaseClient
          .from("practice_logs")
          .insert([{ user_id: userId, date: mutation.date }]);

        if (error) {
          throw error;
        }
      } else {
        const { error } = await window.supabaseClient
          .from("practice_logs")
          .delete()
          .eq("user_id", userId)
          .eq("date", mutation.date);

        if (error) {
          throw error;
        }
      }

      queue.shift();
      applied += 1;
      writePracticeMutationQueue(userId, queue);
    } catch (error) {
      if (!isRetryablePracticeSyncError(error)) {
        console.error("Dropping non-retryable practice sync mutation:", error);
        queue.shift();
        writePracticeMutationQueue(userId, queue);
        continue;
      }

      break;
    }
  }

  return {
    applied,
    pending: queue.length,
  };
}

async function fetchPracticeDates(userId) {
  await syncQueuedPracticeMutations(userId);

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

function formatPracticeIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (reference >= today) {
    const todayIso = formatPracticeIsoDate(today);
    if (!practicedSet.has(todayIso)) {
      reference.setDate(today.getDate() - 1);
    }
  }

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
    if (totalDays > APP_MILESTONES[i - 1].days) {
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

  while (index < APP_MILESTONES.length - 1 && uniqueTotalDays > APP_MILESTONES[index].days) {
    index += 1;
  }

  while (index > 0 && uniqueTotalDays <= APP_MILESTONES[index - 1].days) {
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

function getPracticeProgressNotificationMessage(userId, practiceDates) {
  const milestoneProgressCount = getMilestoneProgressCount(practiceDates);
  const state = getCurrentMilestoneState(userId, milestoneProgressCount);

  if (state.remainingDays <= 0) {
    return "Going good. Your next milestone is ready.";
  }

  const dayLabel = state.remainingDays === 1 ? "day" : "days";
  return `Going good. Your next milestone in ${state.remainingDays} ${dayLabel}.`;
}
