const supabaseClient = window.supabaseClient;

const profileNameInput = document.getElementById("profileNameInput");
const profileImageInput = document.getElementById("profileImageInput");
const profileAvatarPreview = document.getElementById("profileAvatarPreview");
const profileAvatarInitial = document.getElementById("profileAvatarInitial");
const profileNameHeading = document.getElementById("profileNameHeading");
const profileEmailText = document.getElementById("profileEmailText");
const saveProfileBtn = document.getElementById("saveProfileBtn");
const removePhotoBtn = document.getElementById("removePhotoBtn");
const logoutBtn = document.getElementById("logoutBtn");
const classReminderToggle = document.getElementById("classReminderToggle");
const classReminderStatus = document.getElementById("classReminderStatus");
const enableNotificationsBtn = document.getElementById("enableNotificationsBtn");
const testNotificationBtn = document.getElementById("testNotificationBtn");

const CLASS_REMINDER_KEY = "pwa_class_reminder_v1";

let userId;
let userEmail = "";
let pendingAvatarUrl = "";
let reminderPreferenceFromAccount = false;

function getTestReminderMessage() {
  const practiceDates = readPracticeCache(userId);
  const milestoneProgressCount = getMilestoneProgressCount(practiceDates);
  const { milestone, remainingDays } = getCurrentMilestoneState(userId, milestoneProgressCount);

  if (remainingDays <= 0) {
    return `${milestone.title} is complete. Keep showing up tomorrow.`;
  }

  const dayLabel = remainingDays === 1 ? "day" : "days";
  const messageVariants = [
    `${remainingDays} ${dayLabel} left to your next milestone. See you tomorrow morning.`,
    `Stay on track. ${remainingDays} ${dayLabel} left to your next milestone.`,
  ];

  const variantIndex = new Date().getDate() % messageVariants.length;
  return messageVariants[variantIndex];
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

function writeClassReminderPreference(userIdValue, enabled) {
  try {
    localStorage.setItem(getReminderStorageKey(userIdValue), enabled ? "on" : "off");
  } catch (error) {
    console.error("Reminder preference write error:", error);
  }
}

function renderReminderSettings() {
  if (!classReminderToggle || !classReminderStatus || !enableNotificationsBtn || !testNotificationBtn) {
    return;
  }

  const notificationsApi = window.pwaNotifications;
  const isSupported = notificationsApi?.isSupported?.() || false;
  const permission = notificationsApi?.getPermission?.() || "unsupported";
  const isEnabled = readClassReminderPreference(userId);

  if (isSupported && permission === "granted" && reminderPreferenceFromAccount && !isEnabled) {
    writeClassReminderPreference(userId, true);
  }

  const effectiveEnabled = readClassReminderPreference(userId);

  classReminderToggle.checked = isSupported && permission === "granted" && effectiveEnabled;
  classReminderToggle.disabled = !isSupported || permission !== "granted";

  enableNotificationsBtn.disabled = !isSupported || permission === "granted";
  testNotificationBtn.disabled = !isSupported || permission !== "granted";

  if (!isSupported) {
    classReminderStatus.textContent = "This browser does not support notifications for this app.";
    enableNotificationsBtn.textContent = "Notifications Unavailable";
    testNotificationBtn.textContent = "Test Unavailable";
    return;
  }

  if (permission === "granted") {
    classReminderStatus.textContent = effectiveEnabled
      ? "Daily 9:00 PM reminder is on for tomorrow's class."
      : "Notifications are allowed. Turn on the switch to save your daily 9:00 PM reminder.";
    enableNotificationsBtn.textContent = "Notifications Enabled";
    testNotificationBtn.textContent = "Send Test Notification";
    return;
  }

  if (permission === "denied") {
    classReminderStatus.textContent = reminderPreferenceFromAccount
      ? "Your reminder was on before. Please re-enable notifications for this device."
      : "Notifications are blocked. Please enable them in browser settings first.";
    enableNotificationsBtn.textContent = "Notifications Blocked";
    testNotificationBtn.textContent = "Test Blocked";
    return;
  }

  classReminderStatus.textContent = reminderPreferenceFromAccount
    ? "Please re-enable notifications to restore your 9:00 PM class reminder on this device."
    : "Enable notifications first, then we can save your daily 9:00 PM class reminder.";
  enableNotificationsBtn.textContent = reminderPreferenceFromAccount ? "Re-enable Notifications" : "Enable Notifications";
  testNotificationBtn.textContent = "Send Test Notification";
}

async function initUser() {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  if (sessionData?.session?.user) {
    userId = sessionData.session.user.id;
    userEmail = sessionData.session.user.email || "";
    return;
  }

  const { data } = await supabaseClient.auth.getUser();
  if (!data.user) {
    window.location.href = "auth.html";
    return;
  }

  userId = data.user.id;
  userEmail = data.user.email || "";
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
  }, 2200);
}

function renderProfile(profile) {
  const activeProfile = normalizeProfileData(profile);
  const displayName = activeProfile.displayName || DEFAULT_PROFILE_NAME;
  const avatarUrl = activeProfile.avatarUrl || "";
  reminderPreferenceFromAccount = Boolean(activeProfile.classReminderEnabled);

  profileNameInput.value = activeProfile.displayName || "";
  profileNameHeading.textContent = displayName;
  profileEmailText.textContent = userEmail;
  pendingAvatarUrl = avatarUrl;

  if (avatarUrl) {
    profileAvatarPreview.src = avatarUrl;
    profileAvatarPreview.classList.remove("hidden");
    profileAvatarInitial.classList.add("hidden");
  } else {
    profileAvatarPreview.classList.add("hidden");
    profileAvatarInitial.classList.remove("hidden");
    profileAvatarInitial.textContent = getInitials(displayName);
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
}

async function createAvatarDataUrl(file) {
  const rawDataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(rawDataUrl);
  const size = 240;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = size;
  canvas.height = size;

  const scale = Math.max(size / image.width, size / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const offsetX = (size - drawWidth) / 2;
  const offsetY = (size - drawHeight) / 2;

  context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
  return canvas.toDataURL("image/jpeg", 0.82);
}

profileImageInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  try {
    pendingAvatarUrl = await createAvatarDataUrl(file);
    renderProfile({
      displayName: profileNameInput.value.trim() || profileNameHeading.textContent,
      avatarUrl: pendingAvatarUrl,
    });
  } catch (error) {
    console.error(error);
    showToast("Could not process image");
  }
});

removePhotoBtn.addEventListener("click", () => {
  pendingAvatarUrl = "";
  profileImageInput.value = "";
  renderProfile({
    displayName: profileNameInput.value.trim() || profileNameHeading.textContent,
    avatarUrl: "",
  });
});

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await supabaseClient.auth.signOut();
    window.location.href = "auth.html";
  });
}

if (enableNotificationsBtn) {
  enableNotificationsBtn.addEventListener("click", async () => {
    const notificationsApi = window.pwaNotifications;

    if (!notificationsApi?.isSupported?.()) {
      showToast("Notifications are not supported here");
      renderReminderSettings();
      return;
    }

    let permission = notificationsApi.getPermission();

    if (permission !== "granted") {
      try {
        const requestedPermission = await notificationsApi.requestPermission();
        if (requestedPermission && requestedPermission !== "default") {
          permission = requestedPermission;
        } else {
          permission = notificationsApi.getPermission();
        }
      } catch (error) {
        console.error("Notification permission request failed:", error);
        permission = notificationsApi.getPermission();
      }
    }

    if (permission === "granted") {
      writeClassReminderPreference(userId, true);
      try {
        await saveReminderPreference(userId, true);
      } catch (error) {
        console.error("Could not persist reminder preference to account:", error);
      }
      showToast("Notifications enabled");
    } else if (permission === "denied") {
      writeClassReminderPreference(userId, false);
      showToast("Notifications blocked");
    } else {
      showToast("Notification permission not granted");
    }

    renderReminderSettings();
  });
}

if (classReminderToggle) {
  classReminderToggle.addEventListener("change", async () => {
    const notificationsApi = window.pwaNotifications;
    const permission = notificationsApi?.getPermission?.() || "unsupported";

    if (permission !== "granted") {
      classReminderToggle.checked = false;
      showToast("Enable notifications first");
      renderReminderSettings();
      return;
    }

    writeClassReminderPreference(userId, classReminderToggle.checked);
    try {
      await saveReminderPreference(userId, classReminderToggle.checked);
    } catch (error) {
      console.error("Could not persist reminder preference to account:", error);
    }
    showToast(classReminderToggle.checked ? "9 PM reminder saved" : "Reminder turned off");
    renderReminderSettings();
  });
}

if (testNotificationBtn) {
  testNotificationBtn.addEventListener("click", async () => {
    const notificationsApi = window.pwaNotifications;
    const permission = notificationsApi?.getPermission?.() || "unsupported";

    if (permission !== "granted") {
      showToast("Enable notifications first");
      renderReminderSettings();
      return;
    }

    try {
      if (/iPhone|iPad|iPod/i.test(navigator.userAgent) && !notificationsApi?.isStandalone?.()) {
        showToast("Add this app to Home Screen first to test notifications on iPhone.");
        return;
      }

      const sent = await notificationsApi.sendTestNotification(getTestReminderMessage());
      showToast(sent ? "Test notification sent" : "Could not send notification");
    } catch (error) {
      console.error(error);
      showToast("Could not send notification on this device yet");
    }
  });
}

saveProfileBtn.addEventListener("click", async () => {
  const displayName = profileNameInput.value.trim();

  if (!displayName) {
    showToast("Please add your name");
    profileNameInput.focus();
    return;
  }

  saveProfileBtn.disabled = true;
  saveProfileBtn.textContent = "Saving...";

  try {
    const profile = await saveCurrentUserProfile(userId, {
      displayName,
      avatarUrl: pendingAvatarUrl,
    });

    renderProfile(profile);
    showToast("Profile updated");
  } catch (error) {
    console.error(error);
    showToast("Could not save profile");
  } finally {
    saveProfileBtn.disabled = false;
    saveProfileBtn.textContent = "Save Profile";
  }
});

async function initApp() {
  await initUser();
  renderProfile(readProfileCache(userId));
  renderReminderSettings();

  try {
    const profile = await ensureCurrentUserProfile(userId);
    renderProfile(profile);
  } catch (error) {
    console.error(error);
  }

  renderReminderSettings();
}

document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !userId) {
    return;
  }

  try {
    const profile = await refreshCurrentUserProfile(userId);
    renderProfile(profile);
  } catch (error) {
    console.error(error);
  }

  renderReminderSettings();
});

initApp();
