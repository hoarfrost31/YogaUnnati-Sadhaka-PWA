const adminCreateDisplayNameEl = document.getElementById("adminCreateDisplayName");
const adminCreateEmailEl = document.getElementById("adminCreateEmail");
const adminCreatePasswordEl = document.getElementById("adminCreatePassword");
const adminCreateMembershipPlanEl = document.getElementById("adminCreateMembershipPlan");
const adminCreateMemberBtnEl = document.getElementById("adminCreateMemberBtn");
const adminCreateMemberMsgEl = document.getElementById("adminCreateMemberMsg");

function setAdminCreateMessage(text) {
  adminCreateMemberMsgEl.textContent = text;
}

function getNextMonthlyRenewalIso() {
  const nextDate = new Date();
  nextDate.setMonth(nextDate.getMonth() + 1);
  return nextDate.toISOString();
}

async function ensureProfileRow(userId, displayName) {
  const payload = {
    id: userId,
    display_name: displayName || "Yoga Member",
    avatar_url: null,
  };

  const { error } = await window.supabaseClient
    .from("profiles")
    .upsert(payload, { onConflict: "id" });

  if (error) {
    throw error;
  }
}

async function assignMembershipToUser(userId, planCode) {
  const normalizedPlan = String(planCode || "none").trim().toLowerCase();
  const payload = {
    user_id: userId,
    plan_code: normalizedPlan,
    status: normalizedPlan === "none" ? "inactive" : "active",
    billing_cycle: "monthly",
    started_at: normalizedPlan === "none" ? null : new Date().toISOString(),
    current_period_end: normalizedPlan === "none" ? null : getNextMonthlyRenewalIso(),
    cancel_at_period_end: false,
  };

  const { error } = await window.supabaseClient
    .from("memberships")
    .upsert(payload, { onConflict: "user_id" });

  if (error) {
    throw error;
  }
}

async function initAdminCreateMemberPage() {
  const adminUser = await window.adminAccess.requireAdminAccess();
  if (!adminUser) {
    return;
  }

  window.appAnalytics?.identify(adminUser.id);
}

adminCreateMemberBtnEl.addEventListener("click", async () => {
  const displayName = adminCreateDisplayNameEl.value.trim();
  const email = adminCreateEmailEl.value.trim();
  const password = adminCreatePasswordEl.value;
  const membershipPlan = adminCreateMembershipPlanEl.value;

  if (!email || !password) {
    setAdminCreateMessage("Enter email and password.");
    return;
  }

  if (password.length < 6) {
    setAdminCreateMessage("Password must be at least 6 characters.");
    return;
  }

  adminCreateMemberBtnEl.disabled = true;
  setAdminCreateMessage("Creating member...");

  try {
    const { data, error } = await window.supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
        },
      },
    });

    if (error) {
      setAdminCreateMessage(error.message);
      return;
    }

    if (data?.user?.id) {
      await ensureProfileRow(data.user.id, displayName || email.split("@")[0] || "Yoga Member");
      await assignMembershipToUser(data.user.id, membershipPlan);
    }

    window.appAnalytics?.track("create_member_admin", {
      has_display_name: Boolean(displayName),
      membership_plan: membershipPlan,
    });

    const membershipMessage = membershipPlan === "none"
      ? "No starting membership assigned."
      : `${membershipPlan} membership assigned.`;

    setAdminCreateMessage(`Member account created. ${membershipMessage} Sign back in as admin if your session changed.`);
    adminCreateDisplayNameEl.value = "";
    adminCreateEmailEl.value = "";
    adminCreatePasswordEl.value = "";
    adminCreateMembershipPlanEl.value = "none";
  } catch (error) {
    console.error(error);
    setAdminCreateMessage(error.message || "Could not create member.");
  } finally {
    adminCreateMemberBtnEl.disabled = false;
  }
});

initAdminCreateMemberPage().catch((error) => {
  console.error(error);
  setAdminCreateMessage("Could not open member creation.");
});
