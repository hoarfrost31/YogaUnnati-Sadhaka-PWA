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

function getAllowedAdminEmails() {
  const raw = String(process.env.ADMIN_EMAILS || '').trim();
  if (!raw) return DEFAULT_ADMIN_EMAILS;
  return raw.split(',').map(normalizeEmail).filter(Boolean);
}

function getFallbackDisplayName(user) {
  const metadataName = String(user?.user_metadata?.display_name || '').trim();
  if (metadataName) {
    return metadataName;
  }

  const emailPrefix = String(user?.email || '').split('@')[0].trim();
  return emailPrefix || 'Yoga Member';
}

async function ensureProfileRow(adminClient, user) {
  const { data: existingProfile, error: lookupError } = await adminClient
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (lookupError && !['PGRST116', '42P01'].includes(String(lookupError.code || ''))) {
    throw lookupError;
  }

  if (existingProfile?.id) {
    return;
  }

  const { error: insertError } = await adminClient.from('profiles').upsert({
    id: user.id,
    display_name: getFallbackDisplayName(user),
    avatar_url: null,
    phone: String(user?.user_metadata?.phone || user?.user_metadata?.phone_number || user?.user_metadata?.mobile || user?.phone || '').trim() || null,
    login_disabled: false,
  }, { onConflict: 'id' });

  if (insertError) {
    throw insertError;
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

    const memberId = String(req.body?.member_id || '').trim();
    const loginDisabled = Boolean(req.body?.login_disabled);

    if (!memberId) {
      json(res, 400, { error: 'Member ID is required.' });
      return;
    }

    if (memberId === userData.user.id) {
      json(res, 400, { error: 'You cannot block your own admin account from here.' });
      return;
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data: memberLookup, error: memberLookupError } = await adminClient.auth.admin.getUserById(memberId);
    if (memberLookupError || !memberLookup?.user?.id) {
      json(res, 404, { error: 'Member account not found.' });
      return;
    }

    await ensureProfileRow(adminClient, memberLookup.user);

    const { error: updateError } = await adminClient
      .from('profiles')
      .update({ login_disabled: loginDisabled })
      .eq('id', memberId);

    if (updateError) {
      json(res, 500, { error: updateError.message || 'Could not update login access.' });
      return;
    }

    json(res, 200, {
      ok: true,
      user_id: memberId,
      login_disabled: loginDisabled,
      message: loginDisabled ? 'Member login blocked.' : 'Member login restored.',
    });
  } catch (error) {
    json(res, 500, { error: error?.message || 'Unexpected server error.' });
  }
}
