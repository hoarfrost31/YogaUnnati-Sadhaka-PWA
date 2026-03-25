const supabaseClient = window.supabaseClient;

const displayNameInput = document.getElementById("displayName");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const msg = document.getElementById("msg"); // match HTML

// SIGNUP
document.getElementById("signupBtn").onclick = async () => {
  const displayName = displayNameInput.value.trim();
  const email = emailInput.value;
  const password = passwordInput.value;

  if (!email || !password) {
    msg.textContent = "Enter email & password";
    return;
  }

  if (password.length < 6) {
    msg.textContent = "Password must be at least 6 characters";
    return;
  }

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
    msg.textContent = error.message;
  } else {
    window.appAnalytics?.track("sign_up", {
      has_display_name: Boolean(displayName),
    });
    msg.textContent = "Account created! Now login.";
  }
};

// LOGIN
document.getElementById("loginBtn").onclick = async () => {
  const email = emailInput.value;
  const password = passwordInput.value;

  const { error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    msg.textContent = error.message;
  } else {
    window.appAnalytics?.track("login", {
      method: "password",
    });
    msg.textContent = "Login successful!";
    window.location.href = "index.html";
  }
};
