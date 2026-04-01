import { createClient } from '@supabase/supabase-js';

const DEFAULT_ADMIN_EMAILS = ['nkapse27@gmail.com'];
const BILLING_PERIOD_DAYS = 30;

function json(res, status, body) {
  res.status(status).setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeIndianPhone(input) {
  const digits = String(input || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  return '';
}

function getAllowedAdminEmails() {
  const raw = String(process.env.ADMIN_EMAILS || '').trim();
  if (!raw) return DEFAULT_ADMIN_EMAILS;
  return raw.split(',').map(normalizeEmail).filter(Boolean);
}

function addBillingDays(baseDate, days = BILLING_PERIOD_DAYS) {
  const date = new Date(baseDate);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() + (days * 24 * 60 * 60 * 1000));
}

function getNextMonthlyRenewalIso(baseDate = new Date()) {
  const nextDate = addBillingDays(baseDate);
  return nextDate ? nextDate.toISOString() : null;
}

async function ensureProfileRow(adminClient, userId, displayName, phone) {
  const payload = {
    id: userId,
    display_name: displayName || 'Yoga Member',
    phone: phone || null,
    avatar_url: null,
  };

  let { error } = await adminClient.from('profiles').upsert(payload, { onConflict: 'id' });
  if (error && /phone/i.test(String(error.message || ''))) {
    ({ error } = await adminClient.from('profiles').upsert({
      id: userId,
      display_name: displayName || 'Yoga Member',
      avatar_url: null,
    }, { onConflict: 'id' }));
  }

  if (error) throw error;
}

async function insertMembershipCycleRecord(adminClient, userId, membershipPayload) {
  if (!membershipPayload?.started_at || !membershipPayload?.current_period_end || membershipPayload?.plan_code === 'none') {
    return;
  }

  const { error } = await adminClient.from('membership_cycles').insert({
    user_id: userId,
    plan_code: membershipPayload.plan_code,
    status: membershipPayload.status,
    period_start: membershipPayload.started_at,
    period_end: membershipPayload.current_period_end,
    source: 'admin',
    note: 'Initial membership assigned from admin create member',
  });

  if (error && error.code !== '42P01') throw error;
}

async function assignMembershipToUser(adminClient, userId, planCode) {
  const normalizedPlan = String(planCode || 'none').trim().toLowerCase();
  const startedAt = normalizedPlan === 'none' ? null : new Date().toISOString();
  const payload = {
    user_id: userId,
    plan_code: normalizedPlan,
    status: normalizedPlan === 'none' ? 'inactive' : 'active',
    billing_cycle: 'monthly',
    started_at: startedAt,
    current_period_end: normalizedPlan === 'none' ? null : getNextMonthlyRenewalIso(startedAt),
    cancel_at_period_end: false,
  };

  const { error } = await adminClient.from('memberships').upsert(payload, { onConflict: 'user_id' });
  if (error) throw error;

  if (normalizedPlan !== 'none') {
    await insertMembershipCycleRecord(adminClient, userId, payload);
  }
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

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      json(res, 500, { error: 'Server configuration is incomplete.' });
      return;
    }

    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      json(res, 401, { error: 'Missing auth token.' });
      return;
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user?.id) {
      json(res, 401, { error: 'Unauthorized.' });
      return;
    }

    const allowedAdminEmails = getAllowedAdminEmails();
    const adminEmail = normalizeEmail(userData.user.email);
    if (!allowedAdminEmails.includes(adminEmail)) {
      json(res, 403, { error: 'Admin access denied.' });
      return;
    }

    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    const displayName = String(req.body?.display_name || '').trim();
    const phone = normalizeIndianPhone(req.body?.phone || '');
    const membershipPlan = String(req.body?.membership_plan || 'none').trim().toLowerCase();

    if (!email || !password) {
      json(res, 400, { error: 'Email and password are required.' });
      return;
    }

    if (password.length < 6) {
      json(res, 400, { error: 'Password must be at least 6 characters.' });
      return;
    }

    if (!phone) {
      json(res, 400, { error: 'A valid 10-digit mobile number is required.' });
      return;
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data: createdData, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: displayName,
        phone,
        phone_number: phone,
        mobile: phone,
      },
    });

    if (createError || !createdData?.user?.id) {
      json(res, 400, { error: createError?.message || 'Could not create member auth account.' });
      return;
    }

    const memberId = createdData.user.id;
    const resolvedDisplayName = displayName || email.split('@')[0] || 'Yoga Member';

    await ensureProfileRow(adminClient, memberId, resolvedDisplayName, phone);
    await assignMembershipToUser(adminClient, memberId, membershipPlan);

    json(res, 200, {
      ok: true,
      user_id: memberId,
      email,
      membership_plan: membershipPlan,
      message: 'Member created successfully.',
    });
  } catch (error) {
    json(res, 500, { error: error?.message || 'Unexpected server error.' });
  }
}
