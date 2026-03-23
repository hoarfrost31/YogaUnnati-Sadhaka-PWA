const supabaseClient = window.supabaseClient;
const COMMUNITY_BOARD_CACHE_PREFIX = "community_board_cache_v1:";

const communityBoardListEl = document.getElementById("communityBoardList");

let userId;

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

  for (let i = 0; i < dates.length; i++) {
    const date = new Date(dates[i]);
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

  return `
    <article class="community-board-entry">
      <div class="community-board-rank">
        <i data-lucide="${index === 0 ? "medal" : "sparkles"}"></i>
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
        <p class="community-board-streak"><i data-lucide="flame"></i> <span>${member.streak} day streak</span></p>
      </div>

      <div class="community-board-days">
        <strong>${member.totalDays}</strong>
        <span>days</span>
      </div>
    </article>
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

  if (window.lucide?.createIcons) {
    window.lucide.createIcons();
  }
}

async function buildCommunityMembers() {
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
  renderBoard(readCommunityBoardCache(userId));

  try {
    await ensureCurrentUserProfile(userId);
    const members = await buildCommunityMembers();
    writeCommunityBoardCache(userId, members);
    renderBoard(members);
  } catch (error) {
    console.error(error);
  }
}

initApp();
