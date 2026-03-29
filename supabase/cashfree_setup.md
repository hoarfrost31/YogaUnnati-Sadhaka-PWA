# Cashfree Membership Setup

Use this for YogaUnnati monthly memberships.

## Cashfree Credentials

Collect these values:
- `CASHFREE_APP_ID`
- `CASHFREE_SECRET_KEY`
- `CASHFREE_ENV`
- `CASHFREE_API_VERSION`

Recommended:
- `CASHFREE_ENV=sandbox` during testing
- `CASHFREE_API_VERSION=2025-01-01`

## Supabase SQL

Run:
- `supabase/memberships.sql`

## Deploy Functions

Deploy these Edge Functions:
- `supabase/create_cashfree_membership_subscription.ts`
- `supabase/cashfree_membership_webhook.ts`

## Required Environment Variables

Set in Supabase Functions:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CASHFREE_APP_ID`
- `CASHFREE_SECRET_KEY`
- `CASHFREE_ENV`
- `CASHFREE_API_VERSION`

## Important Data Requirement

Cashfree checkout needs a real customer phone number.
The current scaffold reads it from the signed-in Supabase user:
- `user.phone`
- `user_metadata.phone`
- `user_metadata.phone_number`
- `user_metadata.mobile`

If no valid 10-digit number is present, checkout is blocked with a clear error.

## App Flow

1. User chooses a plan on `membership.html`
2. App opens `payment.html`
3. `payment.html` calls `create-cashfree-membership-subscription`
4. Function creates the Cashfree subscription and returns `subscription_session_id`
5. The page opens Cashfree Checkout using the official JS SDK
6. Cashfree webhook updates `public.memberships`
7. Member sees status move from `pending` to `active`

## Notes

- This scaffold creates plan details inline with the subscription request.
- If you prefer predefined Cashfree plans, replace the inline `plan_details` payload with your actual plan references.
- The client-side app treats plan selection as checkout start only, not direct activation.
- Verify the final request/response payload against your exact Cashfree account mode during first sandbox test.
