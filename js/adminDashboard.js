const adminMemberCountEl = document.getElementById("adminMemberCount");
const adminTodayCountEl = document.getElementById("adminTodayCount");
const adminPracticeLogCountEl = document.getElementById("adminPracticeLogCount");
const adminPracticePulseEl = document.getElementById("adminPracticePulse");

function formatAdminDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

async function loadAdminDashboard() {
  const adminUser = await window.adminAccess.requireAdminAccess();
  if (!adminUser) {
    return;
  }

  window.appAnalytics?.identify(adminUser.id);

  const [profiles, practiceLogsResult] = await Promise.all([
    fetchAllProfiles(),
    supabaseClient.from("practice_logs").select("user_id, date"),
  ]);

  if (practiceLogsResult.error) {
    throw practiceLogsResult.error;
  }

  const practiceLogs = practiceLogsResult.data || [];
  const practicedTodayIds = new Set(
    practiceLogs
      .filter((row) => row.date === new Date().toISOString().slice(0, 10))
      .map((row) => row.user_id)
      .filter(Boolean)
  );

  adminMemberCountEl.textContent = String(profiles.length);
  adminTodayCountEl.textContent = String(practicedTodayIds.size);
  adminPracticeLogCountEl.textContent = String(practiceLogs.length);

  const practiceByUser = new Map();
  practiceLogs.forEach((row) => {
    if (!practiceByUser.has(row.user_id)) {
      practiceByUser.set(row.user_id, []);
    }
    practiceByUser.get(row.user_id).push(row.date);
  });

  const membersWithActivity = profiles
    .map((profileRow) => {
      const dates = practiceByUser.get(profileRow.id) || [];
      const state = getCurrentMilestoneState(profileRow.id, getMilestoneProgressCount(dates));
      return {
        id: profileRow.id,
        displayName: getProfileFromRow(profileRow).displayName || DEFAULT_PROFILE_NAME,
        totalDays: getAdjustedPracticeTotalDays(dates),
        practicedToday: practicedTodayIds.has(profileRow.id),
        milestone: state.milestone.title,
        lastPractice: dates.sort().slice(-1)[0] || "",
      };
    })
    .filter((member) => member.totalDays > 0)
    .sort((a, b) => b.totalDays - a.totalDays)
    .slice(0, 5);

  if (!membersWithActivity.length) {
    adminPracticePulseEl.innerHTML = '<div class="admin-empty-state">No practice data yet.</div>';
    return;
  }

  adminPracticePulseEl.innerHTML = membersWithActivity
    .map((member) => `
      <a href="${window.adminRoutes?.member(member.id) || `admin-member.html?uid=${encodeURIComponent(member.id)}`}" class="admin-link-card">
        <strong>${member.displayName}</strong>
        <span>${member.totalDays} total days · ${member.milestone}${member.lastPractice ? ` · Last on ${formatAdminDate(member.lastPractice)}` : ""}${member.practicedToday ? " · Practiced today" : ""}</span>
      </a>
    `)
    .join("");
}

loadAdminDashboard().catch((error) => {
  console.error(error);
  adminPracticePulseEl.innerHTML = '<div class="admin-empty-state">Could not load dashboard data.</div>';
});


