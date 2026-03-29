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

function mapIntentStatus(statusText: string) {
  const status = String(statusText || "").trim().toUpperCase();
  if (["SUCCESS", "PAID", "ACTIVE", "CHARGED"].includes(status)) return "paid";
  if (["FAILED", "FAILURE", "DECLINED", "NOT_ATTEMPTED"].includes(status)) return "failed";
  if (["USER_DROPPED", "CANCELLED", "CANCELED"].includes(status)) return "cancelled";
  if (["EXPIRED"].includes(status)) return "expired";
  return "pending";
}

function extractPaymentPayload(payload: any) {
  const data = payload?.data || payload || {};
  const order = data?.order || data?.payment?.order || {};
  const payment = data?.payment || {};
  const orderTags = order?.order_tags || data?.order_tags || {};
  return {
    paymentIntentId: String(orderTags?.payment_intent_id || order?.order_id || data?.order_id || payment?.order_id || ""),
    paymentId: String(payment?.cf_payment_id || data?.cf_payment_id || payment?.payment_id || data?.payment_id || ""),
    referenceId: String(order?.order_id || data?.order_id || payment?.order_id || ""),
    statusText: String(payment?.payment_status || data?.payment_status || order?.order_status || data?.order_status || payload?.type || payload?.event || ""),
    rawData: data,
  };
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
  const payment = extractPaymentPayload(payload);
  const intentStatus = mapIntentStatus(payment.statusText);

  if (!payment.paymentIntentId) {
    return jsonResponse({ ok: true, skipped: true, reason: "no_payment_intent_id" });
  }

  const { data: intentRow } = await supabase
    .from("payment_intents")
    .select("id, user_id, plan_code")
    .eq("id", payment.paymentIntentId)
    .maybeSingle();

  if (!intentRow?.id) {
    return jsonResponse({ ok: true, skipped: true, reason: "no_matching_intent" });
  }

  await supabase
    .from("payment_intents")
    .update({
      status: intentStatus,
      provider_payment_id: payment.paymentId || null,
      provider_reference: payment.referenceId || null,
      provider_payload: payment.rawData || payload,
    })
    .eq("id", intentRow.id);

  if (intentStatus === "paid") {
    const { data: existingMembership } = await supabase
      .from("memberships")
      .select("started_at")
      .eq("user_id", intentRow.user_id)
      .maybeSingle();

    const paidAt = new Date();
    const currentPeriodEnd = new Date(paidAt.getTime() + (30 * 24 * 60 * 60 * 1000));

    await supabase
      .from("memberships")
      .upsert({
        user_id: intentRow.user_id,
        plan_code: intentRow.plan_code,
        status: "active",
        billing_cycle: "monthly",
        started_at: existingMembership?.started_at || paidAt.toISOString(),
        current_period_end: currentPeriodEnd.toISOString(),
        cancel_at_period_end: false,
        provider_customer_id: null,
        provider_subscription_id: payment.paymentId || payment.referenceId || null,
        provider_status: payment.statusText || "PAID",
      }, { onConflict: "user_id" });
  }

  return jsonResponse({ ok: true, intent_id: intentRow.id, status: intentStatus });
});

