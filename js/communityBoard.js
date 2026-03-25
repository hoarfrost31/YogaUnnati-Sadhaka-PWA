const supabaseClient = window.supabaseClient;
const COMMUNITY_BOARD_CACHE_PREFIX = "community_board_cache_v1:";

const communityBoardListEl = document.getElementById("communityBoardList");
const communityPremiumMaskEl = document.getElementById("communityPremiumMask");
const communityPremiumBtnEl = document.getElementById("communityPremiumBtn");
const COMMUNITY_REFRESH_TTL_MS = 2 * 60 * 1000;

let userId;
let isPremiumMember = false;

function getCachedPremiumState() {
  const profile = readProfileCache(userId);
  return String(profile.membershipTier || "").toLowerCase() === "premium";
}

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
  const premiumCrownMarkup = member.isPremium
    ? `<span class="premium-crown-badge premium-crown-badge-small" aria-hidden="true">${getUiIconSvg("crown")}</span>`
    : "";
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

      <div class="community-board-avatar ${member.isPremium ? "is-premium" : ""}">
        ${premiumCrownMarkup}
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

function renderCommunityLockedState() {
  if (!communityBoardListEl) {
    return;
  }

  const noteEl = document.querySelector(".community-board-note");
  const footerEl = document.querySelector(".community-board-fixed-footer");
  noteEl?.classList.remove("community-board-note-preview");
  noteEl?.classList.add("hidden");
  noteEl?.setAttribute("hidden", "hidden");
  if (noteEl) {
    noteEl.style.display = "none";
  }
  footerEl?.classList.add("hidden");
  footerEl?.setAttribute("hidden", "hidden");

  const previewMembers = hydrateCachedMembers(readCommunityBoardCache(userId));
  const previewMarkup = (previewMembers.length ? previewMembers : [
    { id: "preview-1", displayName: "Yoga Member", avatarUrl: "", isPremium: true, streak: 7, totalDays: 12, level: "Level 1", practicedToday: true },
    { id: "preview-2", displayName: "Yoga Member", avatarUrl: "", streak: 5, totalDays: 9, level: "Level 1", practicedToday: false },
    { id: "preview-3", displayName: "Yoga Member", avatarUrl: "", streak: 3, totalDays: 6, level: "Level 1", practicedToday: true },
  ]).map((member, index) => getMemberMarkup(member, index, false)).join("");

  communityBoardListEl.innerHTML = `
    <div class="premium-preview-shell">
      <div class="premium-page-preview premium-page-preview-community">
        ${previewMarkup}
      </div>
      <div class="premium-page-lock-overlay">
        <section class="premium-hero-card premium-inline-lock-card">
          <span class="premium-hero-badge">Premium</span>
          <h2 class="premium-inline-title">Unlock the community</h2>
          <p class="subtitle premium-inline-subtitle">See the community board, member journeys, and shared progress with premium access.</p>

          <div class="premium-benefits premium-inline-benefits">
            <div class="premium-benefit">
              <span class="premium-benefit-icon" aria-hidden="true">&#10003;</span>
              <span>See the full community board</span>
            </div>
            <div class="premium-benefit">
              <span class="premium-benefit-icon" aria-hidden="true">&#10003;</span>
              <span>Open member journeys</span>
            </div>
            <div class="premium-benefit">
              <span class="premium-benefit-icon" aria-hidden="true">&#10003;</span>
              <span>Feel part of the wider practice space</span>
            </div>
          </div>

          <button type="button" class="primary-btn premium-unlock-btn" id="communityPremiumBtn">Unlock Premium</button>
        </section>
      </div>
    </div>
  `;
}

function renderBoard(members) {
  if (!communityBoardListEl) {
    return;
  }

  const noteEl = document.querySelector(".community-board-note");
  const footerEl = document.querySelector(".community-board-fixed-footer");
  noteEl?.classList.toggle("hidden", !isPremiumMember);
  footerEl?.classList.toggle("hidden", !isPremiumMember);
  if (isPremiumMember) {
    noteEl?.classList.remove("community-board-note-preview");
    noteEl?.removeAttribute("hidden");
    if (noteEl) {
      noteEl.style.display = "";
    }
    footerEl?.removeAttribute("hidden");
  }

  if (!isPremiumMember) {
    renderCommunityLockedState();
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

function renderCommunityPremiumMask() {
  if (communityPremiumMaskEl) {
    communityPremiumMaskEl.classList.add("hidden");
    communityPremiumMaskEl.setAttribute("aria-hidden", "true");
  }
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
      isPremium: profile.membershipTier === "premium",
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
  window.appAnalytics?.identify(userId);
  isPremiumMember = getCachedPremiumState();
  renderCommunityPremiumMask();
  renderBoard(hydrateCachedMembers(readCommunityBoardCache(userId)));

  window.premiumAccess?.refresh?.()
    .then((premiumState) => {
      const nextPremiumState = Boolean(premiumState?.isPremium);
      if (nextPremiumState !== isPremiumMember) {
        isPremiumMember = nextPremiumState;
        renderCommunityPremiumMask();
        renderBoard(hydrateCachedMembers(readCommunityBoardCache(userId)));
      }
    })
    .catch((error) => {
      console.error("Community premium refresh error:", error);
    });

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

document.addEventListener("click", (event) => {
  if (event.target.closest("#communityPremiumBtn")) {
    window.appAnalytics?.track("open_premium_paywall", {
      source: "community_preview",
      feature: "community",
    });
    window.premiumAccess?.handleLockedFeature?.("community", "community_preview");
    return;
  }

  const link = event.target.closest(".community-board-entry-link");
  if (!link) {
    return;
  }

  if (!isPremiumMember) {
    event.preventDefault();
    window.appAnalytics?.track("open_premium_paywall", {
      source: "community_member_preview",
      feature: "community",
    });
    window.premiumAccess?.handleLockedFeature?.("community", "community_member_preview");
    return;
  }

  const memberId = new URL(link.href).searchParams.get("uid") || "";
  window.appAnalytics?.track("open_member_profile", {
    source: "community_board",
    member_id: memberId,
    is_own_profile: memberId === userId,
  });
});

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
