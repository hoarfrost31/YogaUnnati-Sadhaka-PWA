const supabaseClient = window.supabaseClient;

const displayNameInput = document.getElementById("displayName");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const msg = document.getElementById("msg");
const loginBtn = document.getElementById("loginBtn");
const signupBtn = document.getElementById("signupBtn");

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

      window.appAnalytics?.track("sign_up", {
        has_display_name: Boolean(displayName),
        source: "auth",
      });
      setMessage("Account created! Now login.");
    } finally {
      setButtonsDisabled(false);
    }
  };
}

loginBtn.onclick = async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    setMessage("Enter email & password");
    return;
  }

  setButtonsDisabled(true);
  setMessage("Signing in...");

  try {
    const { error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    window.appAnalytics?.track("login", {
      method: "password",
      source: "auth",
    });

    setMessage("Login successful!");
    window.location.href = "index.html";
  } finally {
    window.setTimeout(() => {
      setButtonsDisabled(false);
    }, 220);
  }
};
