select
  cron.unschedule('daily-class-reminders');

select
  cron.schedule(
    'send-class-reminders-quarter-hourly',
    '*/15 * * * *',
    $$
    select
      net.http_post(
        url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-class-reminders',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer YOUR_SUPABASE_ANON_KEY'
        ),
        body := '{}'::jsonb
      );
    $$
  );
