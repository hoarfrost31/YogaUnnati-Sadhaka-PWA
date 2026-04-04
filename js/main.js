
// 🎯 Elements
const button = document.querySelector(".program-btn");
const weekStripEl = document.getElementById("weekStrip");
const weekCardLinkEl = document.getElementById("weekCardLink");
const homeAvatarLinkEl = document.getElementById("homeAvatarLink");
const homeAvatarEl = document.getElementById("homeAvatar");
const homeAvatarInitialEl = document.getElementById("homeAvatarInitial");
const todayPracticeCardEl = document.getElementById("todayPracticeCard");
const todayPracticeClusterEl = document.getElementById("todayPracticeCluster");
const todayPracticeTitleEl = document.getElementById("todayPracticeTitle");
const todayPracticeQuestionEl = document.getElementById("todayPracticeQuestion");
const homeTargetDateNoteEl = document.getElementById("homeTargetDateNote");
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
const homeMilestoneBarFillEl = document.getElementById("homeMilestoneBarFill");
const brandTaglineEl = document.getElementById("brandTagline");
const homeMembershipReminderCardEl = document.getElementById("homeMembershipReminderCard");
const homeMembershipReminderTextEl = document.getElementById("homeMembershipReminderText");
const homeMembershipReminderDebugTextEl = document.getElementById("homeMembershipReminderDebugText");
const todayPracticeActionsEl = document.getElementById("todayPracticeActions");
const HOME_MILESTONE_BAR_ANIMATED_KEY = "home_milestone_bar_animated_v1";
const TOMORROW_RSVP_KEY = "yogaunnati_tomorrow_rsvp";
const CLASS_REMINDER_KEY = "pwa_class_reminder_v1";
const HOME_COMMUNITY_CACHE_PREFIX = "home_community_today_v1:";
const PRACTICE_REFRESH_TTL_MS = 90 * 1000;
const PROFILE_REFRESH_TTL_MS = 5 * 60 * 1000;
const COMMUNITY_HOME_REFRESH_TTL_MS = 2 * 60 * 1000;
const MEMBERSHIP_REFRESH_TTL_MS = 5 * 60 * 1000;
const MEMBERSHIP_REMINDER_NOTIFICATION_KEY = "membership_payment_reminder_v1";

// 👤 Temporary user (replace later with auth)
// const userId = "user_1";
let userId;
let practiceDates = [];
let taglineIndex = 0;
let taglineTimer = null;
let hasHydratedHomeMilestoneBar = false;
let homeCommunitySnapshot = null;

const BRAND_TAGLINES = [
  "Hatha Yoga in its purest form",
  "Mastering body and mind",
];

function getCommunityPlaceholderAvatarMarkup() {
  return `
    <span class="today-practice-avatar is-placeholder" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="8" r="3.2"></circle>
        <path d="M6.5 18a5.5 5.5 0 0 1 11 0"></path>
      </svg>
    </span>
  `;
}

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

function parseLocalDate(dateString) {
  const [year, month, day] = String(dateString).split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function calculateCurrentStreak(practiceDates) {
  const dates = [...new Set(practiceDates)].sort().reverse();
  let streak = 0;
  let compareDate = new Date();
  compareDate.setHours(0, 0, 0, 0);

  for (let i = 0; i < dates.length; i += 1) {
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

function getHomeCommunityCacheKey(userId) {
  return `${HOME_COMMUNITY_CACHE_PREFIX}${userId}`;
}

function getMembershipReminderNotificationKey(userIdValue, suffix = "") {
  return `${MEMBERSHIP_REMINDER_NOTIFICATION_KEY}:${userIdValue || "guest"}:${suffix}`;
}

function membershipReminderPlanLabel(planCode) {
  if (planCode === "studio") return "YogaUnnati Studio";
  if (planCode === "online") return "YogaUnnati Online";
  if (planCode === "app") return "YogaUnnati App";
  return "Your membership";
}


function getReminderStorageKey(userIdValue) {
  return `${CLASS_REMINDER_KEY}:${userIdValue || "guest"}`;
}

function readClassReminderPreference(userIdValue) {
  try {
    return localStorage.getItem(getReminderStorageKey(userIdValue)) === "on";
  } catch (error) {
    console.error("Reminder preference read error:", error);
    return false;
  }
}

function readClassReminderPreferenceState(userIdValue) {
  try {
    const raw = localStorage.getItem(getReminderStorageKey(userIdValue));
    if (raw === "on" || raw === "off") {
      return raw;
    }
  } catch (error) {
    console.error("Reminder preference state read error:", error);
  }

  return null;
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
      })
    );
  } catch (error) {
    console.error("Home community cache write error:", error);
  }
}

function getHomeCommunityFallbackTitle() {
  const streak = calculateCurrentStreak(practiceDates);
  if (streak > 0) {
    return `Protect your ${streak}-day streak today`;
  }

  const milestoneProgressCount = getMilestoneProgressCount(practiceDates);
  const state = getCurrentMilestoneState(userId, milestoneProgressCount);
  const dayLabel = state.remainingDays === 1 ? "day" : "days";

  if (state.remainingDays > 0) {
    return `${state.remainingDays} ${dayLabel} to your next milestone`;
  }

  return "Keep your practice moving today";
}

function getHomeCommunityFallbackQuestion() {
  const streak = calculateCurrentStreak(practiceDates);
  if (streak > 0) {
    return "A small step today keeps your momentum alive.";
  }

  return "Show up today and keep your progress moving.";
}

function renderTodayPracticeCluster(members, totalCount) {
  if (!todayPracticeClusterEl) {
    return;
  }

  if (!Array.isArray(members) || totalCount <= 0) {
    todayPracticeClusterEl.innerHTML = `
      ${getCommunityPlaceholderAvatarMarkup()}
      ${getCommunityPlaceholderAvatarMarkup()}
      ${getCommunityPlaceholderAvatarMarkup()}
      <span class="today-practice-avatar today-practice-more">+</span>
    `;
    return;
  }

  const visibleMembers = members.slice(0, 3);
  const slots = Array.from({ length: 3 }, (_, index) => visibleMembers[index] || null);

  todayPracticeClusterEl.innerHTML = slots
    .map((member, index) => {
      if (!member) {
        return getCommunityPlaceholderAvatarMarkup();
      }

      const displayName = member.displayName || DEFAULT_PROFILE_NAME;
      const avatarUrl = normalizeAvatarUrl(member.avatarUrl);

      if (avatarUrl) {
        return `<span class="today-practice-avatar" style="z-index:${4 - index}"><img src="${avatarUrl}" alt="${displayName}" loading="lazy" /></span>`;
      }

      return `<span class="today-practice-avatar" style="z-index:${4 - index}"><span>${getInitials(displayName)}</span></span>`;
    })
    .join("")
    + `<span class="today-practice-avatar today-practice-more" style="z-index:1">+</span>`;
}

function renderHomeCommunitySnapshot(snapshot) {
  if (!todayPracticeCardEl || !todayPracticeTitleEl || !todayPracticeQuestionEl) {
    return;
  }

  const safeSnapshot = snapshot && typeof snapshot === "object"
    ? snapshot
    : { count: 0, members: [] };
  const count = Number(safeSnapshot.count) || 0;
  const members = Array.isArray(safeSnapshot.members) ? safeSnapshot.members : [];

  homeCommunitySnapshot = {
    count,
    members,
  };

  renderTodayPracticeCluster(members, count);

  if (count > 0) {
    todayPracticeCardEl.classList.remove("is-empty");
    todayPracticeTitleEl.textContent = count === 1
      ? "1 person practiced today"
      : `${count} people practiced today`;
    todayPracticeQuestionEl.textContent = "Will you join tomorrow?";
    return;
  }

  todayPracticeCardEl.classList.add("is-empty");
  todayPracticeTitleEl.textContent = getHomeCommunityFallbackTitle();
  todayPracticeQuestionEl.textContent = getHomeCommunityFallbackQuestion();
}

function getCurrentUserCommunityMember() {
  const profile = readProfileCache(userId);
  return {
    id: userId,
    displayName: profile.displayName || DEFAULT_PROFILE_NAME,
    avatarUrl: profile.avatarUrl || "",
  };
}

function syncHomeCommunitySnapshotForTodayPractice(isPracticedToday) {
  if (!userId) {
    return;
  }

  const baseSnapshot = homeCommunitySnapshot || readHomeCommunityCache(userId) || { count: 0, members: [] };
  const existingMembers = Array.isArray(baseSnapshot.members) ? [...baseSnapshot.members] : [];
  const withoutCurrentUser = existingMembers.filter((member) => member.id !== userId);

  let nextMembers = withoutCurrentUser;
  let nextCount = Math.max(0, Number(baseSnapshot.count) || 0);

  if (isPracticedToday) {
    nextMembers = [getCurrentUserCommunityMember(), ...withoutCurrentUser];
    if (!existingMembers.some((member) => member.id === userId)) {
      nextCount += 1;
    }
  } else if (existingMembers.some((member) => member.id === userId)) {
    nextCount = Math.max(0, nextCount - 1);
  }

  const nextSnapshot = {
    count: nextCount,
    members: nextMembers.slice(0, Math.max(3, nextCount)),
  };

  writeHomeCommunityCache(userId, nextSnapshot);
  renderHomeCommunitySnapshot(nextSnapshot);
}

async function buildHomeCommunitySnapshot() {
  const today = getTodayIsoDate();
  const practiceLogsResult = await supabaseClient.from("practice_logs").select("user_id").eq("date", today);

  if (practiceLogsResult.error) {
    throw practiceLogsResult.error;
  }

  const uniqueMemberIds = [...new Set((practiceLogsResult.data || []).map((row) => row.user_id).filter(Boolean))];
  const profiles = await fetchProfilesByIds(uniqueMemberIds);
  const profileMap = new Map(
    profiles.map((profileRow) => [
      profileRow.id,
      getProfileFromRow(profileRow),
    ])
  );

  const members = uniqueMemberIds.map((memberId) => {
    const cachedProfile = memberId === userId ? readProfileCache(memberId) : null;
    const profile = profileMap.get(memberId) || cachedProfile || normalizeProfileData();
    const displayName = profile.displayName || (memberId === userId ? DEFAULT_PROFILE_NAME : "Yoga Member");

    return {
      id: memberId,
      displayName,
      avatarUrl: profile.avatarUrl || "",
    };
  });

  return {
    count: uniqueMemberIds.length,
    members,
  };
}

async function refreshHomeCommunitySnapshot() {
  if (!userId) {
    return;
  }

  try {
    const snapshot = await buildHomeCommunitySnapshot();
    writeHomeCommunityCache(userId, snapshot);
    markRemoteRefresh("community_today", userId);
    renderHomeCommunitySnapshot(snapshot);
  } catch (error) {
    console.error("Home community refresh error:", error);
  }
}

function applyTomorrowRsvp(value) {
  if (!todayPracticeActionsEl) {
    return;
  }

  todayPracticeActionsEl.querySelectorAll(".today-practice-btn").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.rsvp === value);
  });
}

function initTomorrowRsvp() {
  if (!todayPracticeActionsEl) {
    return;
  }

  let saved = "";
  try {
    saved = localStorage.getItem(TOMORROW_RSVP_KEY) || "";
  } catch (error) {
    saved = "";
  }

  applyTomorrowRsvp(saved);

  todayPracticeActionsEl.addEventListener("click", (event) => {
    const buttonEl = event.target.closest(".today-practice-btn");
    if (!buttonEl) {
      return;
    }

    const nextValue = buttonEl.dataset.rsvp || "";
    let currentValue = "";

    try {
      currentValue = localStorage.getItem(TOMORROW_RSVP_KEY) || "";
    } catch (error) {
      currentValue = "";
    }

    const finalValue = currentValue === nextValue ? "" : nextValue;

    try {
      if (finalValue) {
        localStorage.setItem(TOMORROW_RSVP_KEY, finalValue);
      } else {
        localStorage.removeItem(TOMORROW_RSVP_KEY);
      }
    } catch (error) {
      console.error("RSVP save error:", error);
    }

    applyTomorrowRsvp(finalValue);
    window.appAnalytics?.track("set_tomorrow_rsvp", {
      source: "home",
      response: finalValue || "cleared",
    });
  });
}

function goToCommunityPage() {
  if (typeof window.navigateToPage === "function") {
    window.navigateToPage("community.html");
    return;
  }

  window.location.href = "community.html";
}

function initTodayPracticeCardLink() {
  if (!todayPracticeCardEl) {
    return;
  }

  const isInteractiveSubtarget = (target) => Boolean(
    target?.closest(".today-practice-btn, button, a, input, textarea, select")
  );

  todayPracticeCardEl.addEventListener("click", (event) => {
    if (isInteractiveSubtarget(event.target)) {
      return;
    }

    window.appAnalytics?.track("open_community", {
      source: "home_today_card",
    });
    goToCommunityPage();
  });

  todayPracticeCardEl.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    if (isInteractiveSubtarget(event.target)) {
      return;
    }

    event.preventDefault();
    window.appAnalytics?.track("open_community", {
      source: "home_today_card",
    });
    goToCommunityPage();
  });
}

function shouldShowHomeNotificationsPrompt() {
  const notificationsApi = window.pwaNotifications;
  const isSupported = notificationsApi?.isSupported?.() || false;
  const permission = notificationsApi?.getPermission?.() || "unsupported";
  if (!userId || !isSupported) {
    return false;
  }

  const cachedProfile = readProfileCache(userId);
  const remindersEnabledFromAccount = Boolean(cachedProfile.classReminderEnabled);
  const reminderPreferenceState = readClassReminderPreferenceState(userId);

  if (permission === "granted") {
    if (reminderPreferenceState === "off") {
      return true;
    }

    if (reminderPreferenceState === "on" || remindersEnabledFromAccount) {
      return false;
    }

    return false;
  }

  if (reminderPreferenceState === "off") {
    return true;
  }

  if (reminderPreferenceState === "on" || remindersEnabledFromAccount) {
    return false;
  }

  return permission !== "granted";
}

function showHomeNotificationsPrompt() {
  if (!shouldShowHomeNotificationsPrompt()) {
    return;
  }

  const popup = document.createElement("div");
  popup.className = "notifications-popup hidden";
  popup.innerHTML = `
    <p class="notifications-popup-title">Keep notifications on</p>
    <p class="notifications-popup-text">Allow them for class updates and practice reminders.</p>
    <div class="notifications-popup-actions">
      <button type="button" class="notifications-popup-btn secondary" data-action="later">Later</button>
      <button type="button" class="notifications-popup-btn primary" data-action="turn-on">Turn On</button>
    </div>
  `;

  popup.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (!action) {
      return;
    }

    popup.remove();

    if (action === "turn-on") {
      window.location.href = "profile-settings.html";
    }
  });

  document.body.appendChild(popup);
  window.requestAnimationFrame(() => {
    popup.classList.remove("hidden");
  });
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

function getMembershipReminderState(membership) {
  if (!membership || membership.planCode === "none" || !membership.currentPeriodEnd) {
    return null;
  }

  const dueDate = new Date(membership.currentPeriodEnd);
  if (Number.isNaN(dueDate.getTime())) {
    return null;
  }

  const now = new Date();
  const msPerDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.ceil((dueDate.getTime() - now.getTime()) / msPerDay);
  const formattedDate = dueDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" });

  if (membership.status === "past_due" || diffDays < 0) {
    return {
      tone: "warning",
      message: `${membershipReminderPlanLabel(membership.planCode)} membership is overdue. Open Membership to renew now.`,
      notification: `Namaskaram \uD83D\uDE4F ${membershipReminderPlanLabel(membership.planCode)} membership is overdue. Tap to continue.`,
      key: `overdue:${formatIsoDate(dueDate)}`,
    };
  }

  if (diffDays <= 3) {
    const dayLabel = diffDays === 1 ? "day" : "days";
    return {
      tone: diffDays === 0 ? "warning" : "encouragement",
      message: diffDays === 0
        ? `${membershipReminderPlanLabel(membership.planCode)} membership is due today.`
        : `${membershipReminderPlanLabel(membership.planCode)} membership due in ${diffDays} ${dayLabel} on ${formattedDate}.`,
      notification: diffDays === 0
        ? `Namaskaram \uD83D\uDE4F ${membershipReminderPlanLabel(membership.planCode)} membership is due today. Tap to continue.`
        : `Namaskaram \uD83D\uDE4F ${membershipReminderPlanLabel(membership.planCode)} membership is due in ${diffDays} ${dayLabel}. Tap to continue.`,
      key: `due:${formatIsoDate(dueDate)}:${diffDays}`,
    };
  }

  return null;
}

function renderHomeMembershipReminder(reminder) {
  if (!homeMembershipReminderCardEl || !homeMembershipReminderTextEl) {
    return;
  }

  if (!reminder) {
    homeMembershipReminderCardEl.classList.add("hidden");
    homeMembershipReminderCardEl.classList.remove("is-warning", "is-encouragement");
    homeMembershipReminderTextEl.textContent = "";
    return;
  }

  homeMembershipReminderCardEl.classList.remove("hidden");
  homeMembershipReminderCardEl.classList.toggle("is-warning", reminder.tone === "warning");
  homeMembershipReminderCardEl.classList.toggle("is-encouragement", reminder.tone !== "warning");
  homeMembershipReminderTextEl.textContent = reminder.message;
}

async function maybeSendMembershipReminderNotification(reminder) {
  const notificationsApi = window.pwaNotifications;
  if (!reminder || !userId || !notificationsApi?.isSupported?.() || notificationsApi.getPermission?.() !== "granted") {
    return;
  }

  const storageKey = getMembershipReminderNotificationKey(userId, reminder.key);
  try {
    if (localStorage.getItem(storageKey) === "sent") {
      return;
    }
  } catch (error) {
    console.error("Membership reminder notification cache read error:", error);
  }

  try {
    const sent = await notificationsApi.sendNotification("YogaUnnati", reminder.notification, { data: { url: "./membership.html?from=home" } });
    if (sent) {
      localStorage.setItem(storageKey, "sent");
    }
  } catch (error) {
    console.error("Membership reminder notification error:", error);
  }
}

function renderMembershipReminderDebug(label, membership, reminder, errorText = "") {
  if (!homeMembershipReminderDebugTextEl) {
    return;
  }

  const payload = {
    label,
    userId,
    membership,
    reminder,
    error: errorText || null,
  };

  homeMembershipReminderDebugTextEl.textContent = JSON.stringify(payload, null, 2);
}

async function loadHomeMembershipReminder() {
  if (!userId || !window.membershipData) {
    renderMembershipReminderDebug("missing-prerequisites", null, null, "userId or membershipData missing");
    return;
  }

  const cachedMembership = window.membershipData.readMembershipCache(userId);
  let reminder = getMembershipReminderState(cachedMembership);
  renderHomeMembershipReminder(reminder);
  renderMembershipReminderDebug("cached", cachedMembership, reminder);

  try {
    const membership = await window.membershipData.refreshCurrentUserMembership(userId);
    reminder = getMembershipReminderState(membership);
    renderHomeMembershipReminder(reminder);
    renderMembershipReminderDebug("remote", membership, reminder);
    await maybeSendMembershipReminderNotification(reminder);
  } catch (error) {
    console.error("Membership reminder load error:", error);
    renderMembershipReminderDebug("error", null, null, error?.message || String(error));
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
  const currentUser = await window.appAuth.getCurrentUser();
  if (!currentUser?.id) {
    window.location.href = "auth.html";
    return;
  }

  userId = currentUser.id;
}

function hydrateHomeFromCache() {
  if (!userId) {
    return;
  }

  if (homeAvatarLinkEl) {
    homeAvatarLinkEl.href = `memberprofile.html?uid=${encodeURIComponent(userId)}`;
    if (!homeAvatarLinkEl.dataset.analyticsBound) {
      homeAvatarLinkEl.addEventListener("click", () => {
        window.appAnalytics?.track("open_member_profile", {
          source: "home_avatar",
          member_id: userId,
          is_own_profile: true,
        });
      });
      homeAvatarLinkEl.dataset.analyticsBound = "true";
    }
  }

  applyHomeProfile(readProfileCache(userId));
  practiceDates = readPracticeCache(userId);
  syncHomeUI();
  renderHomeCommunitySnapshot(readHomeCommunityCache(userId));
  loadHomeMembershipReminder();
}
function getTodayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatIsoDate(date) {
  const value = new Date(date);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getRelativeIsoDate(offsetDays) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return getTodayIsoDateForDate(date);
}

function getTodayIsoDateForDate(date) {
  const now = new Date(date);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTargetUnlockIsoDate(practiceDates) {
  const milestoneProgressCount = getMilestoneProgressCount(practiceDates);
  const state = getCurrentMilestoneState(userId, milestoneProgressCount);

  if (!state?.milestone || state.index >= APP_MILESTONES.length - 1 || state.remainingDays <= 0) {
    return null;
  }

  const isMarkedToday = practiceDates.includes(getTodayIsoDate());
  const daysOffset = Math.max(0, state.remainingDays - (isMarkedToday ? 0 : 1));
  return getRelativeIsoDate(daysOffset);
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

function setHomeMilestoneBarWidth(progressPercent) {
  if (!homeMilestoneBarFillEl) {
    return;
  }

  const widthValue = `${progressPercent}%`;

  if (!hasHydratedHomeMilestoneBar) {
    let shouldAnimate = false;

    try {
      shouldAnimate = !sessionStorage.getItem(HOME_MILESTONE_BAR_ANIMATED_KEY);
      if (shouldAnimate) {
        sessionStorage.setItem(HOME_MILESTONE_BAR_ANIMATED_KEY, "1");
      }
    } catch (error) {
      shouldAnimate = false;
    }

    if (shouldAnimate) {
      homeMilestoneBarFillEl.classList.add("animate-once");
      homeMilestoneBarFillEl.style.width = "0%";
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          homeMilestoneBarFillEl.style.width = widthValue;
        });
      });
    } else {
      homeMilestoneBarFillEl.classList.remove("animate-once");
      homeMilestoneBarFillEl.style.width = widthValue;
    }

    hasHydratedHomeMilestoneBar = true;
    return;
  }

  homeMilestoneBarFillEl.classList.remove("animate-once");
  homeMilestoneBarFillEl.style.width = widthValue;
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

  if (homeMilestoneBarFillEl) {
    const progressPercent = total === 0 ? 0 : Math.max(0, Math.min(100, (completed / total) * 100));
    setHomeMilestoneBarWidth(progressPercent);
  }
}

function getOrCreateHomeToast() {
  let toast = document.getElementById("toast");

  if (toast) {
    return toast;
  }

  toast = document.createElement("div");
  toast.id = "toast";
  toast.className = "toast hidden";
  document.body.appendChild(toast);
  return toast;
}

function showToast(message) {
  const toast = getOrCreateHomeToast();

  toast.textContent = message;
  toast.classList.remove("hidden", "show");

  window.setTimeout(() => {
    toast.classList.add("show");
  }, 10);

  window.setTimeout(() => {
    toast.classList.remove("show");

    window.setTimeout(() => {
      toast.classList.add("hidden");
    }, 300);
  }, 2200);
}

function getOrCreateMilestoneUnlockBanner() {
  let banner = document.getElementById("milestoneUnlockBanner");

  if (banner) {
    return banner;
  }

  banner = document.createElement("div");
  banner.id = "milestoneUnlockBanner";
  banner.className = "milestone-unlock-banner hidden";
  banner.innerHTML = `
    <p class="milestone-unlock-banner-title">Congratulations! &#127881;</p>
    <p class="milestone-unlock-banner-text"></p>
  `;
  document.body.appendChild(banner);
  return banner;
}

function showMilestoneUnlockBanner(nextState) {
  window.milestoneUnlockBanner?.showFromMilestoneState(nextState);
}

async function maybeSendMilestoneUnlockNotification(nextState) {
  const notificationsApi = window.pwaNotifications;
  if (!notificationsApi?.isSupported?.() || notificationsApi.getPermission?.() !== "granted") {
    return;
  }

  try {
    await notificationsApi.sendNotification(
      "YogaUnnati",
      `Congratulations! You unlocked ${nextState.milestone.title}.`,
    );
  } catch (error) {
    console.error("Milestone unlock notification error:", error);
  }
}

async function maybeHandleMilestoneUnlock(previousState, nextState) {
  if (!previousState || !nextState || nextState.index <= previousState.index) {
    return;
  }

  showMilestoneUnlockBanner(nextState);
  await maybeSendMilestoneUnlockNotification(nextState);
}

async function maybeSendProgressNotification() {
  const notificationsApi = window.pwaNotifications;
  if (!notificationsApi?.isSupported?.() || notificationsApi.getPermission?.() !== "granted") {
    return;
  }

  try {
    await notificationsApi.sendNotification(
      "YogaUnnati",
      getPracticeProgressNotificationMessage(userId, practiceDates),
    );
  } catch (error) {
    console.error("Progress notification error:", error);
  }
}

// ➕ Insert today's practice
async function markToday() {
  const today = getTodayIsoDate();

  if (!userId) {
    console.error("User not loaded");
    return;
  }

  const previousMilestoneState = getCurrentMilestoneState(userId, getMilestoneProgressCount(practiceDates));

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
  markRemoteRefresh("practice_dates", userId);
  if (!practiceDates.includes(today)) {
    practiceDates.push(today);
  }
  const milestoneState = getCurrentMilestoneState(userId, getMilestoneProgressCount(practiceDates));
  window.appAnalytics?.track("mark_practice", {
    source: "home",
    date: today,
    total_days: practiceDates.length,
    milestone: milestoneState.milestone.title,
  });
  syncHomeUI();
  syncHomeCommunitySnapshotForTodayPractice(true);
  await maybeHandleMilestoneUnlock(previousMilestoneState, milestoneState);
  await maybeSendProgressNotification();
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
  markRemoteRefresh("practice_dates", userId);
  practiceDates = practiceDates.filter((date) => date !== today);
  const milestoneState = getCurrentMilestoneState(userId, getMilestoneProgressCount(practiceDates));
  window.appAnalytics?.track("unmark_practice", {
    source: "home",
    date: today,
    total_days: practiceDates.length,
    milestone: milestoneState.milestone.title,
  });
  syncHomeUI();
  syncHomeCommunitySnapshotForTodayPractice(false);
}

function renderWeek(practiceDates) {
  if (!weekStripEl) {
    return;
  }

  const today = getTodayIsoDate();
  const targetUnlockDate = getTargetUnlockIsoDate(practiceDates);
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);

  const startOfWeek = new Date(todayDate);
  startOfWeek.setDate(todayDate.getDate() - todayDate.getDay());
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  const practicedSet = new Set(practiceDates);
  const weekMarkup = [];

  for (let i = 0; i < 7; i++) {
    const date = new Date(startOfWeek);
    date.setDate(startOfWeek.getDate() + i);

    const formattedDate = getTodayIsoDateForDate(date);
    const isToday = formattedDate === today;
    const isDone = practicedSet.has(formattedDate);
    const isTargetUnlockDay = formattedDate === targetUnlockDate;
    const previousDate = new Date(date);
    previousDate.setDate(date.getDate() - 1);
    const isPrevDone = practicedSet.has(getTodayIsoDateForDate(previousDate));
    const streakClass = isDone && isPrevDone ? "streak" : "";
    const streakStartClass = isDone && isPrevDone && i === 0 ? "streak-start" : "";
    const dayLabel = date.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 1);

    weekMarkup.push(`
      <div class="week-day ${isDone ? "done" : ""} ${isToday ? "today" : ""} ${isTargetUnlockDay ? "target-unlock" : ""} ${streakClass} ${streakStartClass}">
        <span class="week-day-label">${dayLabel}</span>
        <span class="week-day-date">${date.getDate()}</span>
      </div>
    `);
  }

  weekStripEl.innerHTML = weekMarkup.join("");

  if (homeTargetDateNoteEl) {
    const shouldShowTargetNote = Boolean(
      targetUnlockDate &&
      parseLocalDate(targetUnlockDate) >= startOfWeek &&
      parseLocalDate(targetUnlockDate) <= endOfWeek
    );
    homeTargetDateNoteEl.classList.toggle("hidden", !shouldShowTargetNote);
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
    const refreshTasks = [];

    if (shouldRefreshRemote("practice_dates", userId, PRACTICE_REFRESH_TTL_MS)) {
      refreshTasks.push(refreshPracticeDates());
    }

    if (shouldRefreshRemote("profile", userId, PROFILE_REFRESH_TTL_MS)) {
      refreshTasks.push(loadHomeProfile());
    }

    if (
      shouldRefreshRemote("community_today", userId, COMMUNITY_HOME_REFRESH_TTL_MS) ||
      shouldRefreshRemote("profiles_public", "", COMMUNITY_HOME_REFRESH_TTL_MS)
    ) {
      refreshTasks.push(refreshHomeCommunitySnapshot());
    }

    if (shouldRefreshRemote("membership", userId, MEMBERSHIP_REFRESH_TTL_MS)) {
      refreshTasks.push(loadHomeMembershipReminder());
    }

    if (refreshTasks.length) {
      await Promise.all(refreshTasks);
    }
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
    window.appAnalytics?.track("open_progress", {
      source: "home_week_card",
    });
    window.location.href = "progress.html";
  });

  weekCardLinkEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      window.appAnalytics?.track("open_progress", {
        source: "home_week_card",
      });
      window.location.href = "progress.html";
    }
  });
}

// 🚀 Init

// checkToday();
// loadStats();

async function initApp() {
  const cachedUser = window.appAuth?.getCachedUser?.();
  if (cachedUser?.id) {
    userId = cachedUser.id;
    hydrateHomeFromCache();
  }

  await initUser();   // 🔥 must complete first
  window.appAnalytics?.identify(userId);
  hydrateHomeFromCache();
  if (homeMembershipReminderCardEl) {
    homeMembershipReminderCardEl.addEventListener("click", () => {
      window.location.href = "membership.html?from=home";
    });
    homeMembershipReminderCardEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        window.location.href = "membership.html?from=home";
      }
    });
  }
  loadHomeProfile();
  refreshPracticeDates();
  refreshHomeCommunitySnapshot();
  loadHomeMembershipReminder();

  window.setTimeout(() => {
    showHomeNotificationsPrompt();
  }, 650);

}

initBrandTaglineRotation();
initTomorrowRsvp();
initTodayPracticeCardLink();
initApp();
























