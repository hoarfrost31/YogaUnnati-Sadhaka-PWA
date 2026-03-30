const supabaseClient = window.supabaseClient;

const displayNameInput = document.getElementById("displayName");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const msg = document.getElementById("msg");
const loginBtn = document.getElementById("loginBtn");
const signupBtn = document.getElementById("signupBtn");
const currentPath = window.location.pathname.toLowerCase().replace(/\/+$/, "");
const isAdminAuthPage = Boolean(window.__YOGAUNNATI_ADMIN_LOGIN__) || /(^|\/)admin-login(?:\.html)?$/i.test(currentPath) || window.location.href.toLowerCase().includes("admin-login.html");

function setMessage(text) {
  msg.textContent = text;
}

function setButtonsDisabled(disabled) {
  loginBtn.disabled = disabled;
  if (signupBtn) {
    signupBtn.disabled = disabled;
  }
}

if (signupBtn) {
  signupBtn.onclick = async () => {
    const displayName = displayNameInput?.value.trim() || "";
    const email = emailInput.value;
    const password = passwordInput.value;

    if (!email || !password) {
      setMessage("Enter email & password");
      return;
    }

    if (password.length < 6) {
      setMessage("Password must be at least 6 characters");
      return;
    }

    setButtonsDisabled(true);

    try {
      const { error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName,
          },
        },
      });

      if (error) {
        setMessage(error.message);
        return;
      }

      window.adminAccess?.clear?.();
      window.appAnalytics?.track("sign_up", {
        has_display_name: Boolean(displayName),
        source: isAdminAuthPage ? "admin-login" : "auth",
      });
      setMessage(
        isAdminAuthPage
          ? "Member account created. If your session switched, sign in as admin again."
          : "Account created! Now login."
      );
    } finally {
      setButtonsDisabled(false);
    }
  };
}

loginBtn.onclick = async () => {
  const email = emailInput.value.trim();
  const normalizedEmail = email.toLowerCase();
  const password = passwordInput.value;

  if (!email || !password) {
    setMessage("Enter email & password");
    return;
  }

  setButtonsDisabled(true);
  setMessage("Signing in...");

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    const signedInUser = data?.user || data?.session?.user || await window.appAuth?.getCurrentUser?.({ forceRefresh: true });
    const signedInEmail = String(signedInUser?.email || normalizedEmail).trim().toLowerCase();

    window.appAnalytics?.track("login", {
      method: "password",
      source: isAdminAuthPage ? "admin-login" : "auth",
    });

    if (isAdminAuthPage) {
      const isAllowedAdmin = window.adminAccess?.isAllowedEmail?.(signedInEmail);
      if (!isAllowedAdmin) {
        window.adminAccess?.clear?.();
        await supabaseClient.auth.signOut();
        setMessage("This account is not an admin.");
        return;
      }

      window.adminAccess?.grant?.(signedInEmail);
      setMessage("Admin login successful! Opening dashboard...");
      window.setTimeout(() => {
        window.location.href = window.adminRoutes?.dashboard || "admin.html";
      }, 220);
      return;
    }

    window.adminAccess?.clear?.();
    setMessage("Login successful!");
    window.location.href = "index.html";
  } finally {
    window.setTimeout(() => {
      setButtonsDisabled(false);
    }, 220);
  }
};




