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

function normalizeIndianPhone(input) {
  const digits = String(input || '').replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  return '';
}

async function createPendingPaymentIntent(planCode, user) {
  const phone = normalizeIndianPhone(
    user?.phone
    || user?.user_metadata?.phone
    || user?.user_metadata?.phone_number
    || user?.user_metadata?.mobile
    || user?.raw_user_meta_data?.phone
    || user?.raw_user_meta_data?.phone_number
    || user?.raw_user_meta_data?.mobile
    || ''
  );

  if (!phone) {
    throw new Error("Please add a valid 10 digit mobile number in Profile Settings before payment.");
  }

  const payload = {
    user_id: user.id,
    user_email: String(user.email || '').trim().toLowerCase() || null,
    user_phone: phone || null,
    plan_code: planCode,
    provider: 'cashfree_link',
    status: 'pending',
  };

  const { data, error } = await window.supabaseClient
    .from('payment_intents')
    .insert(payload)
    .select('id')
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message || 'Could not start payment confirmation.');
  }

  return data.id;
}

async function getAccessToken() {
  const { data } = await window.supabaseClient.auth.getSession();
  return data?.session?.access_token || '';
}

async function getFreshCurrentUser() {
  const { data, error } = await window.supabaseClient.auth.getUser();
  if (error) {
    throw new Error(error.message || 'Could not refresh your account details.');
  }

  return data?.user || null;
}

function getPaymentGatewayBaseUrl() {
  return String(window.paymentGatewayConfig?.createCashfreePaymentLinkUrl || '').trim();
}

async function createDynamicPaymentLink(planCode, paymentIntentId) {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error('Please log in again before starting payment.');
  }

  const endpointUrl = getPaymentGatewayBaseUrl();
  if (!endpointUrl) {
    throw new Error('Payment gateway URL is not configured yet.');
  }

  const response = await fetch(endpointUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      payment_intent_id: paymentIntentId,
      return_url: `${window.location.origin}/membership.html?payment=success`,
      cancel_url: `${window.location.origin}/payment.html?plan=${encodeURIComponent(planCode)}&payment=cancelled`,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || 'Could not create secure payment link.');
  }

  if (!payload?.link_url) {
    throw new Error('Cashfree did not return a hosted payment link.');
  }

  return payload.link_url;
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
      setPaymentMessage('Creating your secure Cashfree payment link...', false);

      try {
        const latestUser = await getFreshCurrentUser();
        if (!latestUser?.id) {
          throw new Error('Please log in again before starting payment.');
        }

        const paymentIntentId = await createPendingPaymentIntent(planCode, latestUser);
        const linkUrl = await createDynamicPaymentLink(planCode, paymentIntentId);
        window.appAnalytics?.track?.('membership_checkout_started', { provider: 'cashfree-dynamic-link', plan_code: planCode });
        window.location.href = linkUrl;
      } catch (error) {
        console.error('Dynamic payment link error:', error);
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

  if (!getPaymentGatewayBaseUrl()) {
    setPaymentMessage('Payment gateway URL is not configured yet.', true);
  }

  window.appAnalytics?.track?.('payment_page_viewed', { provider: 'cashfree-dynamic-link', plan_code: planCode });
}

initPaymentPage().catch((error) => {
  console.error('Payment page init error:', error);
  setPaymentMessage('Could not load the payment page.', true);
});

