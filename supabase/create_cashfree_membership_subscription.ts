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

const PLAN_MAP: Record<string, { amount: number; plan_id: string; plan_name: string }> = {
  app: { amount: 199, plan_id: "yogaunnati_app_monthly", plan_name: "YogaUnnati App Monthly" },
  online: { amount: 499, plan_id: "yogaunnati_online_monthly", plan_name: "YogaUnnati Online Monthly" },
  studio: { amount: 1099, plan_id: "yogaunnati_studio_monthly", plan_name: "YogaUnnati Studio Monthly" },
};

function normalizeIndianPhone(input: unknown) {
  const digits = String(input || "").replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  return "";
}

function resolveCustomerPhone(user: any) {
  return normalizeIndianPhone(
    user?.phone
      || user?.user_metadata?.phone
      || user?.user_metadata?.phone_number
      || user?.user_metadata?.mobile
      || user?.raw_user_meta_data?.phone
      || user?.raw_user_meta_data?.phone_number
      || user?.raw_user_meta_data?.mobile
      || "",
  );
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (!cashfreeAppId || !cashfreeSecretKey) {
    return jsonResponse({ error: "Cashfree credentials are not configured." }, 500);
  }

  let payload: { plan_code?: string; return_url?: string; cancel_url?: string } = {};
  try {
    payload = await req.json();
  } catch {
    payload = {};
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

  const planCode = String(payload.plan_code || "").trim().toLowerCase();
  const planMeta = PLAN_MAP[planCode];
  if (!planMeta) {
    return jsonResponse({ error: "Selected plan is not configured." }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const customerId = `yu_${userData.user.id.replace(/-/g, "").slice(0, 24)}`;
  const subscriptionId = `sub_${planCode}_${Date.now()}`;
  const customerPhone = resolveCustomerPhone(userData.user);
  const customerName = resolveCustomerName(userData.user);

  if (!customerPhone) {
    return jsonResponse({ error: "A valid 10-digit phone number is required on your account before starting payment." }, 400);
  }

  const returnUrl = String(payload.return_url || "").trim() || `${new URL(req.url).origin}/membership.html?payment=success`;

  const cashfreeResponse = await fetch(`${getCashfreeBaseUrl()}/subscriptions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-version": cashfreeApiVersion,
      "x-client-id": cashfreeAppId,
      "x-client-secret": cashfreeSecretKey,
    },
    body: JSON.stringify({
      subscription_id: subscriptionId,
      subscription_amount: planMeta.amount,
      subscription_currency: "INR",
      subscription_note: `YogaUnnati ${planCode} membership`,
      customer_details: {
        customer_id: customerId,
        customer_email: userData.user.email || "",
        customer_phone: customerPhone,
        customer_name: customerName,
      },
      plan_details: {
        plan_id: planMeta.plan_id,
        plan_name: planMeta.plan_name,
        type: "PERIODIC",
        amount: planMeta.amount,
        currency: "INR",
        max_amount: planMeta.amount,
        max_cycles: 120,
        interval_type: "MONTH",
        interval_value: 1,
      },
      authorization_details: {
        payment_methods: ["upi", "card"],
      },
      subscription_meta: {
        return_url: returnUrl,
        notify_url: String(payload.cancel_url || "").trim() || returnUrl,
      },
      subscription_expiry_time: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      subscription_tags: {
        user_id: userData.user.id,
        plan_code: planCode,
        source: "yogaunnati_membership",
      },
    }),
  });

  const cashfreePayload = await cashfreeResponse.json().catch(() => ({}));
  if (!cashfreeResponse.ok) {
    return jsonResponse({ error: cashfreePayload?.message || cashfreePayload?.error || "Could not create Cashfree subscription." }, 500);
  }

  await adminClient.from("memberships").upsert({
    user_id: userData.user.id,
    plan_code: planCode,
    status: "pending",
    billing_cycle: "monthly",
    started_at: null,
    current_period_end: null,
    cancel_at_period_end: false,
    provider_customer_id: customerId,
    provider_subscription_id: String(cashfreePayload.subscription_id || subscriptionId),
    provider_status: String(cashfreePayload.subscription_status || "INITIALIZED"),
  }, { onConflict: "user_id" });

  const subscriptionSessionId = String(cashfreePayload.subscription_session_id || cashfreePayload.subs_session_id || "");
  if (!subscriptionSessionId) {
    return jsonResponse({ error: "Cashfree did not return a subscription session id." }, 500);
  }

  return jsonResponse({
    ok: true,
    subscription_id: String(cashfreePayload.subscription_id || subscriptionId),
    subscription_session_id: subscriptionSessionId,
    cashfree_env: cashfreeEnv,
  });
});
