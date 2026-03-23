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

let userId;
let userEmail = "";
let pendingAvatarUrl = "";

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

  try {
    const profile = await ensureCurrentUserProfile(userId);
    renderProfile(profile);
  } catch (error) {
    console.error(error);
  }
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
});

initApp();
