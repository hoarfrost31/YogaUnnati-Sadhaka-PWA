const PAYMENT_PLANS = {
  app: {
    eyebrow: 'App Only',
    name: 'YogaUnnati App',
    amountDisplay: "\u20B9199",
    amountValue: 199,
    copy: 'Monthly membership summary for your selected YogaUnnati plan.',
    hero: 'Your payment is handled securely through Cashfree payment gateway.',
    benefits: [
      'Daily progress tracking',
      'Milestone progression',
      'Community access inside the app',
    ],
  },
  online: {
    eyebrow: 'Online Guided + App',
    name: 'YogaUnnati Online',
    amountDisplay: "\u20B9499",
    amountValue: 499,
    copy: 'Monthly membership summary for your selected YogaUnnati plan.',
    hero: 'Your payment is handled securely through Cashfree payment gateway.',
    benefits: [
      'Online guided sessions',
      'App milestones and tracking',
      'Consistent guided practice rhythm',
    ],
  },
  studio: {
    eyebrow: 'Studio + App',
    name: 'YogaUnnati Studio',
    amountDisplay: "\u20B91099",
    amountValue: 1099,
    copy: 'Monthly membership summary for your selected YogaUnnati plan.',
    hero: 'Your payment is handled securely through Cashfree payment gateway.',
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
    button.textContent = buttonLabel || 'Continue to Payment';
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
    throw new Error('Please add a valid 10 digit mobile number in Profile Settings before payment.');
  }

  const payload = {
    user_id: user.id,
    user_email: String(user.email || '').trim().toLowerCase() || null,
    user_phone: phone || null,
    plan_code: planCode,
    provider: 'cashfree_order',
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

async function createCashfreeOrder(paymentIntentId, planCode) {
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
    throw new Error(payload?.error || 'Could not create secure checkout session.');
  }

  if (!payload?.payment_session_id) {
    throw new Error('Cashfree did not return a payment session.');
  }

  return payload;
}

function getCashfreeInstance(env) {
  if (typeof window.Cashfree !== 'function') {
    throw new Error('Cashfree checkout is not available right now.');
  }

  return window.Cashfree({
    mode: String(env || '').toLowerCase() === 'sandbox' ? 'sandbox' : 'production',
  });
}

async function openCashfreeCheckout(orderPayload) {
  const cashfree = getCashfreeInstance(orderPayload.cashfree_env);
  await cashfree.checkout({
    paymentSessionId: orderPayload.payment_session_id,
    redirectTarget: '_self',
  });
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
      setPaymentBusy(true, 'Opening payment...');
      setPaymentMessage('Creating your secure Cashfree checkout...', false);

      try {
        const latestUser = await getFreshCurrentUser();
        if (!latestUser?.id) {
          throw new Error('Please log in again before starting payment.');
        }

        const paymentIntentId = await createPendingPaymentIntent(planCode, latestUser);
        const orderPayload = await createCashfreeOrder(paymentIntentId, planCode);
        window.appAnalytics?.track?.('membership_checkout_started', { provider: 'cashfree-order', plan_code: planCode });
        await openCashfreeCheckout(orderPayload);
        setPaymentBusy(false, 'Continue to Payment');
      } catch (error) {
        console.error('Cashfree checkout error:', error);
        setPaymentBusy(false, 'Continue to Payment');
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

  window.appAnalytics?.track?.('payment_page_viewed', { provider: 'cashfree-order', plan_code: planCode });
}

initPaymentPage().catch((error) => {
  console.error('Payment page init error:', error);
  setPaymentMessage('Could not load the payment page.', true);
});

