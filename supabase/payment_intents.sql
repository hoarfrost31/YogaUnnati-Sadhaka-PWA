create extension if not exists pgcrypto;

create table if not exists public.payment_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text,
  user_phone text,
  plan_code text not null check (plan_code in ('app', 'online', 'studio')),
  provider text not null default 'cashfree_link',
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'cancelled', 'expired')),
  provider_link_id text,
  provider_payment_id text,
  provider_reference text,
  provider_payload jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.payment_intents add column if not exists user_email text;
alter table public.payment_intents add column if not exists user_phone text;
alter table public.payment_intents add column if not exists provider text not null default 'cashfree_link';
alter table public.payment_intents add column if not exists status text not null default 'pending';
alter table public.payment_intents add column if not exists provider_link_id text;
alter table public.payment_intents add column if not exists provider_payment_id text;
alter table public.payment_intents add column if not exists provider_reference text;
alter table public.payment_intents add column if not exists provider_payload jsonb;
alter table public.payment_intents add column if not exists created_at timestamptz not null default timezone('utc', now());
alter table public.payment_intents add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.payment_intents drop constraint if exists payment_intents_status_check;
alter table public.payment_intents
  add constraint payment_intents_status_check
  check (status in ('pending', 'paid', 'failed', 'cancelled', 'expired'));

create or replace function public.touch_payment_intents_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists payment_intents_set_updated_at on public.payment_intents;
create trigger payment_intents_set_updated_at
before update on public.payment_intents
for each row
execute procedure public.touch_payment_intents_updated_at();

alter table public.payment_intents enable row level security;

drop policy if exists "Users can read own payment intents" on public.payment_intents;
create policy "Users can read own payment intents"
on public.payment_intents
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own pending payment intents" on public.payment_intents;
create policy "Users can insert own pending payment intents"
on public.payment_intents
for insert
with check (
  auth.uid() = user_id
  and provider = 'cashfree_link'
  and status = 'pending'
);

drop policy if exists "Users can update own pending payment intents" on public.payment_intents;
create policy "Users can update own pending payment intents"
on public.payment_intents
for update
using (auth.uid() = user_id and status = 'pending')
with check (auth.uid() = user_id);

drop policy if exists "Admin can read all payment intents" on public.payment_intents;
create policy "Admin can read all payment intents"
on public.payment_intents
for select
using ((auth.jwt() ->> 'email') = 'nkapse27@gmail.com');

drop policy if exists "Admin can update payment intents" on public.payment_intents;
create policy "Admin can update payment intents"
on public.payment_intents
for update
using ((auth.jwt() ->> 'email') = 'nkapse27@gmail.com')
with check ((auth.jwt() ->> 'email') = 'nkapse27@gmail.com');
