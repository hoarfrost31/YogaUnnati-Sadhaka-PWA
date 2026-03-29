const supabaseClient = window.supabaseClient;

const profileNameInput = document.getElementById("profileNameInput");
const profileImageInput = document.getElementById("profileImageInput");
const profileBackLink = document.getElementById("profileBackLink");
const profileAvatarPreview = document.getElementById("profileAvatarPreview");
const profileAvatarInitial = document.getElementById("profileAvatarInitial");
const profileNameHeading = document.getElementById("profileNameHeading");
const profileEmailText = document.getElementById("profileEmailText");
const saveProfileBtn = document.getElementById("saveProfileBtn");
const removePhotoBtn = document.getElementById("removePhotoBtn");
const classReminderStatus = document.getElementById("classReminderStatus");
const enableNotificationsToggle = document.getElementById("enableNotificationsToggle");
const CLASS_REMINDER_KEY = "pwa_class_reminder_v1";

let userId;
let userEmail = "";
let pendingAvatarUrl = "";
let reminderPreferenceFromAccount = false;

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
  if (!classReminderStatus || !enableNotificationsToggle) {
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
  enableNotificationsToggle.disabled = !isSupported;

  if (!isSupported) {
    enableNotificationsToggle.checked = false;
    classReminderStatus.textContent = "Notifications are not available on this device.";
    return;
  }

  if (permission === "granted") {
    enableNotificationsToggle.checked = effectiveEnabled;
    classReminderStatus.textContent = effectiveEnabled
      ? "Keep them on so you do not miss your practice reminders."
      : "Turn them on here so you stay close to your practice rhythm.";
    return;
  }

  if (permission === "denied") {
    enableNotificationsToggle.checked = false;
    classReminderStatus.textContent = reminderPreferenceFromAccount
      ? "Bring them back in browser settings so your reminders can continue."
      : "Allow notifications in browser settings to receive reminders.";
    return;
  }

  enableNotificationsToggle.checked = effectiveEnabled;
  classReminderStatus.textContent = reminderPreferenceFromAccount
    ? "Turn them on again here to keep your reminders going."
    : "Turn them on here to stay encouraged and on track.";
}

async function initUser() {
  const currentUser = await window.appAuth.getCurrentUser();
  if (!currentUser?.id) {
    window.location.href = "auth.html";
    return;
  }

  userId = currentUser.id;
  userEmail = currentUser.email || "";
}

function initProfileBackLink() {
  if (!profileBackLink) {
    return;
  }

  profileBackLink.addEventListener("click", (event) => {
    event.preventDefault();

    if (userId) {
      window.location.href = `memberprofile.html?uid=${encodeURIComponent(userId)}`;
      return;
    }

    window.location.href = "index.html";
  });
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

if (enableNotificationsToggle) {
  enableNotificationsToggle.addEventListener("change", async () => {
    const notificationsApi = window.pwaNotifications;

    if (!notificationsApi?.isSupported?.()) {
      showToast("Notifications are not supported here");
      enableNotificationsToggle.checked = false;
      renderReminderSettings();
      return;
    }

    if (!enableNotificationsToggle.checked) {
      writeClassReminderPreference(userId, false);
      window.appAnalytics?.track("notifications_disabled", {
        source: "profile_settings",
      });
      try {
        await saveReminderPreference(userId, false);
      } catch (error) {
        console.error("Could not persist reminder preference to account:", error);
      }
      await window.pushSubscriptions?.disable?.(userId);
      showToast("Notifications turned off");
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
      window.appAnalytics?.track("notifications_enabled", {
        source: "profile_settings",
      });
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
      enableNotificationsToggle.checked = false;
      showToast("Notifications blocked");
    } else {
      enableNotificationsToggle.checked = false;
      showToast("Notification permission not granted");
    }

    renderReminderSettings();
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
    window.appAnalytics?.track("save_profile", {
      has_avatar: Boolean(profile.avatarUrl),
      display_name_length: profile.displayName?.length || 0,
    });
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
  window.appAnalytics?.identify(userId);
  initProfileBackLink();
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


