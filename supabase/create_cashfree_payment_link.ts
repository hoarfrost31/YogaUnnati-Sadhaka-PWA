import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cashfreeAppId = Deno.env.get("CASHFREE_APP_ID") || "";
const cashfreeSecretKey = Deno.env.get("CASHFREE_SECRET_KEY") || "";
const cashfreeApiVersion = Deno.env.get("CASHFREE_API_VERSION") || "2025-01-01";
const cashfreeEnv = (Deno.env.get("CASHFREE_ENV") || "sandbox").toLowerCase();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PLAN_MAP: Record<string, { amount: number; purpose: string }> = {
  app: { amount: 199, purpose: "YogaUnnati App Membership" },
  online: { amount: 499, purpose: "YogaUnnati Online Membership" },
  studio: { amount: 1099, purpose: "YogaUnnati Studio Membership" },
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

function getCashfreeBaseUrl() {
  return cashfreeEnv === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";
}

function normalizeIndianPhone(input: unknown) {
  const digits = String(input || "").replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  return "";
}

function resolveCustomerName(user: any) {
  return String(
    user?.user_metadata?.display_name
      || user?.user_metadata?.full_name
      || user?.raw_user_meta_data?.display_name
      || user?.raw_user_meta_data?.full_name
      || user?.email
      || "YogaUnnati Member",
  ).trim();
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    if (!cashfreeAppId || !cashfreeSecretKey) {
      return jsonResponse({ error: "Cashfree credentials are not configured." }, 500);
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

    const body = await req.json().catch(() => ({}));
    const paymentIntentId = String(body?.payment_intent_id || "").trim();
    const returnUrl = String(body?.return_url || "").trim() || `${new URL(req.url).origin}/membership.html?payment=success`;
    const cancelUrl = String(body?.cancel_url || "").trim() || `${new URL(req.url).origin}/payment.html?payment=cancelled`;

    if (!paymentIntentId) {
      return jsonResponse({ error: "Payment intent is required." }, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: intentRow, error: intentError } = await adminClient
      .from("payment_intents")
      .select("id, user_id, user_email, user_phone, plan_code, status")
      .eq("id", paymentIntentId)
      .maybeSingle();

    if (intentError || !intentRow?.id) {
      return jsonResponse({ error: "Payment intent not found." }, 404);
    }

    if (intentRow.user_id !== userData.user.id) {
      return jsonResponse({ error: "Payment intent does not belong to this user." }, 403);
    }

    if (intentRow.status !== "pending") {
      return jsonResponse({ error: "Payment intent is no longer pending." }, 409);
    }

    const planMeta = PLAN_MAP[String(intentRow.plan_code || "") as keyof typeof PLAN_MAP];
    if (!planMeta) {
      return jsonResponse({ error: "Plan is not configured." }, 400);
    }

    const customerPhone = normalizeIndianPhone(intentRow.user_phone || userData.user.phone || userData.user.user_metadata?.phone || userData.user.user_metadata?.phone_number || userData.user.user_metadata?.mobile || "");
    const customerEmail = String(intentRow.user_email || userData.user.email || "").trim().toLowerCase();
    const customerName = resolveCustomerName(userData.user);

    if (!customerPhone) {
      return jsonResponse({ error: "A valid 10-digit phone number is required before payment." }, 400);
    }

    const linkId = paymentIntentId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 50);

    const cashfreeResponse = await fetch(`${getCashfreeBaseUrl()}/links`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-version": cashfreeApiVersion,
        "x-client-id": cashfreeAppId,
        "x-client-secret": cashfreeSecretKey,
      },
      body: JSON.stringify({
        link_id: linkId,
        link_amount: planMeta.amount,
        link_currency: "INR",
        link_purpose: planMeta.purpose,
        customer_details: {
          customer_name: customerName,
          customer_phone: customerPhone,
          customer_email: customerEmail,
        },
        link_meta: {
          return_url: returnUrl,
          notify_url: cancelUrl,
        },
        link_notes: {
          payment_intent_id: paymentIntentId,
          user_id: intentRow.user_id,
          plan_code: intentRow.plan_code,
        },
        link_auto_reminders: true,
        link_notify: {
          send_sms: true,
          send_email: true,
        },
        link_expiry_time: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      }),
    });

    const cashfreePayload = await cashfreeResponse.json().catch(() => ({}));
    if (!cashfreeResponse.ok) {
      return jsonResponse({ error: cashfreePayload?.message || cashfreePayload?.error || "Could not create Cashfree payment link." }, 500);
    }

    await adminClient
      .from("payment_intents")
      .update({
        user_email: customerEmail || null,
        user_phone: customerPhone || null,
        provider_link_id: String(cashfreePayload.link_id || linkId),
        provider_reference: String(cashfreePayload.cf_link_id || "") || null,
        provider_payload: cashfreePayload,
      })
      .eq("id", paymentIntentId);

    return jsonResponse({
      ok: true,
      link_url: String(cashfreePayload.link_url || ""),
      link_id: String(cashfreePayload.link_id || linkId),
      cashfree_env: cashfreeEnv,
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unexpected function error" }, 500);
  }
});
