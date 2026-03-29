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

function normalizeIndianPhone(input: unknown) {
  const digits = String(input || "").replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  return "";
}

function mapIntentStatus(statusText: string) {
  const status = String(statusText || "").trim().toUpperCase();
  if (["SUCCESS", "PAID", "ACTIVE", "CHARGED"].includes(status)) return "paid";
  if (["FAILED", "FAILURE", "DECLINED"].includes(status)) return "failed";
  if (["USER_DROPPED", "CANCELLED", "CANCELED"].includes(status)) return "cancelled";
  if (["EXPIRED"].includes(status)) return "expired";
  return "pending";
}

function extractPaymentPayload(payload: any) {
  const data = payload?.data || payload || {};
  return {
    paymentId: String(data?.cf_payment_id || data?.payment_id || data?.payment?.cf_payment_id || data?.payment?.payment_id || ""),
    referenceId: String(data?.order_id || data?.payment_link_id || data?.payment_link?.link_id || data?.entity_id || ""),
    email: String(data?.customer_details?.customer_email || data?.customer_email || data?.payment?.customer_details?.customer_email || "").trim().toLowerCase(),
    phone: normalizeIndianPhone(data?.customer_details?.customer_phone || data?.customer_phone || data?.payment?.customer_details?.customer_phone || ""),
    statusText: String(data?.payment_status || data?.payment?.payment_status || payload?.type || payload?.event || ""),
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

  let intentQuery = supabase
    .from("payment_intents")
    .select("id, user_id, plan_code")
    .eq("provider", "cashfree_link")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1);

  if (payment.email) {
    intentQuery = intentQuery.eq("user_email", payment.email);
  } else if (payment.phone) {
    intentQuery = intentQuery.eq("user_phone", payment.phone);
  } else {
    return jsonResponse({ ok: true, skipped: true, reason: "no_customer_identity" });
  }

  const { data: intentRow } = await intentQuery.maybeSingle();
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
    await supabase
      .from("memberships")
      .upsert({
        user_id: intentRow.user_id,
        plan_code: intentRow.plan_code,
        status: "active",
        billing_cycle: "monthly",
        started_at: new Date().toISOString(),
        current_period_end: null,
        cancel_at_period_end: false,
        provider_customer_id: payment.email || payment.phone || null,
        provider_subscription_id: payment.paymentId || payment.referenceId || null,
        provider_status: payment.statusText || "PAID",
      }, { onConflict: "user_id" });
  }

  return jsonResponse({ ok: true, intent_id: intentRow.id, status: intentStatus });
});
