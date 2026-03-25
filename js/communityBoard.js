const supabaseClient = window.supabaseClient;
const COMMUNITY_BOARD_CACHE_PREFIX = "community_board_cache_v1:";

const communityBoardListEl = document.getElementById("communityBoardList");
const COMMUNITY_REFRESH_TTL_MS = 2 * 60 * 1000;

let userId;

function getTodayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(dateString) {
  const [year, month, day] = String(dateString).split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function getCommunityBoardCacheKey(userId) {
  return `${COMMUNITY_BOARD_CACHE_PREFIX}${userId}`;
}

function readCommunityBoardCache(userId) {
  if (!userId) {
    return [];
  }

  try {
    const raw = localStorage.getItem(getCommunityBoardCacheKey(userId));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.members) ? parsed.members : [];
  } catch (error) {
    console.error("Community cache read error:", error);
    return [];
  }
}

function writeCommunityBoardCache(userId, members) {
  if (!userId) {
    return;
  }

  try {
    localStorage.setItem(
      getCommunityBoardCacheKey(userId),
      JSON.stringify({
        members,
        updatedAt: Date.now(),
      })
    );
  } catch (error) {
    console.error("Community cache write error:", error);
  }
}

function hydrateCachedMembers(members) {
  if (!userId || !Array.isArray(members) || !members.length) {
    return members;
  }

  const today = getTodayIsoDate();
  const currentUserDates = readPracticeCache(userId);
  const currentUserProfile = readProfileCache(userId);
  const currentUserStreak = calculateStreak(currentUserDates);
  const currentUserTotalDays = [...new Set(currentUserDates)].length;
  const currentUserMilestoneState = getCurrentMilestoneState(
    userId,
    getMilestoneProgressCount(currentUserDates)
  );

  return members.map((member) => {
    if (member.id !== userId) {
      return member;
    }

    return {
      ...member,
      displayName: currentUserProfile.displayName || member.displayName,
      avatarUrl: currentUserProfile.avatarUrl || "",
      streak: currentUserStreak,
      totalDays: currentUserTotalDays,
      level: currentUserMilestoneState.milestone.level,
      practicedToday: currentUserDates.includes(today),
    };
  });
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

function calculateStreak(practiceDates) {
  const dates = [...practiceDates].sort().reverse();
  let streak = 0;
  let compareDate = new Date();
  compareDate.setHours(0, 0, 0, 0);

  for (let i = 0; i < dates.length; i++) {
    const date = parseLocalDate(dates[i]);
    const diff = Math.floor((compareDate - date) / (1000 * 60 * 60 * 24));

    if (diff === 0 || diff === 1) {
      streak++;
      compareDate = date;
    } else {
      break;
    }
  }

  return streak;
}

function getMemberMarkup(member, index, isCurrentUser) {
  const identityLabel = isCurrentUser ? "<span>(You)</span>" : "";
  const avatarMarkup = member.avatarUrl
    ? `<img src="${member.avatarUrl}" alt="${member.displayName}" class="community-board-avatar-img" />`
    : `<span>${getInitials(member.displayName)}</span>`;
  const todayBadge = member.practicedToday
    ? `<p class="community-board-today">${getUiIconSvg("check")}<span>Practiced today</span></p>`
    : "";

  return `
    <a href="member.html?uid=${encodeURIComponent(member.id)}" class="community-board-entry-link" aria-label="Open ${member.displayName}'s profile">
    <article class="community-board-entry">
      <div class="community-board-rank">
        ${getUiIconSvg(index === 0 ? "medal" : "sparkles")}
      </div>

      <div class="community-board-avatar">
        ${avatarMarkup}
      </div>

      <div class="community-board-copy">
        <div class="community-board-name-line">
          <h3>${member.displayName}</h3>
          ${identityLabel}
        </div>
        <p class="community-board-level">${member.level}</p>
        <p class="community-board-streak">${getUiIconSvg("flame")} <span>${member.streak} day streak</span></p>
        ${todayBadge}
      </div>

      <div class="community-board-days">
        <strong>${member.totalDays}</strong>
        <span>days</span>
      </div>
    </article>
    </a>
  `;
}

function renderBoard(members) {
  if (!communityBoardListEl) {
    return;
  }

  if (!members.length) {
    communityBoardListEl.innerHTML = `
      <article class="community-board-entry">
        <div class="community-board-copy">
          <div class="community-board-name-line">
            <h3>No members yet</h3>
          </div>
          <p class="community-board-level">Once profiles and practice entries exist, they will show here.</p>
        </div>
      </article>
    `;
    return;
  }

  communityBoardListEl.innerHTML = members
    .map((member, index) => getMemberMarkup(member, index, member.id === userId))
    .join("");
}

async function buildCommunityMembers() {
  const today = getTodayIsoDate();
  const [profiles, practiceLogsResult] = await Promise.all([
    fetchAllProfiles(),
    window.supabaseClient.from("practice_logs").select("user_id, date"),
  ]);

  if (practiceLogsResult.error) {
    throw practiceLogsResult.error;
  }

  const practiceData = practiceLogsResult.data || [];
  const profileMap = new Map(
    profiles.map((profileRow) => [
      profileRow.id,
      getProfileFromRow(profileRow),
    ])
  );
  const practiceMap = new Map();

  practiceData.forEach((row) => {
    if (!practiceMap.has(row.user_id)) {
      practiceMap.set(row.user_id, []);
    }
    practiceMap.get(row.user_id).push(row.date);
  });

  const memberIds = new Set([...profileMap.keys(), ...practiceMap.keys(), userId]);
  const members = [];

  memberIds.forEach((memberId) => {
    const practiceDates = practiceMap.get(memberId) || [];
    const totalDays = [...new Set(practiceDates)].length;

    if (memberId !== userId && totalDays === 0) {
      return;
    }

    const profile = profileMap.get(memberId) || readProfileCache(memberId);
    const displayName = profile.displayName || (memberId === userId ? DEFAULT_PROFILE_NAME : "Yoga Member");
    const streak = calculateStreak(practiceDates);
    const milestoneProgressCount = getMilestoneProgressCount(practiceDates);
    const milestoneState = getCurrentMilestoneState(memberId, milestoneProgressCount);

    members.push({
      id: memberId,
      displayName,
      avatarUrl: profile.avatarUrl || "",
      streak,
      totalDays,
      level: milestoneState.milestone.level,
      practicedToday: practiceDates.includes(today),
    });
  });

  members.sort((a, b) => {
    if (b.totalDays !== a.totalDays) return b.totalDays - a.totalDays;
    return b.streak - a.streak;
  });

  return members;
}

async function initApp() {
  await initUser();
  renderBoard(hydrateCachedMembers(readCommunityBoardCache(userId)));

  try {
    if (
      shouldRefreshRemote("community_board", userId, COMMUNITY_REFRESH_TTL_MS) ||
      shouldRefreshRemote("profiles_public", "", COMMUNITY_REFRESH_TTL_MS)
    ) {
      await ensureCurrentUserProfile(userId);
      const members = await buildCommunityMembers();
      writeCommunityBoardCache(userId, members);
      markRemoteRefresh("community_board", userId);
      renderBoard(members);
    }
  } catch (error) {
    console.error(error);
  }
}

document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !userId) {
    return;
  }

  try {
    renderBoard(hydrateCachedMembers(readCommunityBoardCache(userId)));
    if (
      shouldRefreshRemote("community_board", userId, COMMUNITY_REFRESH_TTL_MS) ||
      shouldRefreshRemote("profiles_public", "", COMMUNITY_REFRESH_TTL_MS)
    ) {
      const members = await buildCommunityMembers();
      writeCommunityBoardCache(userId, members);
      markRemoteRefresh("community_board", userId);
      renderBoard(members);
    }
  } catch (error) {
    console.error(error);
  }
});

initApp();
