import { createClient } from '@supabase/supabase-js';

const PLAN_MAP = {
  app: { amount: 1, purpose: 'YogaUnnati App Membership' },
  online: { amount: 1, purpose: 'YogaUnnati Online Membership' },
  studio: { amount: 1, purpose: 'YogaUnnati Studio Membership' },
};

function json(res, status, body) {
  res.status(status).setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
}

function normalizeIndianPhone(input) {
  const digits = String(input || '').replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  return '';
}

function resolveCustomerName(user) {
  return String(
    user?.user_metadata?.display_name
      || user?.user_metadata?.full_name
      || user?.email
      || 'YogaUnnati Member',
  ).trim();
}

function getCashfreeBaseUrl(env) {
  return String(env || '').toLowerCase() === 'production'
    ? 'https://api.cashfree.com/pg'
    : 'https://sandbox.cashfree.com/pg';
}

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') {
      res.status(200)
        .setHeader('Access-Control-Allow-Origin', '*')
        .setHeader('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type')
        .setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
        .send('ok');
      return;
    }

    if (req.method !== 'POST') {
      json(res, 405, { error: 'Method not allowed' });
      return;
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const cashfreeAppId = process.env.CASHFREE_APP_ID;
    const cashfreeSecretKey = process.env.CASHFREE_SECRET_KEY;
    const cashfreeApiVersion = process.env.CASHFREE_API_VERSION || '2025-01-01';
    const cashfreeEnv = process.env.CASHFREE_ENV || 'sandbox';

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey || !cashfreeAppId || !cashfreeSecretKey) {
      json(res, 500, { error: 'Server configuration is incomplete.' });
      return;
    }

    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      json(res, 401, { error: 'Missing auth token.' });
      return;
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user?.id) {
      json(res, 401, { error: 'Unauthorized.' });
      return;
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);
    const paymentIntentId = String(req.body?.payment_intent_id || '').trim();
    const returnUrl = String(req.body?.return_url || '').trim();
    const cancelUrl = String(req.body?.cancel_url || '').trim();

    if (!paymentIntentId) {
      json(res, 400, { error: 'Payment intent is required.' });
      return;
    }

    const { data: intentRow, error: intentError } = await adminClient
      .from('payment_intents')
      .select('id, user_id, user_email, user_phone, plan_code, status')
      .eq('id', paymentIntentId)
      .maybeSingle();

    if (intentError || !intentRow?.id) {
      json(res, 404, { error: 'Payment intent not found.' });
      return;
    }

    if (intentRow.user_id !== userData.user.id) {
      json(res, 403, { error: 'Payment intent does not belong to this user.' });
      return;
    }

    if (intentRow.status !== 'pending') {
      json(res, 409, { error: 'Payment intent is no longer pending.' });
      return;
    }

    const planMeta = PLAN_MAP[String(intentRow.plan_code || '')];
    if (!planMeta) {
      json(res, 400, { error: 'Plan is not configured.' });
      return;
    }

    const customerPhone = normalizeIndianPhone(
      intentRow.user_phone
        || userData.user.phone
        || userData.user.user_metadata?.phone
        || userData.user.user_metadata?.phone_number
        || userData.user.user_metadata?.mobile
        || '',
    );

    const customerEmail = String(intentRow.user_email || userData.user.email || '').trim().toLowerCase();
    const customerName = resolveCustomerName(userData.user);

    if (!customerPhone) {
      json(res, 400, { error: 'A valid 10-digit phone number is required before payment.' });
      return;
    }

    const orderId = paymentIntentId;
    const customerId = `yu_${userData.user.id.replace(/-/g, '').slice(0, 24)}`;

    const cashfreeResponse = await fetch(`${getCashfreeBaseUrl(cashfreeEnv)}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-version': cashfreeApiVersion,
        'x-client-id': cashfreeAppId,
        'x-client-secret': cashfreeSecretKey,
      },
      body: JSON.stringify({
        order_id: orderId,
        order_amount: planMeta.amount,
        order_currency: 'INR',
        order_note: planMeta.purpose,
        customer_details: {
          customer_id: customerId,
          customer_name: customerName,
          customer_phone: customerPhone,
          customer_email: customerEmail,
        },
        order_meta: {
          return_url: returnUrl || undefined,
          notify_url: cancelUrl || undefined,
        },
        order_tags: {
          payment_intent_id: paymentIntentId,
          user_id: intentRow.user_id,
          plan_code: intentRow.plan_code,
        },
      }),
    });

    const cashfreePayload = await cashfreeResponse.json().catch(() => ({}));
    if (!cashfreeResponse.ok) {
      json(res, 500, {
        error: cashfreePayload?.message || cashfreePayload?.error || 'Could not create Cashfree order.',
      });
      return;
    }

    await adminClient
      .from('payment_intents')
      .update({
        user_email: customerEmail || null,
        user_phone: customerPhone || null,
        provider_reference: String(cashfreePayload.order_id || orderId),
        provider_payload: cashfreePayload,
      })
      .eq('id', paymentIntentId);

    json(res, 200, {
      ok: true,
      order_id: String(cashfreePayload.order_id || orderId),
      payment_session_id: String(cashfreePayload.payment_session_id || ''),
      cashfree_env: String(cashfreeEnv).toLowerCase(),
    });
  } catch (error) {
    json(res, 500, { error: error?.message || 'Unexpected server error.' });
  }
}
