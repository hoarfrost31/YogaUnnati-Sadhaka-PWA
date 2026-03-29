const PAYMENT_PLANS = {
  app: {
    eyebrow: 'App Only',
    name: 'YogaUnnati App',
    amountDisplay: '\u20B9199',
    amountValue: 199,
    copy: 'The digital-only membership for members who want tracking, milestones, and app continuity.',
    hero: 'Your app-only membership will continue through a secure Cashfree hosted checkout.',
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
    hero: 'Your online guided membership will continue through a secure monthly Cashfree hosted checkout.',
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
    hero: 'Your full studio membership will continue through a secure monthly Cashfree hosted checkout.',
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
    pill.textContent = isBusy ? 'Opening' : 'Ready';
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

function getHostedLink(planCode) {
  const links = window.cashfreeHostedLinks || {};
  return String(links[planCode] || '').trim();
}

function openHostedCheckout(planCode) {
  const checkoutUrl = getHostedLink(planCode);
  if (!checkoutUrl) {
    throw new Error('Cashfree checkout link is not configured for this plan yet.');
  }

  window.location.href = checkoutUrl;
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
      setPaymentBusy(true, 'Opening secure payment...');
      setPaymentMessage('Redirecting to Cashfree checkout...', false);

      try {
        window.appAnalytics?.track?.('membership_checkout_started', { provider: 'cashfree-hosted', plan_code: planCode });
        openHostedCheckout(planCode);
      } catch (error) {
        console.error('Hosted checkout start error:', error);
        setPaymentBusy(false, 'Continue to Secure Payment');
        setPaymentMessage(error.message || 'Could not open secure payment.', true);
      }
    });
  }

  const paymentState = new URLSearchParams(window.location.search).get('payment');
  if (paymentState === 'cancelled') {
    setPaymentMessage('Payment was cancelled. You can try again whenever you are ready.', true);
  }
  if (paymentState === 'success') {
    setPaymentMessage('Payment completed. Your membership status will update after confirmation.', false);
  }

  if (!getHostedLink(planCode)) {
    setPaymentMessage('Cashfree checkout link is not configured for this plan yet.', true);
  }

  window.appAnalytics?.track?.('payment_page_viewed', { provider: 'cashfree-hosted', plan_code: planCode });
}

initPaymentPage().catch((error) => {
  console.error('Payment page init error:', error);
  setPaymentMessage('Could not load the payment page.', true);
});
