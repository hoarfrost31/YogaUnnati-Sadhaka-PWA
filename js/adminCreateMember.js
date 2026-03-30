const adminCreateDisplayNameEl = document.getElementById("adminCreateDisplayName");
const adminCreateEmailEl = document.getElementById("adminCreateEmail");
const adminCreatePasswordEl = document.getElementById("adminCreatePassword");
const adminCreateMembershipPlanEl = document.getElementById("adminCreateMembershipPlan");
const adminCreateMemberBtnEl = document.getElementById("adminCreateMemberBtn");
const adminCreateMemberMsgEl = document.getElementById("adminCreateMemberMsg");
const BILLING_PERIOD_DAYS = 30;

function setAdminCreateMessage(text) {
  adminCreateMemberMsgEl.textContent = text;
}

function addBillingDays(baseDate, days = BILLING_PERIOD_DAYS) {
  const date = new Date(baseDate);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Date(date.getTime() + (days * 24 * 60 * 60 * 1000));
}

function getNextMonthlyRenewalIso(baseDate = new Date()) {
  const nextDate = addBillingDays(baseDate);
  return nextDate ? nextDate.toISOString() : null;
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

async function insertMembershipCycleRecord(userId, membershipPayload) {
  if (!membershipPayload?.started_at || !membershipPayload?.current_period_end || membershipPayload?.plan_code === "none") {
    return;
  }

  const { error } = await window.supabaseClient
    .from("membership_cycles")
    .insert({
      user_id: userId,
      plan_code: membershipPayload.plan_code,
      status: membershipPayload.status,
      period_start: membershipPayload.started_at,
      period_end: membershipPayload.current_period_end,
      source: "admin",
      note: "Initial membership assigned from admin create member",
    });

  if (error && error.code !== "42P01") {
    throw error;
  }
}

async function assignMembershipToUser(userId, planCode) {
  const normalizedPlan = String(planCode || "none").trim().toLowerCase();
  const startedAt = normalizedPlan === "none" ? null : new Date().toISOString();
  const payload = {
    user_id: userId,
    plan_code: normalizedPlan,
    status: normalizedPlan === "none" ? "inactive" : "active",
    billing_cycle: "monthly",
    started_at: startedAt,
    current_period_end: normalizedPlan === "none" ? null : getNextMonthlyRenewalIso(startedAt),
    cancel_at_period_end: false,
  };

  const { error } = await window.supabaseClient
    .from("memberships")
    .upsert(payload, { onConflict: "user_id" });

  if (error) {
    throw error;
  }

  if (normalizedPlan !== "none") {
    await insertMembershipCycleRecord(userId, payload);
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
