const adminMemberNameEl = document.getElementById("adminMemberName");
const adminMemberMetaEl = document.getElementById("adminMemberMeta");
const adminMemberLevelEl = document.getElementById("adminMemberLevel");
const adminDetailTotalDaysEl = document.getElementById("adminDetailTotalDays");
const adminDetailStreakEl = document.getElementById("adminDetailStreak");
const adminDetailLastPracticeEl = document.getElementById("adminDetailLastPractice");
const adminDetailMilestoneTitleEl = document.getElementById("adminDetailMilestoneTitle");
const adminDetailMilestoneProgressEl = document.getElementById("adminDetailMilestoneProgress");
const adminDetailMilestoneRemainingEl = document.getElementById("adminDetailMilestoneRemaining");
const adminDetailMemberIdEl = document.getElementById("adminDetailMemberId");
const adminRecentPracticeListEl = document.getElementById("adminRecentPracticeList");
const adminCalendarLabelEl = document.getElementById("adminCalendarLabel");
const adminPracticeCalendarGridEl = document.getElementById("adminPracticeCalendarGrid");
const adminCalendarPrevBtn = document.getElementById("adminCalendarPrev");
const adminCalendarNextBtn = document.getElementById("adminCalendarNext");
const adminMemberMembershipPlanEl = document.getElementById("adminMemberMembershipPlan");
const adminMemberMembershipStatusEl = document.getElementById("adminMemberMembershipStatus");
const adminMemberMembershipStartEl = document.getElementById("adminMemberMembershipStart");
const adminMemberMembershipRenewalEl = document.getElementById("adminMemberMembershipRenewal");
const adminMemberSaveMembershipBtnEl = document.getElementById("adminMemberSaveMembershipBtn");
const adminMemberMembershipMsgEl = document.getElementById("adminMemberMembershipMsg");

let adminMemberPracticeDates = [];
let adminCalendarDate = new Date();
let currentAdminMemberId = "";

function setAdminMemberMembershipMessage(text) {
  adminMemberMembershipMsgEl.textContent = text;
}

function calculateAdminStreak(practiceDates) {
  const dates = [...new Set(practiceDates)].sort().reverse();
  let streak = 0;
  let compareDate = new Date();
  compareDate.setHours(0, 0, 0, 0);

  for (let index = 0; index < dates.length; index += 1) {
    const date = new Date(`${dates[index]}T00:00:00`);
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

function formatAdminDate(dateString) {
  if (!dateString) {
    return "-";
  }

  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateForInput(dateValue) {
  if (!dateValue) {
    return "";
  }

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return formatIsoDate(date);
}

function getCurrentIso() {
  return new Date().toISOString();
}

function getNextMonthlyRenewalIso() {
  const nextDate = new Date();
  nextDate.setMonth(nextDate.getMonth() + 1);
  return nextDate.toISOString();
}

function renderAdminPracticeCalendar() {
  if (!adminCalendarLabelEl || !adminPracticeCalendarGridEl) {
    return;
  }

  const practicedSet = new Set(adminMemberPracticeDates);
  const year = adminCalendarDate.getFullYear();
  const month = adminCalendarDate.getMonth();
  const todayIso = formatIsoDate(new Date());
  const firstDay = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const calendarMarkup = [];

  adminCalendarLabelEl.textContent = adminCalendarDate.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });

  for (let index = 0; index < firstDay; index += 1) {
    calendarMarkup.push('<div class="admin-calendar-day admin-calendar-day-empty"></div>');
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const isoDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const isPracticed = practicedSet.has(isoDate);
    const isToday = isoDate === todayIso;

    calendarMarkup.push(`
      <div class="admin-calendar-day ${isPracticed ? "is-active" : ""} ${isToday ? "is-today" : ""}">
        <span class="admin-calendar-day-number">${day}</span>
      </div>
    `);
  }

  adminPracticeCalendarGridEl.innerHTML = calendarMarkup.join("");
}

async function loadMembershipRow(memberId) {
  const { data, error } = await window.supabaseClient
    .from("memberships")
    .select("plan_code, status, started_at, current_period_end")
    .eq("user_id", memberId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

function renderMembershipEditor(membershipRow) {
  const planCode = membershipRow?.plan_code || "none";
  const status = membershipRow?.status || (planCode === "none" ? "inactive" : "active");

  adminMemberMembershipPlanEl.value = planCode;
  adminMemberMembershipStatusEl.value = status;
  adminMemberMembershipStartEl.value = formatDateForInput(membershipRow?.started_at || "");
  adminMemberMembershipRenewalEl.value = formatDateForInput(membershipRow?.current_period_end || "");
}

async function saveMemberMembership() {
  if (!currentAdminMemberId) {
    return;
  }

  const planCode = adminMemberMembershipPlanEl.value;
  const status = planCode === "none" ? "inactive" : adminMemberMembershipStatusEl.value;
  const startValue = adminMemberMembershipStartEl.value;
  const renewalValue = adminMemberMembershipRenewalEl.value;

  adminMemberSaveMembershipBtnEl.disabled = true;
  setAdminMemberMembershipMessage("Saving membership...");

  try {
    const payload = {
      user_id: currentAdminMemberId,
      plan_code: planCode,
      status,
      billing_cycle: "monthly",
      started_at: planCode === "none"
        ? null
        : (startValue ? new Date(`${startValue}T00:00:00`).toISOString() : getCurrentIso()),
      current_period_end: planCode === "none"
        ? null
        : (renewalValue ? new Date(`${renewalValue}T00:00:00`).toISOString() : getNextMonthlyRenewalIso()),
      cancel_at_period_end: false,
    };

    const { error } = await window.supabaseClient
      .from("memberships")
      .upsert(payload, { onConflict: "user_id" });

    if (error) {
      throw error;
    }

    renderMembershipEditor(payload);
    setAdminMemberMembershipMessage("Membership updated.");
    window.appAnalytics?.track("admin_membership_updated", {
      plan_code: planCode,
      status,
    });
  } catch (error) {
    console.error(error);
    setAdminMemberMembershipMessage(error.message || "Could not save membership.");
  } finally {
    adminMemberSaveMembershipBtnEl.disabled = false;
  }
}

async function loadAdminMember() {
  const adminUser = await window.adminAccess.requireAdminAccess();
  if (!adminUser) {
    return;
  }

  window.appAnalytics?.identify(adminUser.id);

  const memberId = new URLSearchParams(window.location.search).get("uid");
  if (!memberId) {
    window.location.href = "admin-members.html";
    return;
  }

  currentAdminMemberId = memberId;

  const [profileRow, practiceLogsResult, membershipRow] = await Promise.all([
    fetchProfileRow(memberId).catch((error) => {
      if (isProfilesTableMissing(error)) {
        return null;
      }
      throw error;
    }),
    window.supabaseClient.from("practice_logs").select("date").eq("user_id", memberId),
    loadMembershipRow(memberId).catch((error) => {
      if (error?.code === "42P01") {
        return null;
      }
      throw error;
    }),
  ]);

  if (practiceLogsResult.error) {
    throw practiceLogsResult.error;
  }

  const practiceDates = (practiceLogsResult.data || []).map((row) => row.date).sort();
  adminMemberPracticeDates = [...new Set(practiceDates)];
  const totalDays = adminMemberPracticeDates.length;
  const streak = calculateAdminStreak(adminMemberPracticeDates);
  const lastPractice = adminMemberPracticeDates.slice(-1)[0] || "";
  const milestoneState = getCurrentMilestoneState(memberId, getMilestoneProgressCount(adminMemberPracticeDates));
  const profile = profileRow ? getProfileFromRow(profileRow) : normalizeProfileData();
  const displayName = profile.displayName || "Yoga Member";

  if (lastPractice) {
    const lastPracticeDate = new Date(`${lastPractice}T00:00:00`);
    adminCalendarDate = new Date(lastPracticeDate.getFullYear(), lastPracticeDate.getMonth(), 1);
  } else {
    const now = new Date();
    adminCalendarDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  adminMemberNameEl.textContent = displayName;
  adminMemberMetaEl.textContent = lastPractice
    ? `Last practice on ${formatAdminDate(lastPractice)}`
    : "No practice recorded yet.";
  adminMemberLevelEl.textContent = milestoneState.milestone.level;
  adminDetailTotalDaysEl.textContent = String(totalDays);
  adminDetailStreakEl.textContent = String(streak);
  adminDetailLastPracticeEl.textContent = formatAdminDate(lastPractice);
  adminDetailMilestoneTitleEl.textContent = milestoneState.milestone.title;
  adminDetailMilestoneProgressEl.textContent = `${Math.min(milestoneState.completedWithinMilestone, milestoneState.totalWithinMilestone)} / ${milestoneState.totalWithinMilestone} days in current milestone`;
  adminDetailMilestoneRemainingEl.textContent = milestoneState.remainingDays === 0
    ? "Milestone completed"
    : `${milestoneState.remainingDays} days remaining to the next unlock`;
  adminDetailMemberIdEl.textContent = memberId;

  renderMembershipEditor(membershipRow);
  renderAdminPracticeCalendar();

  if (!adminMemberPracticeDates.length) {
    adminRecentPracticeListEl.innerHTML = '<div class="admin-empty-state">No practice entries yet.</div>';
    return;
  }

  const recentDates = [...adminMemberPracticeDates].reverse().slice(0, 12);
  adminRecentPracticeListEl.innerHTML = recentDates
    .map((dateString) => `<div class="admin-recent-item">${formatAdminDate(dateString)}</div>`)
    .join("");
}

if (adminCalendarPrevBtn) {
  adminCalendarPrevBtn.addEventListener("click", () => {
    adminCalendarDate = new Date(adminCalendarDate.getFullYear(), adminCalendarDate.getMonth() - 1, 1);
    renderAdminPracticeCalendar();
  });
}

if (adminCalendarNextBtn) {
  adminCalendarNextBtn.addEventListener("click", () => {
    adminCalendarDate = new Date(adminCalendarDate.getFullYear(), adminCalendarDate.getMonth() + 1, 1);
    renderAdminPracticeCalendar();
  });
}

if (adminMemberSaveMembershipBtnEl) {
  adminMemberSaveMembershipBtnEl.addEventListener("click", saveMemberMembership);
}

loadAdminMember().catch((error) => {
  console.error(error);
  adminMemberMetaEl.textContent = "Could not load this member record.";
  adminPracticeCalendarGridEl.innerHTML = '<div class="admin-empty-state">Calendar could not be loaded.</div>';
  adminRecentPracticeListEl.innerHTML = '<div class="admin-empty-state">Member detail could not be loaded.</div>';
  setAdminMemberMembershipMessage("Membership editor could not be loaded.");
});
