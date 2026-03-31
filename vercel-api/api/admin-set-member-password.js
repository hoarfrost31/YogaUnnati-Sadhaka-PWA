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

    const allowedAdminEmails = getAllowedAdminEmails();
    const adminEmail = normalizeEmail(userData.user.email);
    if (!allowedAdminEmails.includes(adminEmail)) {
      json(res, 403, { error: 'Admin access denied.' });
      return;
    }

    const memberId = String(req.body?.member_id || '').trim();
    const newPassword = String(req.body?.new_password || '');

    if (!memberId) {
      json(res, 400, { error: 'Member ID is required.' });
      return;
    }

    if (newPassword.length < 6) {
      json(res, 400, { error: 'Password must be at least 6 characters.' });
      return;
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data, error } = await adminClient.auth.admin.updateUserById(memberId, {
      password: newPassword,
    });

    if (error) {
      json(res, 500, { error: error.message || 'Could not update password.' });
      return;
    }

    json(res, 200, {
      ok: true,
      user_id: data?.user?.id || memberId,
      message: 'Password updated successfully.',
    });
  } catch (error) {
    json(res, 500, { error: error?.message || 'Unexpected server error.' });
  }
}
