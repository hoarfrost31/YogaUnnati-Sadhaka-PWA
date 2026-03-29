# Vercel Payment API

Deploy `vercel-api` as a separate Vercel project.

## Endpoint

This project exposes:
- `/api/create-cashfree-payment-link`

## Required Environment Variables

Set these in Vercel:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CASHFREE_APP_ID`
- `CASHFREE_SECRET_KEY`
- `CASHFREE_API_VERSION`
- `CASHFREE_ENV`

Recommended:
- `CASHFREE_ENV=sandbox` while testing
- `CASHFREE_API_VERSION=2025-01-01`

## After Deploy

Copy the deployed endpoint URL into:
- `js/paymentGatewayConfig.js`

Example:
```js
window.paymentGatewayConfig = {
  createCashfreePaymentLinkUrl: "https://your-vercel-app.vercel.app/api/create-cashfree-payment-link",
};
```

## App Flow

1. App creates a `payment_intent` in Supabase.
2. App calls the Vercel endpoint with the `payment_intent_id`.
3. Vercel creates a dynamic Cashfree link.
4. User is redirected to Cashfree.
5. Cashfree webhook calls Supabase function.
6. Webhook activates membership using `payment_intent_id`.
