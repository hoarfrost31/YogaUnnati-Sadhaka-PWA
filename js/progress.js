const supabaseClient = window.supabaseClient;

let userId;
let currentDate = new Date();
let practiceDates = [];
const progressMilestoneTitleEl = document.getElementById("progressMilestoneTitle");
const progressMilestoneLevelEl = document.getElementById("progressMilestoneLevel");
const progressMilestoneValueEl = document.getElementById("progressMilestoneValue");
const progressMilestoneRadialEl = document.getElementById("progressMilestoneRadial");
const progressMilestoneIconEl = document.getElementById("progressMilestoneIcon");
const progressTodayBtn = document.getElementById("progressTodayBtn");
const progressStatusCardEl = document.getElementById("progressStatusCard");
const progressStatusIconEl = document.getElementById("progressStatusIcon");
const progressStatusTextEl = document.getElementById("progressStatusText");
let progressStatusTimer = null;
const PRACTICE_REFRESH_TTL_MS = 90 * 1000;

function getTodayIsoDate() {
  const now = new Date();
  return formatLocalDate(now);
}

function formatLocalDate(date) {
  const now = new Date(date);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(dateString) {
  const [year, month, day] = String(dateString).split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function getRelativeIsoDate(offsetDays) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return formatLocalDate(date);
}

function canMarkPracticeForDate(dateString) {
  const selectedDate = parseLocalDate(dateString);
  selectedDate.setHours(0, 0, 0, 0);

  const today = parseLocalDate(getTodayIsoDate());
  return selectedDate <= today;
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

function formatFriendlyDate(dateString) {
  if (!dateString) {
    return "";
  }

  const date = parseLocalDate(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
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

function renderProgressStatus(messages) {
  if (!progressStatusCardEl || !progressStatusIconEl || !progressStatusTextEl || !messages.length) {
    return;
  }

  if (progressStatusTimer) {
    window.clearInterval(progressStatusTimer);
    progressStatusTimer = null;
  }

  let currentIndex = 0;

  const applyMessage = (message) => {
    progressStatusCardEl.classList.remove("is-warning", "is-encouragement", "is-switching", "has-shine");
    progressStatusCardEl.classList.add(message.tone === "warning" ? "is-warning" : "is-encouragement");
    progressStatusCardEl.classList.toggle("has-shine", Boolean(message.shine));
    progressStatusIconEl.textContent = message.icon;
    progressStatusTextEl.textContent = message.text;
  };

  applyMessage(messages[currentIndex]);

  if (messages.length > 1) {
    progressStatusTimer = window.setInterval(() => {
      progressStatusCardEl.classList.add("is-switching");

      window.setTimeout(() => {
        currentIndex = (currentIndex + 1) % messages.length;
        applyMessage(messages[currentIndex]);
      }, 360);
    }, 4200);
  }
}

function loadCalendar() {
  renderCalendar(practiceDates);
}

function loadStats() {
  const totalDays = practiceDates.length;
  document.getElementById("totalDays").textContent = totalDays;

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

  document.getElementById("streak").textContent = streak;

  const statusMessages = [];
  if (streak === 0) {
    statusMessages.push({ tone: "encouragement", icon: "💪", text: "Start your streak today", shine: true });
  } else if (streak === 1) {
    statusMessages.push({ tone: "encouragement", icon: "🔥", text: "1 day streak - good start!", shine: true });
  } else if (streak < 5) {
    statusMessages.push({ tone: "encouragement", icon: "🔥", text: `${streak} day streak - keep going!`, shine: true });
  } else if (streak < 10) {
    statusMessages.push({ tone: "encouragement", icon: "🔥", text: `${streak} day streak - strong discipline!`, shine: true });
  } else {
    statusMessages.push({ tone: "encouragement", icon: "🔥", text: `${streak} day streak - unstoppable!`, shine: true });
  }

  const latestDate = dates.length > 0 ? parseLocalDate(dates[0]) : null;
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);

  let diffDays = null;
  if (latestDate) {
    diffDays = Math.floor((todayDate - latestDate) / (1000 * 60 * 60 * 24));
  }

  const targetUnlockDate = getTargetUnlockIsoDate(practiceDates);
  if (practiceDates.includes(getTodayIsoDate()) && targetUnlockDate) {
    statusMessages.push({
      tone: "encouragement",
      icon: "✨",
      text: `Your next milestone is on ${formatFriendlyDate(targetUnlockDate)}.`,
      shine: false,
    });
  }

  if (streak > 3 && diffDays === 0) {
    statusMessages.push({
      tone: "encouragement",
      icon: "ℹ️",
      text: "2 missed days can reduce your total by 1.",
      shine: false,
    });
  }

  const yesterdayIso = getRelativeIsoDate(-1);
  if (totalDays > 0 && !practiceDates.includes(yesterdayIso)) {
    statusMessages.push({
      tone: "encouragement",
      icon: "🗓️",
      text: "Missed marking yesterday? You can still mark today or yesterday.",
      shine: false,
    });
  }

  if (streak > 0 && diffDays === 1) {
    statusMessages.push({ tone: "warning", icon: "⚠️", text: "You haven't practiced today - your streak is at risk!" });
  } else if (streak > 0 && diffDays > 1) {
    statusMessages.push({ tone: "warning", icon: "💔", text: "You missed your streak - start again today!" });
  }

  renderProgressStatus(statusMessages);
}

function renderCalendar(practicedDates) {
  const grid = document.getElementById("calendarGrid");
  const label = document.getElementById("monthLabel");
  const targetUnlockDate = getTargetUnlockIsoDate(practicedDates);

  grid.innerHTML = "";

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();

  label.textContent = currentDate.toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  for (let i = 0; i < firstDay; i++) {
    grid.innerHTML += "<div></div>";
  }

  const today = new Date();

  for (let d = 1; d <= totalDays; d++) {
    const prevFormatted = `${year}-${String(month + 1).padStart(2, "0")}-${String(d - 1).padStart(2, "0")}`;
    const fullDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const isPrevActive = practicedDates.includes(prevFormatted);
    const isActive = practicedDates.includes(fullDate);
    const isToday =
      d === today.getDate() &&
      month === today.getMonth() &&
      year === today.getFullYear();
    const isTargetUnlockDay = fullDate === targetUnlockDate;

    const isWeekStart = (firstDay + d - 1) % 7 === 0;
    const streakClass = isActive && isPrevActive ? "streak" : "";
    const streakStartClass = isActive && isPrevActive && isWeekStart ? "streak-start" : "";

    grid.innerHTML += `
      <div class="day ${isActive ? "active" : ""} ${isToday ? "today" : ""} ${isTargetUnlockDay ? "target-unlock" : ""} ${streakClass} ${streakStartClass}" data-date="${fullDate}">
        ${d}
      </div>
    `;
  }
}

function syncProgressUI(animateMilestone = false) {
  loadCalendar();
  loadStats();
  renderProgressMilestone(animateMilestone);
  updateProgressTodayButton();
}

function renderProgressMilestone(animate = false) {
  const milestoneProgressCount = getMilestoneProgressCount(practiceDates);
  const state = getCurrentMilestoneState(userId, milestoneProgressCount);
  const total = state.totalWithinMilestone;
  const completed = Math.min(state.completedWithinMilestone, total);
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const progressRatio = total === 0 ? 0 : Math.max(0, Math.min(completed / total, 1));
  const offset = circumference * (1 - progressRatio);

  if (progressMilestoneTitleEl) {
    progressMilestoneTitleEl.textContent = state.milestone.title;
  }

  if (progressMilestoneIconEl) {
    progressMilestoneIconEl.innerHTML = getMilestoneIconSvg(state.milestone.icon);
  }

  if (progressMilestoneLevelEl) {
    progressMilestoneLevelEl.textContent = state.milestone.level;
  }

  if (progressMilestoneValueEl) {
    progressMilestoneValueEl.textContent = `${completed} / ${total}`;
  }

  if (progressMilestoneRadialEl) {
    progressMilestoneRadialEl.classList.toggle("radial-progress-animate", animate);
    progressMilestoneRadialEl.setAttribute("aria-label", `${completed} / ${total} days completed`);
    const valueCircle = progressMilestoneRadialEl.querySelector(".radial-progress-value");
    if (valueCircle) {
      valueCircle.style.strokeDasharray = `${circumference}`;
      valueCircle.style.strokeDashoffset = `${offset}`;
    }
  }
}

function updateProgressTodayButton() {
  if (!progressTodayBtn) {
    return;
  }

  const today = getTodayIsoDate();
  const isMarkedToday = practiceDates.includes(today);
  progressTodayBtn.classList.toggle("is-done", isMarkedToday);

  if (isMarkedToday) {
    progressTodayBtn.textContent = "Done for Today";
    progressTodayBtn.setAttribute("aria-label", "Done for today");
  } else {
    progressTodayBtn.textContent = "Mark Today";
    progressTodayBtn.setAttribute("aria-label", "Mark today");
  }
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

async function toggleTodayPractice() {
  if (!userId) {
    return;
  }

  const today = getTodayIsoDate();
  const isMarkedToday = practiceDates.includes(today);

  try {
    if (isMarkedToday) {
      await supabaseClient
        .from("practice_logs")
        .delete()
        .eq("user_id", userId)
        .eq("date", today);

      practiceDates = practiceDates.filter((dateItem) => dateItem !== today);
      removePracticeDateFromCache(userId, today);
      markRemoteRefresh("practice_dates", userId);
      showToast("Practice removed");
    } else {
      await supabaseClient
        .from("practice_logs")
        .insert([{ user_id: userId, date: today }]);

      if (!practiceDates.includes(today)) {
        practiceDates.push(today);
      }
      addPracticeDateToCache(userId, today);
      markRemoteRefresh("practice_dates", userId);
      showToast("Practice marked");
      await maybeSendProgressNotification();
    }

    syncProgressUI(true);
  } catch (error) {
    console.error(error);
  }
}

async function refreshPracticeDates() {
  try {
    practiceDates = await fetchPracticeDates(userId);
    syncProgressUI(false);
  } catch (error) {
    console.error(error);
  }
}

document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !userId) {
    return;
  }

  try {
    if (shouldRefreshRemote("practice_dates", userId, PRACTICE_REFRESH_TTL_MS)) {
      await refreshPracticeDates();
    }
  } catch (error) {
    console.error(error);
  }
});

document.addEventListener("click", (e) => {
  if (e.target.classList.contains("day")) {
    const date = e.target.dataset.date;
    const isActive = e.target.classList.contains("active");
    openSheet(date, isActive);
  }
});

let selectedDate = null;
let selectedIsActive = false;

function openSheet(date, isActive) {
  const sheet = document.getElementById("daySheet");
  const dateEl = document.getElementById("sheetDate");
  const statusEl = document.getElementById("sheetStatus");
  const btn = document.getElementById("sheetActionBtn");
  const canMarkSelectedDate = canMarkPracticeForDate(date);

  selectedDate = date;
  selectedIsActive = isActive;
  dateEl.textContent = date;
  btn.disabled = false;
  btn.onclick = null;

  if (isActive) {
    statusEl.textContent = "You practiced on this day";
    btn.textContent = "Unmark Practice";
    btn.className = "sheet-btn unmark";
  } else if (canMarkSelectedDate) {
    statusEl.textContent = "No practice recorded";
    btn.textContent = "Mark Practice";
    btn.className = "sheet-btn mark";
  } else {
    const todayIso = getTodayIsoDate();
    statusEl.textContent = date > todayIso
      ? "You can only mark today or earlier."
      : "You can mark any earlier day right now.";
    btn.textContent = "Mark Unavailable";
    btn.className = "sheet-btn disabled";
    btn.disabled = true;
  }

  btn.onclick = async () => {
    try {
      if (selectedIsActive) {
        await supabaseClient
          .from("practice_logs")
          .delete()
          .eq("user_id", userId)
          .eq("date", selectedDate);

        practiceDates = practiceDates.filter((dateItem) => dateItem !== selectedDate);
        removePracticeDateFromCache(userId, selectedDate);
        markRemoteRefresh("practice_dates", userId);
        selectedIsActive = false;
        showToast("Practice removed");
      } else {
        await supabaseClient
          .from("practice_logs")
          .insert([{ user_id: userId, date: selectedDate }]);

        if (!practiceDates.includes(selectedDate)) {
          practiceDates.push(selectedDate);
        }
        addPracticeDateToCache(userId, selectedDate);
        markRemoteRefresh("practice_dates", userId);
        selectedIsActive = true;
        showToast("Practice marked");
        await maybeSendProgressNotification();
      }

      closeSheet();
      syncProgressUI(true);
    } catch (err) {
      console.error(err);
    }
  };

  sheet.classList.remove("hidden");
}

function closeSheet() {
  document.getElementById("daySheet").classList.add("hidden");
}

function showToast(message) {
  const toast = document.getElementById("toast");

  toast.textContent = message;
  toast.classList.remove("hidden");

  setTimeout(() => {
    toast.classList.add("show");
  }, 10);

  setTimeout(() => {
    toast.classList.remove("show");

    setTimeout(() => {
      toast.classList.add("hidden");
    }, 300);
  }, 2000);
}

document.getElementById("prevMonth").onclick = () => {
  currentDate.setMonth(currentDate.getMonth() - 1);
  loadCalendar();
};

document.getElementById("nextMonth").onclick = () => {
  currentDate.setMonth(currentDate.getMonth() + 1);
  loadCalendar();
};

if (progressTodayBtn) {
  progressTodayBtn.addEventListener("click", toggleTodayPractice);
}

async function initApp() {
  await initUser();
  practiceDates = readPracticeCache(userId);
  syncProgressUI(false);
  if (shouldRefreshRemote("practice_dates", userId, PRACTICE_REFRESH_TTL_MS)) {
    refreshPracticeDates();
  }
}

initApp();
