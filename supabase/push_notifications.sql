create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  endpoint text not null unique,
  p256dh text,
  auth text,
  enabled boolean not null default true,
  timezone text,
  user_agent text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.push_subscriptions
  add column if not exists timezone text;

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

create index if not exists push_subscriptions_timezone_idx
  on public.push_subscriptions (timezone);

create table if not exists public.push_notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  notification_type text not null,
  local_date date not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (subscription_id, notification_type, local_date)
);

alter table public.push_notification_log enable row level security;

create or replace function public.set_push_subscriptions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_push_subscriptions_updated_at on public.push_subscriptions;

create trigger set_push_subscriptions_updated_at
before update on public.push_subscriptions
for each row
execute function public.set_push_subscriptions_updated_at();

alter table public.push_subscriptions enable row level security;

drop policy if exists "Users can read own push subscriptions" on public.push_subscriptions;
create policy "Users can read own push subscriptions"
on public.push_subscriptions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own push subscriptions" on public.push_subscriptions;
create policy "Users can insert own push subscriptions"
on public.push_subscriptions
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own push subscriptions" on public.push_subscriptions;
create policy "Users can update own push subscriptions"
on public.push_subscriptions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
