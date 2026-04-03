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

function membershipPaymentStatus(membership) {
  if (membership.status === "pending") {
    return {
      label: "Checkout started. Confirmation pending.",
      tone: "amber",
    };
  }

  if (!["active", "past_due"].includes(membership.status)) {
    return {
      label: "Choose a membership whenever you are ready.",
      tone: "neutral",
    };
  }

  let end = membership.currentPeriodEnd ? new Date(membership.currentPeriodEnd) : null;
  if (!end || Number.isNaN(end.getTime())) {
    const start = membership.startedAt ? new Date(membership.startedAt) : null;
    if (start && !Number.isNaN(start.getTime())) {
      end = new Date(start.getTime() + (30 * 24 * 60 * 60 * 1000));
    }
  }

  if (!end || Number.isNaN(end.getTime())) {
    return {
      label: membership.status === "past_due" ? "Payment overdue" : "Next payment date unavailable",
      tone: membership.status === "past_due" ? "red" : "neutral",
    };
  }

  const diffDays = Math.ceil((end.getTime() - Date.now()) / (24 * 60 * 60 * 1000));

  if (diffDays < 0 || membership.status === "past_due") {
    return {
      label: "Payment overdue",
      tone: "red",
    };
  }

  if (diffDays === 0) {
    return {
      label: "Payment due today",
      tone: "red",
    };
  }

  if (diffDays === 1) {
    return {
      label: "Due tomorrow",
      tone: "orange",
    };
  }

  if (diffDays === 2) {
    return {
      label: "Due in 2 days",
      tone: "amber",
    };
  }

  return {
    label: `Due in ${diffDays} days`,
    tone: diffDays >= 3 ? "green" : "amber",
  };
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

function membershipIsWithinRenewalWindow(membership) {
  if (!["active", "past_due"].includes(membership.status) || membership.planCode === "none") {
    return false;
  }

  const end = membership.currentPeriodEnd ? new Date(membership.currentPeriodEnd) : null;
  if (!end || Number.isNaN(end.getTime())) {
    return false;
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.ceil((end.getTime() - Date.now()) / msPerDay);
  return diffDays <= 3;
}

function setMembershipBusyState(isBusy) {
  membershipPageBusy = Boolean(isBusy);
}

function reorderMembershipPlanCards(membership) {
  const planGrid = document.querySelector(".pricing-plan-grid");
  if (!planGrid) {
    return;
  }

  const cards = Array.from(planGrid.querySelectorAll("[data-membership-plan]"));
  if (!cards.length) {
    return;
  }

  const defaultOrder = {
    studio: 0,
    app: 1,
    online: 2,
  };

  cards
    .sort((left, right) => {
      const leftPlan = left.getAttribute("data-membership-plan") || "";
      const rightPlan = right.getAttribute("data-membership-plan") || "";
      const leftPriority = membership.planCode !== "none" && membership.planCode === leftPlan ? -1 : (defaultOrder[leftPlan] ?? 99);
      const rightPriority = membership.planCode !== "none" && membership.planCode === rightPlan ? -1 : (defaultOrder[rightPlan] ?? 99);
      return leftPriority - rightPriority;
    })
    .forEach((card) => planGrid.appendChild(card));
}

function updateMembershipPlanCards(membership) {
  reorderMembershipPlanCards(membership);

  const planCards = document.querySelectorAll("[data-membership-plan]");
  const renewalWindowOpen = membershipIsWithinRenewalWindow(membership);
  const hasLockedMembership = membership.status === "pending" || ((["active", "past_due"].includes(membership.status)) && membership.planCode !== "none" && !renewalWindowOpen);

  planCards.forEach((card) => {
    const planCode = card.getAttribute("data-membership-plan");
    const button = card.querySelector("[data-membership-plan-button]");
    const isCurrent = ["active", "past_due"].includes(membership.status) && membership.planCode === planCode;
    const isPending = membership.status === "pending" && membership.planCode === planCode;
    const isRenewableCurrent = isCurrent && renewalWindowOpen;
    const isLockedOtherPlan = hasLockedMembership && membership.planCode !== planCode;

    card.classList.toggle("is-current-plan", isCurrent);
    card.classList.toggle("is-pending-plan", isPending);

    const statusWrap = card.querySelector("[data-membership-plan-status]");
    const statusCopy = card.querySelector("[data-membership-plan-status-copy]");
    const topBadge = card.querySelector("[data-membership-plan-badge]");
    const shouldShowStatus = isCurrent || isPending;

    statusWrap?.classList.toggle("hidden", !shouldShowStatus);
    if (statusWrap) {
      statusWrap.hidden = !shouldShowStatus;
    }

    if (statusCopy) {
      const paymentStatus = membershipPaymentStatus(membership);
      statusCopy.textContent = paymentStatus.label;
      statusCopy.className = `membership-plan-status-copy is-${paymentStatus.tone}`;
    }

    if (topBadge) {
      const defaultBadge = topBadge.getAttribute("data-default-badge") || "";
      const isInactiveCard = !isCurrent && !isPending;
      const showBadge = (membership.status === "active" && isCurrent) || (isInactiveCard && Boolean(defaultBadge));
      topBadge.classList.toggle("hidden", !showBadge);
      topBadge.hidden = !showBadge;
      if (showBadge) {
        if (membership.status === "active" && isCurrent) {
          topBadge.textContent = "Active";
          topBadge.className = "pricing-badge is-active";
        } else {
          topBadge.textContent = defaultBadge;
          topBadge.className = "pricing-badge is-plan-tag";
        }
      }
    }

    if (!button) {
      return;
    }

    const defaultVariant = button.getAttribute("data-default-variant") || "secondary";

    if (planCode === "online") {
      button.textContent = "Coming Soon";
      button.disabled = true;
      button.classList.remove("primary-btn", "is-change-plan");
      button.classList.add("secondary-btn", "is-coming-soon");
      return;
    }

    if (isCurrent) {
      button.textContent = membershipPageBusy
        ? "Updating..."
        : (isRenewableCurrent ? "Make Payment" : "Current Plan");
      button.disabled = membershipPageBusy || !membershipPageUserId || !isRenewableCurrent;
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

    const canChangePlanDuringRenewal = renewalWindowOpen && membership.planCode !== "none" && membership.planCode !== planCode;
    button.textContent = membershipPageBusy
      ? "Loading..."
      : (canChangePlanDuringRenewal ? (planCode === "app" ? "Switch to App Plan" : "Change Plan") : (button.getAttribute("data-default-label") || "Make Payment"));
    button.disabled = membershipPageBusy || !membershipPageUserId;
    button.classList.toggle("primary-btn", !canChangePlanDuringRenewal && defaultVariant === "primary");
    button.classList.toggle("secondary-btn", canChangePlanDuringRenewal || defaultVariant !== "primary");
    button.classList.toggle("is-change-plan", canChangePlanDuringRenewal);
    button.classList.remove("is-coming-soon");
  });
}

function renderMembershipSummary(membership) {
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
















