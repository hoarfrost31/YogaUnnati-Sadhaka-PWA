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
const classReminderStatus = document.getElementById("classReminderStatus");
const enableNotificationsBtn = document.getElementById("enableNotificationsBtn");
const testNotificationBtn = document.getElementById("testNotificationBtn");

const CLASS_REMINDER_KEY = "pwa_class_reminder_v1";

let userId;
let userEmail = "";
let pendingAvatarUrl = "";
let reminderPreferenceFromAccount = false;
let testReminderMessageIndex = 0;

function getTestReminderMessage() {
  if (
    typeof readPracticeCache !== "function" ||
    typeof getMilestoneProgressCount !== "function" ||
    typeof getCurrentMilestoneState !== "function"
  ) {
    const fallbackMessages = [
      "Stay on track. See you tomorrow morning.",
      "Join us tomorrow morning.",
      "Keep your rhythm going. See you in class tomorrow morning.",
      "Consistency is your only focus right now. Keep going.",
      "Use the weekend to deepen, not drift away from your practice.",
      "A new week begins. Stay committed to your practice and show up tomorrow.",
      "Sunday is for resetting. We will see you Monday morning.",
    ];

    const message = fallbackMessages[testReminderMessageIndex % fallbackMessages.length];
    testReminderMessageIndex += 1;
    return message;
  }

  const practiceDates = readPracticeCache(userId);
  const milestoneProgressCount = getMilestoneProgressCount(practiceDates);
  const { milestone, remainingDays } = getCurrentMilestoneState(userId, milestoneProgressCount);
  const dayLabel = remainingDays === 1 ? "day" : "days";
  const today = new Date();
  const weekday = today.getDay();

  if (remainingDays <= 0) {
    const completedMessages = [
      `${milestone.title} is complete. Keep showing up tomorrow.`,
      "Stay on track. We will see you tomorrow morning.",
      "A beautiful step forward. Join us again tomorrow morning.",
    ];

    const message = completedMessages[testReminderMessageIndex % completedMessages.length];
    testReminderMessageIndex += 1;
    return message;
  }

  const messageVariants = [
    `${remainingDays} ${dayLabel} left to your next milestone. See you tomorrow morning.`,
    `Stay on track. ${remainingDays} ${dayLabel} left to your next milestone.`,
    `Join us tomorrow morning. ${remainingDays} ${dayLabel} left to your next milestone.`,
    "Consistency is your only focus right now. Keep going.",
  ];

  if (weekday === 5) {
    messageVariants.push(
      `Before the weekend slips away, stay on track. ${remainingDays} ${dayLabel} left to your next milestone.`,
      `Heading into the weekend? Join us tomorrow morning and keep your rhythm alive.`,
      "Use the weekend to deepen, not drift away from your practice.",
    );
  }

  if (weekday === 6) {
    messageVariants.push(
      `Weekend practice counts too. ${remainingDays} ${dayLabel} left to your next milestone.`,
      `Stay on track this weekend. We will see you tomorrow morning.`,
      "Use the weekend to deepen, not drift away from your practice.",
    );
  }

  if (weekday === 0) {
    messageVariants.push(
      `Set up your week well. See you tomorrow morning for Monday's class.`,
      `Sunday reset. Come back strong tomorrow morning.`,
      "A new week begins. Stay committed to your practice and show up tomorrow.",
    );
  }

  const message = messageVariants[testReminderMessageIndex % messageVariants.length];
  testReminderMessageIndex += 1;
  return message;
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
  if (!classReminderStatus || !enableNotificationsBtn || !testNotificationBtn) {
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
  enableNotificationsBtn.disabled = !isSupported;
  testNotificationBtn.disabled = !isSupported || permission !== "granted";

  if (!isSupported) {
    classReminderStatus.textContent = "This browser does not support notifications for this app.";
    enableNotificationsBtn.textContent = "Notifications Unavailable";
    testNotificationBtn.textContent = "Test Unavailable";
    return;
  }

  if (permission === "granted") {
    classReminderStatus.textContent = effectiveEnabled
      ? "Notifications are on for this device."
      : "Notifications are allowed on this device.";
    enableNotificationsBtn.textContent = "Ask Again";
    testNotificationBtn.textContent = "Send Test Notification";
    return;
  }

  if (permission === "denied") {
    classReminderStatus.textContent = reminderPreferenceFromAccount
      ? "Your reminder was on before. Please re-enable notifications for this device."
      : "Notifications are blocked. Please enable them in browser settings first.";
    enableNotificationsBtn.textContent = "Ask Again";
    testNotificationBtn.textContent = "Test Blocked";
    return;
  }

  classReminderStatus.textContent = reminderPreferenceFromAccount
    ? "Please re-enable notifications to restore them on this device."
    : "Allow notifications to hear from us here.";
  enableNotificationsBtn.textContent = "Ask for Notifications";
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

      let subscriptionResult = null;
      try {
        subscriptionResult = await window.pushSubscriptions?.ensureSubscribed?.(userId);
      } catch (error) {
        console.error("Could not register push subscription:", error);
      }

      if (subscriptionResult?.ok) {
        showToast("Notifications enabled");
      } else if (subscriptionResult?.reason === "table_missing") {
        showToast("Notifications enabled, but push table is missing");
      } else if (subscriptionResult?.reason === "unconfigured") {
        showToast("Notifications enabled, but push key is missing");
      } else if (subscriptionResult?.reason === "unsupported") {
        showToast("Notifications enabled on this device");
      } else {
        showToast("Notifications enabled, but push sync is not saved yet");
      }
    } else if (permission === "denied") {
      writeClassReminderPreference(userId, false);
      await window.pushSubscriptions?.disable?.(userId);
      showToast("Notifications blocked");
    } else {
      showToast("Notification permission not granted");
    }

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
      const message = error?.message ? `Notification failed: ${error.message}` : "Could not send notification on this device yet";
      showToast(message);
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
