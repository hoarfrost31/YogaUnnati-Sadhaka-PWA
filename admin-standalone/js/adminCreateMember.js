const adminCreateDisplayNameEl = document.getElementById("adminCreateDisplayName");
const adminCreateEmailEl = document.getElementById("adminCreateEmail");
const adminCreatePasswordEl = document.getElementById("adminCreatePassword");
const adminCreatePhoneEl = document.getElementById("adminCreatePhone");
const adminCreateMembershipPlanEl = document.getElementById("adminCreateMembershipPlan");
const adminCreateMemberBtnEl = document.getElementById("adminCreateMemberBtn");
const adminCreateMemberMsgEl = document.getElementById("adminCreateMemberMsg");
const ADMIN_CREATE_MEMBER_URL = 'https://vercel-api-hoarfrost31s-projects.vercel.app/api/admin-create-member';

function setAdminCreateMessage(text) {
  adminCreateMemberMsgEl.textContent = text;
}

function normalizeIndianPhone(input) {
  const digits = String(input || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  return "";
}

async function getAdminAccessToken() {
  const { data } = await window.supabaseClient.auth.getSession();
  return data?.session?.access_token || '';
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
  const phone = normalizeIndianPhone(adminCreatePhoneEl?.value || "");
  const membershipPlan = adminCreateMembershipPlanEl.value;

  if (!email || !password) {
    setAdminCreateMessage("Enter email and password.");
    return;
  }

  if (password.length < 6) {
    setAdminCreateMessage("Password must be at least 6 characters.");
    return;
  }

  if (adminCreatePhoneEl && !phone) {
    setAdminCreateMessage("Enter a valid 10-digit mobile number.");
    return;
  }

  adminCreateMemberBtnEl.disabled = true;
  setAdminCreateMessage("Creating member...");

  try {
    const accessToken = await getAdminAccessToken();
    if (!accessToken) {
      throw new Error("Admin session missing. Please sign in again.");
    }

    const response = await fetch(ADMIN_CREATE_MEMBER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        display_name: displayName,
        email,
        password,
        phone,
        membership_plan: membershipPlan,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error || 'Could not create member.');
    }

    window.appAnalytics?.track("create_member_admin", {
      has_display_name: Boolean(displayName),
      membership_plan: membershipPlan,
    });

    const membershipMessage = membershipPlan === "none"
      ? "No starting membership assigned."
      : `${membershipPlan} membership assigned.`;

    setAdminCreateMessage(`Member account created. ${membershipMessage}`);
    adminCreateDisplayNameEl.value = "";
    adminCreateEmailEl.value = "";
    adminCreatePasswordEl.value = "";
    if (adminCreatePhoneEl) {
      adminCreatePhoneEl.value = "";
    }
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
