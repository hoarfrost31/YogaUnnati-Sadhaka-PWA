const PAYMENT_PLANS = {
  app: {
    eyebrow: 'App Only',
    name: 'YogaUnnati App',
    amountDisplay: '\u20B9199',
    amountValue: 199,
    copy: 'The digital-only membership for members who want tracking, milestones, and app continuity.',
    hero: 'Your app-only membership will continue through a secure monthly Cashfree checkout.',
    benefits: [
      'Daily progress tracking',
      'Milestone progression',
      'Community access inside the app',
    ],
  },
  online: {
    eyebrow: 'Online Guided + App',
    name: 'YogaUnnati Online',
    amountDisplay: '\u20B9499',
    amountValue: 499,
    copy: 'The remote guided membership with app support for members who practice from anywhere.',
    hero: 'Your online guided membership will continue through a secure monthly Cashfree checkout.',
    benefits: [
      'Online guided sessions',
      'App milestones and tracking',
      'Consistent guided practice rhythm',
    ],
  },
  studio: {
    eyebrow: 'Studio + App',
    name: 'YogaUnnati Studio',
    amountDisplay: '\u20B91099',
    amountValue: 1099,
    copy: 'The complete studio membership with guided group practice, teacher corrections, and app support.',
    hero: 'Your full studio membership will continue through a secure monthly Cashfree checkout.',
    benefits: [
      'Daily guided group practice',
      'Teacher corrections',
      'Powerful hatha yoga learning with app tracking',
    ],
  },
};

function getSelectedPaymentPlan() {
  const plan = new URLSearchParams(window.location.search).get('plan') || 'studio';
  return PAYMENT_PLANS[plan] ? plan : 'studio';
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function setPaymentBusy(isBusy, buttonLabel) {
  const button = document.getElementById('paymentPrimaryBtn');
  const pill = document.getElementById('paymentStatusPill');
  if (button) {
    button.disabled = Boolean(isBusy);
    button.textContent = buttonLabel || 'Continue to Secure Payment';
  }
  if (pill) {
    pill.textContent = isBusy ? 'Preparing' : 'Ready';
  }
}

function setPaymentMessage(text, isError) {
  const messageEl = document.getElementById('paymentFormMessage');
  if (!messageEl) {
    return;
  }

  messageEl.textContent = text || '';
  messageEl.style.color = isError ? 'var(--danger-text)' : 'var(--text-soft)';
}

function renderPaymentBenefits(planCode) {
  const wrap = document.getElementById('paymentBenefitList');
  if (!wrap) {
    return;
  }

  wrap.innerHTML = PAYMENT_PLANS[planCode].benefits.map((benefit, index) => `
    <div class="payment-benefit-item">
      <span class="pricing-feature-icon">${index + 1}</span>
      <strong>${benefit}</strong>
    </div>
  `).join('');
}

async function getAccessToken() {
  const { data } = await window.supabaseClient.auth.getSession();
  return data?.session?.access_token || '';
}

function getFunctionsBaseUrl() {
  const projectUrl = String(window.supabaseClient?.supabaseUrl || '').replace(/\/+$/, '');
  return projectUrl ? `${projectUrl}/functions/v1` : '';
}

function getCashfreeMode(mode) {
  return String(mode || '').toLowerCase() === 'production' ? 'production' : 'sandbox';
}

async function startCheckout(planCode) {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error('Please log in again before starting payment.');
  }

  const baseUrl = getFunctionsBaseUrl();
  if (!baseUrl) {
    throw new Error('Payment service URL is not configured.');
  }

  const response = await fetch(`${baseUrl}/create-cashfree-membership-subscription-v2`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      plan_code: planCode,
      return_url: `${window.location.origin}/membership.html?payment=success`,
      cancel_url: `${window.location.origin}/payment.html?plan=${encodeURIComponent(planCode)}&payment=cancelled`,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || 'Could not start secure payment.');
  }

  return payload;
}

async function openCashfreeCheckout(planCode) {
  const payload = await startCheckout(planCode);
  const subsSessionId = payload?.subscription_session_id || '';
  const subscriptionId = payload?.subscription_id || '';
  if (!subsSessionId || !subscriptionId) {
    throw new Error('Cashfree did not return a subscription session.');
  }

  if (typeof window.Cashfree !== 'function') {
    throw new Error('Cashfree SDK failed to load.');
  }

  const cashfree = window.Cashfree({
    mode: getCashfreeMode(payload?.cashfree_env),
  });

  const result = await cashfree.subscriptionsCheckout({
    subsSessionId,
    redirectTarget: '_self',
  });

  if (result?.error) {
    throw new Error(result.error.message || 'Cashfree checkout could not be opened.');
  }
}

async function initPaymentPage() {
  const planCode = getSelectedPaymentPlan();
  const plan = PAYMENT_PLANS[planCode];

  setText('paymentPlanEyebrow', plan.eyebrow);
  setText('paymentPlanName', plan.name);
  setText('paymentPlanCopy', plan.copy);
  setText('paymentPlanAmount', plan.amountDisplay);
  setText('paymentInfoPlan', plan.name);
  setText('paymentInfoAmount', plan.amountDisplay);
  setText('paymentHeroCopy', plan.hero);
  renderPaymentBenefits(planCode);

  const user = await window.appAuth?.getCurrentUser?.();
  if (!user?.id) {
    setPaymentMessage('Please log in to continue with payment.', true);
    return;
  }

  const payBtn = document.getElementById('paymentPrimaryBtn');
  if (payBtn) {
    payBtn.disabled = false;
    payBtn.addEventListener('click', async () => {
      setPaymentBusy(true, 'Preparing secure payment...');
      setPaymentMessage('Preparing Cashfree checkout...', false);

      try {
        window.appAnalytics?.track?.('membership_checkout_started', { provider: 'cashfree', plan_code: planCode });
        await openCashfreeCheckout(planCode);
      } catch (error) {
        console.error('Checkout start error:', error);
        setPaymentBusy(false, 'Continue to Secure Payment');
        setPaymentMessage(error.message || 'Could not start secure payment.', true);
      }
    });
  }

  const paymentState = new URLSearchParams(window.location.search).get('payment');
  if (paymentState === 'cancelled') {
    setPaymentMessage('Payment was cancelled. You can try again whenever you are ready.', true);
  }

  window.appAnalytics?.track?.('payment_page_viewed', { provider: 'cashfree', plan_code: planCode });
}

initPaymentPage().catch((error) => {
  console.error('Payment page init error:', error);
  setPaymentMessage('Could not load the payment page.', true);
});


