import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cashfreeSecretKey = Deno.env.get("CASHFREE_SECRET_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-signature, x-webhook-timestamp",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(supabaseUrl, serviceRoleKey);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

async function computeSignature(rawBody: string, timestamp: string) {
  const signingString = `${timestamp}${rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(cashfreeSecretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingString));
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

async function verifySignature(rawBody: string, timestamp: string, signature: string) {
  if (!cashfreeSecretKey || !timestamp || !signature) {
    return false;
  }
  const computed = await computeSignature(rawBody, timestamp);
  return computed === signature;
}

function mapStatus(providerStatus: string) {
  const status = String(providerStatus || "").trim().toUpperCase();
  if (["ACTIVE"].includes(status)) return "active";
  if (["INITIALIZED", "PENDING", "BANK_APPROVAL_PENDING", "PAUSED", "CUSTOMER_PAUSED", "ON_HOLD"].includes(status)) return "pending";
  if (["CUSTOMER_CANCELLED", "CANCELLED", "COMPLETED"].includes(status)) return "cancelled";
  if (["EXPIRED", "LINK_EXPIRED", "CARD_EXPIRED"].includes(status)) return "expired";
  return "past_due";
}

function extractSubscription(payload: any) {
  return payload?.data?.subscription
    || payload?.data
    || payload?.subscription
    || payload?.subscription_details
    || {};
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-webhook-signature") || req.headers.get("signature") || "";
  const timestamp = req.headers.get("x-webhook-timestamp") || "";
  const verified = await verifySignature(rawBody, timestamp, signature);
  if (!verified) {
    return jsonResponse({ error: "Invalid signature." }, 401);
  }

  const payload = JSON.parse(rawBody || "{}");
  const subscriptionDetails = extractSubscription(payload);
  const subscriptionId = String(
    subscriptionDetails?.subscription_id
      || subscriptionDetails?.subscriptionId
      || subscriptionDetails?.sub_reference_id
      || "",
  );
  const providerStatus = String(
    subscriptionDetails?.subscription_status
      || subscriptionDetails?.status
      || payload?.event_data?.subscription_status
      || payload?.type
      || payload?.event
      || "",
  );
  const membershipStatus = mapStatus(providerStatus);

  if (!subscriptionId) {
    return jsonResponse({ ok: true, skipped: true });
  }

  const { data: membershipRow } = await supabase
    .from("memberships")
    .select("user_id, plan_code, started_at")
    .eq("provider_subscription_id", subscriptionId)
    .maybeSingle();

  if (!membershipRow?.user_id) {
    return jsonResponse({ ok: true, skipped: true });
  }

  const startedAt = membershipStatus === "active"
    ? (membershipRow.started_at || new Date().toISOString())
    : membershipRow.started_at;

  await supabase.from("memberships").upsert({
    user_id: membershipRow.user_id,
    plan_code: membershipRow.plan_code || "none",
    status: membershipStatus,
    billing_cycle: "monthly",
    started_at: startedAt || null,
    current_period_end: subscriptionDetails?.next_schedule_date || subscriptionDetails?.subscription_expiry_time || null,
    cancel_at_period_end: false,
    provider_customer_id: String(subscriptionDetails?.customer_id || "") || null,
    provider_subscription_id: subscriptionId,
    provider_status: providerStatus || null,
  }, { onConflict: "user_id" });

  return jsonResponse({ ok: true, subscription_id: subscriptionId, status: providerStatus });
});
