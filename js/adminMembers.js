const adminMembersListEl = document.getElementById("adminMembersList");
const adminMemberSearchEl = document.getElementById("adminMemberSearch");
const adminMemberResultsEl = document.getElementById("adminMemberResults");

let allAdminMembers = [];

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
    return "No practice yet";
  }

  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function renderMembers(members) {
  adminMemberResultsEl.textContent = `${members.length} member${members.length === 1 ? "" : "s"}`;

  if (!members.length) {
    adminMembersListEl.innerHTML = '<div class="admin-empty-state">No matching members found.</div>';
    return;
  }

  adminMembersListEl.innerHTML = members
    .map((member) => `
      <a href="${window.adminRoutes?.member(member.id) || `admin-member.html?uid=${encodeURIComponent(member.id)}`}" class="admin-member-row">
        <div class="admin-member-primary">
          <strong>${member.displayName}</strong>
          <span>${member.level} · ${member.totalDays} total days · ${member.streak} day streak</span>
        </div>
        <div class="admin-member-meta">
          <span>${formatAdminDate(member.lastPractice)}</span>
          <span class="admin-member-id">${member.id}</span>
        </div>
      </a>
    `)
    .join("");
}

function applyMemberFilter() {
  const query = String(adminMemberSearchEl.value || "").trim().toLowerCase();
  if (!query) {
    renderMembers(allAdminMembers);
    return;
  }

  const filteredMembers = allAdminMembers.filter((member) =>
    member.displayName.toLowerCase().includes(query) || member.id.toLowerCase().includes(query)
  );

  renderMembers(filteredMembers);
}

async function loadAdminMembers() {
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
  const practiceMap = new Map();

  practiceLogs.forEach((row) => {
    if (!practiceMap.has(row.user_id)) {
      practiceMap.set(row.user_id, []);
    }
    practiceMap.get(row.user_id).push(row.date);
  });

  allAdminMembers = profiles
    .map((profileRow) => {
      const dates = practiceMap.get(profileRow.id) || [];
      const uniqueDates = [...new Set(dates)].sort();
      const milestoneState = getCurrentMilestoneState(profileRow.id, getMilestoneProgressCount(uniqueDates));
      return {
        id: profileRow.id,
        displayName: getProfileFromRow(profileRow).displayName || DEFAULT_PROFILE_NAME,
        totalDays: getAdjustedPracticeTotalDays(uniqueDates),
        streak: calculateAdminStreak(uniqueDates),
        level: milestoneState.milestone.level,
        lastPractice: uniqueDates.slice(-1)[0] || "",
      };
    })
    .sort((a, b) => {
      if (b.totalDays !== a.totalDays) {
        return b.totalDays - a.totalDays;
      }
      return a.displayName.localeCompare(b.displayName);
    });

  renderMembers(allAdminMembers);
}

adminMemberSearchEl.addEventListener("input", applyMemberFilter);

loadAdminMembers().catch((error) => {
  console.error(error);
  adminMembersListEl.innerHTML = '<div class="admin-empty-state">Could not load members.</div>';
});


