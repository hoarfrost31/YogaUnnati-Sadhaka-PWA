import { createClient } from '@supabase/supabase-js';

const DEFAULT_ADMIN_EMAILS = ['nkapse27@gmail.com'];

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

function resolveDisplayName(user, profileRow) {
  const metadataName = String(user?.user_metadata?.display_name || profileRow?.display_name || '').trim();
  if (metadataName) return metadataName;
  const emailPrefix = String(user?.email || '').split('@')[0].trim();
  return emailPrefix || 'Yoga Member';
}

function resolvePhone(user, profileRow) {
  return normalizeIndianPhone(
    profileRow?.phone
      || user?.user_metadata?.phone
      || user?.user_metadata?.phone_number
      || user?.user_metadata?.mobile
      || user?.phone
      || ''
  );
}

async function loadProfileRow(adminClient, memberId) {
  const { data, error } = await adminClient
    .from('profiles')
    .select('id, display_name, phone')
    .eq('id', memberId)
    .maybeSingle();

  if (error && error.code !== '42P01') {
    throw error;
  }

  return data || null;
}

async function upsertProfileRow(adminClient, memberId, displayName, phone) {
  const payload = {
    id: memberId,
    display_name: displayName || 'Yoga Member',
    phone: phone || null,
  };

  let { error } = await adminClient.from('profiles').upsert(payload, { onConflict: 'id' });
  if (error && /phone/i.test(String(error.message || ''))) {
    ({ error } = await adminClient.from('profiles').upsert({
      id: memberId,
      display_name: displayName || 'Yoga Member',
    }, { onConflict: 'id' }));
  }

  if (error && error.code !== '42P01') {
    throw error;
  }
}

async function authorizeAdmin(req) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return { error: 'Server configuration is incomplete.' };
  }

  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { status: 401, error: 'Missing auth token.' };
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user?.id) {
    return { status: 401, error: 'Unauthorized.' };
  }

  const adminEmail = normalizeEmail(userData.user.email);
  if (!getAllowedAdminEmails().includes(adminEmail)) {
    return { status: 403, error: 'Admin access denied.' };
  }

  return {
    supabaseUrl,
    supabaseServiceRoleKey,
  };
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

    const authState = await authorizeAdmin(req);
    if (authState.error) {
      json(res, authState.status || 500, { error: authState.error });
      return;
    }

    const memberId = String(req.body?.member_id || '').trim();
    const mode = String(req.body?.mode || 'get').trim().toLowerCase();

    if (!memberId) {
      json(res, 400, { error: 'Member ID is required.' });
      return;
    }

    const adminClient = createClient(authState.supabaseUrl, authState.supabaseServiceRoleKey);
    const { data: memberLookup, error: memberLookupError } = await adminClient.auth.admin.getUserById(memberId);
    if (memberLookupError || !memberLookup?.user?.id) {
      json(res, 404, { error: memberLookupError?.message || 'Member account not found.' });
      return;
    }

    const memberUser = memberLookup.user;
    const profileRow = await loadProfileRow(adminClient, memberId);

    if (mode === 'get') {
      json(res, 200, {
        ok: true,
        user_id: memberId,
        email: normalizeEmail(memberUser.email),
        display_name: resolveDisplayName(memberUser, profileRow),
        phone: resolvePhone(memberUser, profileRow),
      });
      return;
    }

    if (mode !== 'update') {
      json(res, 400, { error: 'Unsupported mode.' });
      return;
    }

    const email = normalizeEmail(req.body?.email);
    const displayName = String(req.body?.display_name || '').trim();
    const phone = normalizeIndianPhone(req.body?.phone || '');

    if (!email) {
      json(res, 400, { error: 'Email is required.' });
      return;
    }

    if (!phone) {
      json(res, 400, { error: 'A valid 10-digit mobile number is required.' });
      return;
    }

    const resolvedDisplayName = displayName || email.split('@')[0] || 'Yoga Member';
    const { data: updatedData, error: updateError } = await adminClient.auth.admin.updateUserById(memberId, {
      email,
      email_confirm: true,
      user_metadata: {
        ...(memberUser.user_metadata || {}),
        display_name: resolvedDisplayName,
        phone,
        phone_number: phone,
        mobile: phone,
      },
    });

    if (updateError) {
      json(res, 500, { error: updateError.message || 'Could not update member account.' });
      return;
    }

    await upsertProfileRow(adminClient, memberId, resolvedDisplayName, phone);

    json(res, 200, {
      ok: true,
      user_id: memberId,
      email: normalizeEmail(updatedData?.user?.email || email),
      display_name: resolvedDisplayName,
      phone,
      message: 'Member info updated successfully.',
    });
  } catch (error) {
    json(res, 500, { error: error?.message || 'Unexpected server error.' });
  }
}
