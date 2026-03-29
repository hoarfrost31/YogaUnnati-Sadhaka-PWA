const MEMBERSHIP_PLAN_LABELS = {
  none: "None",
  app: "YogaUnnati App",
  online: "YogaUnnati Online",
  studio: "YogaUnnati Studio",
};

const MEMBERSHIP_STATUS_LABELS = {
  inactive: "Inactive",
  pending: "Pending Review",
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

function membershipDaysLeftLabel(membership) {
  if (membership.status === "pending") {
    return "Checkout started. Confirmation pending.";
  }

  if (membership.status !== "active") {
    return "No active membership yet.";
  }

  let end = membership.currentPeriodEnd ? new Date(membership.currentPeriodEnd) : null;
  if (!end || Number.isNaN(end.getTime())) {
    const start = membership.startedAt ? new Date(membership.startedAt) : null;
    if (start && !Number.isNaN(start.getTime())) {
      end = new Date(start.getTime() + (30 * 24 * 60 * 60 * 1000));
    }
  }

  if (!end || Number.isNaN(end.getTime())) {
    return "Active membership";
  }

  const now = new Date();
  const msPerDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / msPerDay));
  const unit = diffDays === 1 ? "day" : "days";
  return `${diffDays} ${unit} left`;
}
function membershipStatusCopy(membership) {
  if (membership.status === "pending") {
    return `Your ${membershipPlanLabel(membership.planCode)} checkout is in progress or awaiting confirmation.`;
  }

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

/* legacy renewal helper retained for other statuses */
function membershipRenewalLabel(membership) {
  if (membership.status === "pending") {
    return "Awaiting payment confirmation";
  }

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
  if (membership.status === "pending") {
    return "Monthly checkout started";
  }

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
  const hasLockedMembership = ["active", "pending"].includes(membership.status) && membership.planCode !== "none";

  planCards.forEach((card) => {
    const planCode = card.getAttribute("data-membership-plan");
    const button = card.querySelector("[data-membership-plan-button]");
    const isCurrent = membership.status === "active" && membership.planCode === planCode;
    const isPending = membership.status === "pending" && membership.planCode === planCode;
    const isLockedOtherPlan = hasLockedMembership && membership.planCode !== planCode;

    card.classList.toggle("is-current-plan", isCurrent);
    card.classList.toggle("is-pending-plan", isPending);

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

    if (isPending) {
      button.textContent = "Checkout Started";
      button.disabled = true;
      button.classList.remove("primary-btn");
      button.classList.add("secondary-btn");
      return;
    }

    if (isLockedOtherPlan) {
      button.textContent = button.getAttribute("data-default-label") || "Select";
      button.disabled = true;
      button.classList.remove("primary-btn");
      button.classList.add("secondary-btn");
      return;
    }

    button.textContent = membershipPageBusy ? "Loading..." : (button.getAttribute("data-default-label") || "Continue to Payment");
    button.disabled = membershipPageBusy || !membershipPageUserId;
    button.classList.toggle("primary-btn", defaultVariant === "primary");
    button.classList.toggle("secondary-btn", defaultVariant !== "primary");
  });
}

function renderMembershipSummary(membership) {
  const currentPlanHeading = document.getElementById("membershipCurrentPlan");
  const statusPill = document.getElementById("membershipStatusPill");
  const daysLabel = document.getElementById("membershipStatusDays");

  if (currentPlanHeading) {
    currentPlanHeading.textContent = membership.planCode === "none"
      ? "No active plan"
      : membershipPlanLabel(membership.planCode);
  }

  if (statusPill) {
    statusPill.textContent = membershipStatusLabel(membership.status);
    statusPill.className = `membership-status-pill is-${membership.status}`;
  }

  if (daysLabel) {
    daysLabel.textContent = membershipDaysLeftLabel(membership);
  }

  updateMembershipPlanCards(membership);
}
function bindMembershipPlanButtons() {
  document.querySelectorAll("[data-membership-plan-button]").forEach((button) => {
    button.addEventListener("click", () => {
      if (membershipPageBusy || !membershipPageUserId) {
        return;
      }

      const planCard = button.closest("[data-membership-plan]");
      const planCode = planCard?.getAttribute("data-membership-plan") || "none";
      if (planCode === "none") {
        return;
      }

      window.appAnalytics?.track?.("membership_payment_started", { provider: 'cashfree', plan_code: planCode });
      window.location.href = `payment.html?plan=${encodeURIComponent(planCode)}`;
    });
  });
}

function bindMembershipPlanToggles() {
  document.querySelectorAll("[data-membership-plan-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest("[data-membership-plan]");
      const features = card?.querySelector("[data-membership-plan-features]");
      if (!features) {
        return;
      }

      const nextExpanded = features.hasAttribute("hidden");
      if (nextExpanded) {
        features.removeAttribute("hidden");
      } else {
        features.setAttribute("hidden", "hidden");
      }

      card?.classList.toggle("is-expanded", nextExpanded);
      button.setAttribute("aria-expanded", nextExpanded ? "true" : "false");
      button.textContent = nextExpanded ? "Hide key features" : "View key features";
    });
  });
}

async function initMembershipPage() {
  if (!window.appAuth?.getCurrentUser || !window.membershipData) {
    return;
  }

  bindMembershipPlanButtons();
  bindMembershipPlanToggles();

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
  } finally {
    setMembershipBusyState(false);
    renderMembershipSummary(window.membershipData.readMembershipCache(membershipPageUserId));
  }
}

initMembershipPage().catch((error) => {
  console.error("Membership page init error:", error);
});

