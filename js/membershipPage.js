const MEMBERSHIP_PLAN_LABELS = {
  none: "None",
  app: "YogaUnnati App",
  online: "YogaUnnati Online",
  studio: "YogaUnnati Studio",
};

const MEMBERSHIP_STATUS_LABELS = {
  inactive: "Inactive",
  active: "Active",
  past_due: "Payment Due",
  cancelled: "Cancelled",
  expired: "Expired",
};

let membershipPageUserId = "";
let membershipPageBusy = false;

function membershipPlanLabel(planCode) {
  return MEMBERSHIP_PLAN_LABELS[planCode] || MEMBERSHIP_PLAN_LABELS.none;
}

function membershipStatusLabel(status) {
  return MEMBERSHIP_STATUS_LABELS[status] || MEMBERSHIP_STATUS_LABELS.inactive;
}

function formatMembershipDate(dateValue, fallback = "Not started") {
  if (!dateValue) {
    return fallback;
  }

  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  return parsed.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function membershipStatusCopy(membership) {
  if (membership.status === "active") {
    if (membership.cancelAtPeriodEnd) {
      return `${membershipPlanLabel(membership.planCode)} stays active until the end of the current billing cycle.`;
    }

    return `${membershipPlanLabel(membership.planCode)} is active and ready for your next practice cycle.`;
  }

  if (membership.status === "past_due") {
    return `Your ${membershipPlanLabel(membership.planCode)} membership needs attention before the next renewal.`;
  }

  if (membership.status === "cancelled") {
    return `Your ${membershipPlanLabel(membership.planCode)} membership has been cancelled.`;
  }

  if (membership.status === "expired") {
    return `Your previous membership has expired. Choose a plan below whenever you are ready.`;
  }

  return "Choose a plan below to begin your membership journey.";
}

function membershipRenewalLabel(membership) {
  if (membership.status === "active" && membership.currentPeriodEnd) {
    return membership.cancelAtPeriodEnd
      ? `Ends ${formatMembershipDate(membership.currentPeriodEnd)}`
      : formatMembershipDate(membership.currentPeriodEnd, "Choose a plan");
  }

  if (membership.status === "past_due" && membership.currentPeriodEnd) {
    return `Was due ${formatMembershipDate(membership.currentPeriodEnd)}`;
  }

  if (membership.status === "cancelled" && membership.currentPeriodEnd) {
    return `Ends ${formatMembershipDate(membership.currentPeriodEnd)}`;
  }

  return "Choose a plan";
}

function membershipBillingLabel(membership) {
  if (membership.status === "inactive" || membership.planCode === "none") {
    return "Not started";
  }

  return membership.billingCycle === "monthly" ? "Monthly" : membership.billingCycle;
}

function setMembershipBusyState(isBusy) {
  membershipPageBusy = Boolean(isBusy);
}

function updateMembershipPlanCards(membership) {
  const planCards = document.querySelectorAll("[data-membership-plan]");
  planCards.forEach((card) => {
    const planCode = card.getAttribute("data-membership-plan");
    const button = card.querySelector("[data-membership-plan-button]");
    const isCurrent = membership.status === "active" && membership.planCode === planCode;

    card.classList.toggle("is-current-plan", isCurrent);

    if (!button) {
      return;
    }

    const defaultVariant = button.getAttribute("data-default-variant") || "secondary";

    if (isCurrent) {
      button.textContent = membershipPageBusy ? "Updating..." : "Current Plan";
      button.disabled = true;
      button.classList.remove("secondary-btn");
      button.classList.add("primary-btn");
      return;
    }

    button.textContent = membershipPageBusy ? "Updating..." : (button.getAttribute("data-default-label") || "Choose Plan");
    button.disabled = membershipPageBusy || !membershipPageUserId;
    button.classList.toggle("primary-btn", defaultVariant === "primary");
    button.classList.toggle("secondary-btn", defaultVariant !== "primary");
  });
}

function renderMembershipSummary(membership) {
  const currentPlanHeading = document.getElementById("membershipCurrentPlan");
  const statusCopy = document.getElementById("membershipStatusCopy");
  const statusPill = document.getElementById("membershipStatusPill");
  const currentPlanLabel = document.getElementById("membershipCurrentPlanLabel");
  const billingLabel = document.getElementById("membershipBillingLabel");
  const startDateLabel = document.getElementById("membershipStartDateLabel");
  const renewalLabel = document.getElementById("membershipRenewalLabel");

  if (currentPlanHeading) {
    currentPlanHeading.textContent = membership.planCode === "none"
      ? "No active plan"
      : membershipPlanLabel(membership.planCode);
  }

  if (statusCopy) {
    statusCopy.textContent = membershipStatusCopy(membership);
  }

  if (statusPill) {
    statusPill.textContent = membershipStatusLabel(membership.status);
    statusPill.className = `membership-status-pill is-${membership.status}`;
  }

  if (currentPlanLabel) {
    currentPlanLabel.textContent = membershipPlanLabel(membership.planCode);
  }

  if (billingLabel) {
    billingLabel.textContent = membershipBillingLabel(membership);
  }

  if (startDateLabel) {
    startDateLabel.textContent = formatMembershipDate(membership.startedAt, "Not started");
  }

  if (renewalLabel) {
    renewalLabel.textContent = membershipRenewalLabel(membership);
  }

  updateMembershipPlanCards(membership);
}

function bindMembershipPlanButtons() {
  document.querySelectorAll("[data-membership-plan-button]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (membershipPageBusy || !membershipPageUserId || !window.membershipData?.activateMembershipPlan) {
        return;
      }

      const planCard = button.closest("[data-membership-plan]");
      const planCode = planCard?.getAttribute("data-membership-plan") || "none";
      const cachedMembership = window.membershipData.readMembershipCache(membershipPageUserId);
      const optimisticMembership = {
        ...cachedMembership,
        planCode,
        status: planCode === "none" ? "inactive" : "active",
        billingCycle: "monthly",
        startedAt: planCode === "none" ? "" : new Date().toISOString(),
        currentPeriodEnd: planCode === "none" ? "" : new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString(),
        cancelAtPeriodEnd: false,
      };

      setMembershipBusyState(true);
      renderMembershipSummary(optimisticMembership);

      try {
        const membership = await window.membershipData.activateMembershipPlan(membershipPageUserId, planCode);
        renderMembershipSummary(membership);
        window.appAnalytics?.track?.("membership_plan_selected", { plan_code: planCode });
      } catch (error) {
        console.error("Membership plan update error:", error);
        renderMembershipSummary(cachedMembership);
      } finally {
        setMembershipBusyState(false);
        renderMembershipSummary(window.membershipData.readMembershipCache(membershipPageUserId));
      }
    });
  });
}

async function initMembershipPage() {
  if (!window.appAuth?.getCurrentUser || !window.membershipData) {
    return;
  }

  bindMembershipPlanButtons();

  const user = await window.appAuth.getCurrentUser();
  membershipPageUserId = user?.id || "";

  if (!membershipPageUserId) {
    renderMembershipSummary(window.membershipData.DEFAULT_MEMBERSHIP);
    return;
  }

  const cachedMembership = window.membershipData.readMembershipCache(membershipPageUserId);
  renderMembershipSummary(cachedMembership);

  try {
    const membership = await window.membershipData.ensureCurrentUserMembership(membershipPageUserId);
    renderMembershipSummary(membership);
  } catch (error) {
    console.error("Membership load error:", error);
  }
}

initMembershipPage().catch((error) => {
  console.error("Membership page init error:", error);
});
