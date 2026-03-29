const MEMBERSHIP_CACHE_PREFIX = "membership_cache_v1:";
const DEFAULT_MEMBERSHIP = Object.freeze({
  planCode: "none",
  status: "inactive",
  billingCycle: "monthly",
  startedAt: "",
  currentPeriodEnd: "",
  cancelAtPeriodEnd: false,
  providerCustomerId: "",
  providerSubscriptionId: "",
});

function getMembershipCacheKey(userId) {
  return `${MEMBERSHIP_CACHE_PREFIX}${userId}`;
}

function normalizePlanCode(planCode = "") {
  const safePlanCode = String(planCode || "").trim().toLowerCase();
  return ["app", "online", "studio"].includes(safePlanCode) ? safePlanCode : "none";
}

function normalizeStatus(status = "") {
  const safeStatus = String(status || "").trim().toLowerCase();
  return ["inactive", "active", "past_due", "cancelled", "expired"].includes(safeStatus)
    ? safeStatus
    : "inactive";
}

function normalizeMembershipData(membership = {}) {
  return {
    planCode: normalizePlanCode(membership.planCode || membership.plan_code),
    status: normalizeStatus(membership.status),
    billingCycle: String(membership.billingCycle || membership.billing_cycle || "monthly").trim().toLowerCase() || "monthly",
    startedAt: membership.startedAt || membership.started_at || "",
    currentPeriodEnd: membership.currentPeriodEnd || membership.current_period_end || "",
    cancelAtPeriodEnd: Boolean(membership.cancelAtPeriodEnd ?? membership.cancel_at_period_end),
    providerCustomerId: String(membership.providerCustomerId || membership.provider_customer_id || "").trim(),
    providerSubscriptionId: String(membership.providerSubscriptionId || membership.provider_subscription_id || "").trim(),
  };
}

function readMembershipCache(userId) {
  if (!userId) {
    return { ...DEFAULT_MEMBERSHIP };
  }

  try {
    const raw = localStorage.getItem(getMembershipCacheKey(userId));
    if (!raw) {
      return { ...DEFAULT_MEMBERSHIP };
    }

    return normalizeMembershipData(JSON.parse(raw));
  } catch (error) {
    console.error("Membership cache read error:", error);
    return { ...DEFAULT_MEMBERSHIP };
  }
}

function writeMembershipCache(userId, membership) {
  if (!userId) {
    return;
  }

  try {
    localStorage.setItem(
      getMembershipCacheKey(userId),
      JSON.stringify(normalizeMembershipData(membership)),
    );
  } catch (error) {
    console.error("Membership cache write error:", error);
  }
}

function isMembershipsTableMissing(error) {
  return error?.code === "42P01";
}

async function fetchMembershipRow(userId) {
  const { data, error } = await window.supabaseClient
    .from("memberships")
    .select("user_id, plan_code, status, billing_cycle, started_at, current_period_end, cancel_at_period_end, provider_customer_id, provider_subscription_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function ensureCurrentUserMembership(userId) {
  if (!userId) {
    return { ...DEFAULT_MEMBERSHIP };
  }

  try {
    const existingRow = await fetchMembershipRow(userId);
    if (existingRow) {
      const membership = normalizeMembershipData(existingRow);
      writeMembershipCache(userId, membership);
      if (typeof window.markRemoteRefresh === "function") {
        window.markRemoteRefresh("membership", userId);
      }
      return membership;
    }

    const inactiveMembership = {
      user_id: userId,
      plan_code: "none",
      status: "inactive",
      billing_cycle: "monthly",
      started_at: null,
      current_period_end: null,
      cancel_at_period_end: false,
    };

    const { error: upsertError } = await window.supabaseClient
      .from("memberships")
      .upsert(inactiveMembership, { onConflict: "user_id" });

    if (upsertError) {
      throw upsertError;
    }

    const createdRow = await fetchMembershipRow(userId);
    const membership = createdRow ? normalizeMembershipData(createdRow) : { ...DEFAULT_MEMBERSHIP };
    writeMembershipCache(userId, membership);
    if (typeof window.markRemoteRefresh === "function") {
      window.markRemoteRefresh("membership", userId);
    }
    return membership;
  } catch (error) {
    if (isMembershipsTableMissing(error)) {
      const fallbackMembership = { ...DEFAULT_MEMBERSHIP };
      writeMembershipCache(userId, fallbackMembership);
      return fallbackMembership;
    }

    throw error;
  }
}

async function refreshCurrentUserMembership(userId) {
  if (!userId) {
    return { ...DEFAULT_MEMBERSHIP };
  }

  try {
    const row = await fetchMembershipRow(userId);
    const membership = row ? normalizeMembershipData(row) : { ...DEFAULT_MEMBERSHIP };
    writeMembershipCache(userId, membership);
    if (typeof window.markRemoteRefresh === "function") {
      window.markRemoteRefresh("membership", userId);
    }
    return membership;
  } catch (error) {
    if (isMembershipsTableMissing(error)) {
      const fallbackMembership = { ...DEFAULT_MEMBERSHIP };
      writeMembershipCache(userId, fallbackMembership);
      return fallbackMembership;
    }

    throw error;
  }
}

function getCurrentIso() {
  return new Date().toISOString();
}

function getNextMonthlyRenewalIso() {
  const nextDate = new Date();
  nextDate.setMonth(nextDate.getMonth() + 1);
  return nextDate.toISOString();
}

async function saveCurrentUserMembership(userId, membership) {
  if (!userId) {
    return { ...DEFAULT_MEMBERSHIP };
  }

  const cleanMembership = normalizeMembershipData(membership);
  const payload = {
    user_id: userId,
    plan_code: cleanMembership.planCode,
    status: cleanMembership.status,
    billing_cycle: cleanMembership.billingCycle || "monthly",
    started_at: cleanMembership.startedAt || null,
    current_period_end: cleanMembership.currentPeriodEnd || null,
    cancel_at_period_end: cleanMembership.cancelAtPeriodEnd,
    provider_customer_id: cleanMembership.providerCustomerId || null,
    provider_subscription_id: cleanMembership.providerSubscriptionId || null,
  };

  try {
    const { error } = await window.supabaseClient
      .from("memberships")
      .upsert(payload, { onConflict: "user_id" });

    if (error) {
      throw error;
    }

    const refreshedMembership = await refreshCurrentUserMembership(userId);
    return refreshedMembership;
  } catch (error) {
    if (isMembershipsTableMissing(error)) {
      writeMembershipCache(userId, cleanMembership);
      return cleanMembership;
    }

    throw error;
  }
}

async function activateMembershipPlan(userId, planCode) {
  const normalizedPlanCode = normalizePlanCode(planCode);
  const nextMembership = {
    planCode: normalizedPlanCode,
    status: normalizedPlanCode === "none" ? "inactive" : "active",
    billingCycle: "monthly",
    startedAt: normalizedPlanCode === "none" ? "" : getCurrentIso(),
    currentPeriodEnd: normalizedPlanCode === "none" ? "" : getNextMonthlyRenewalIso(),
    cancelAtPeriodEnd: false,
    providerCustomerId: "",
    providerSubscriptionId: "",
  };

  return saveCurrentUserMembership(userId, nextMembership);
}

window.membershipData = {
  DEFAULT_MEMBERSHIP: { ...DEFAULT_MEMBERSHIP },
  normalizeMembershipData,
  readMembershipCache,
  writeMembershipCache,
  ensureCurrentUserMembership,
  refreshCurrentUserMembership,
  saveCurrentUserMembership,
  activateMembershipPlan,
};
