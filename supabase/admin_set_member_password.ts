import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const defaultAdminEmails = ["nkapse27@gmail.com"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function getAllowedAdminEmails() {
  const raw = String(Deno.env.get("ADMIN_EMAILS") || "").trim();
  if (!raw) return defaultAdminEmails;
  return raw.split(",").map(normalizeEmail).filter(Boolean);
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonResponse({ error: "Missing auth token." }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user?.id) {
      return jsonResponse({ error: "Unauthorized." }, 401);
    }

    const allowedAdminEmails = getAllowedAdminEmails();
    const adminEmail = normalizeEmail(userData.user.email);
    if (!allowedAdminEmails.includes(adminEmail)) {
      return jsonResponse({ error: "Admin access denied." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const memberId = String(body?.member_id || "").trim();
    const newPassword = String(body?.new_password || "");

    if (!memberId) {
      return jsonResponse({ error: "Member ID is required." }, 400);
    }

    if (newPassword.length < 6) {
      return jsonResponse({ error: "Password must be at least 6 characters." }, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data, error } = await adminClient.auth.admin.updateUserById(memberId, {
      password: newPassword,
    });

    if (error) {
      return jsonResponse({ error: error.message || "Could not update password." }, 500);
    }

    return jsonResponse({
      ok: true,
      user_id: data?.user?.id || memberId,
      message: "Password updated successfully.",
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unexpected server error." }, 500);
  }
});
