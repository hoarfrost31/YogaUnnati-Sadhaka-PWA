# Web Push Setup

To move from test notifications to real scheduled reminders:

1. Run [push_notifications.sql](./push_notifications.sql) in Supabase SQL Editor.
2. Generate VAPID keys.
3. Expose the public VAPID key to the app as `window.PWA_PUSH_PUBLIC_KEY`.
4. Create a scheduled sender that:
   - reads enabled rows from `public.push_subscriptions`
   - respects each subscription's saved `timezone`
   - runs frequently enough to catch local-time windows
   - sends the scheduled reminder types:
     - `night` at `9:00 PM`
     - `morning` at `5:15 AM`
     - `missed` at `9:00 PM` when today's mark is missing
5. Trigger the optional local `progress` notification immediately after attendance is marked in-app.

## Notes

- The app already supports:
  - permission requests
  - test notifications
  - service worker `push` handling
  - `notificationclick` deep-link behavior
  - saving subscriptions to `public.push_subscriptions`

- What still needs server-side setup:
  - VAPID private/public key pair
  - a scheduled job or edge function to send push notifications
  - a frequent cron cadence such as every 15 minutes for local-time delivery

- The client currently degrades gracefully when the VAPID key is not configured.
