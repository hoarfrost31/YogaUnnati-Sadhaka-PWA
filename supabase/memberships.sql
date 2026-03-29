create table if not exists public.memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_code text not null default 'none' check (plan_code in ('none', 'app', 'online', 'studio')),
  status text not null default 'inactive' check (status in ('inactive', 'pending', 'active', 'past_due', 'cancelled', 'expired')),
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly')),
  started_at timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  provider_customer_id text,
  provider_subscription_id text,
  provider_status text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.memberships add column if not exists started_at timestamptz;
alter table public.memberships add column if not exists current_period_end timestamptz;
alter table public.memberships add column if not exists cancel_at_period_end boolean not null default false;
alter table public.memberships add column if not exists provider_customer_id text;
alter table public.memberships add column if not exists provider_subscription_id text;
alter table public.memberships add column if not exists provider_status text;
alter table public.memberships add column if not exists created_at timestamptz not null default timezone('utc', now());
alter table public.memberships add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.memberships
  drop constraint if exists memberships_status_check;

alter table public.memberships
  add constraint memberships_status_check
  check (status in ('inactive', 'pending', 'active', 'past_due', 'cancelled', 'expired'));

create or replace function public.touch_memberships_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists memberships_set_updated_at on public.memberships;
create trigger memberships_set_updated_at
before update on public.memberships
for each row
execute procedure public.touch_memberships_updated_at();

alter table public.memberships enable row level security;

drop policy if exists "Users can read own membership" on public.memberships;
create policy "Users can read own membership"
on public.memberships
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own inactive membership shell" on public.memberships;
create policy "Users can insert own inactive membership shell"
on public.memberships
for insert
with check (
  auth.uid() = user_id
  and plan_code = 'none'
  and status = 'inactive'
);

drop policy if exists "Users can update own membership shell" on public.memberships;

drop policy if exists "Admin can read all memberships" on public.memberships;
create policy "Admin can read all memberships"
on public.memberships
for select
using ((auth.jwt() ->> 'email') = 'nkapse27@gmail.com');

drop policy if exists "Admin can insert memberships" on public.memberships;
create policy "Admin can insert memberships"
on public.memberships
for insert
with check ((auth.jwt() ->> 'email') = 'nkapse27@gmail.com');

drop policy if exists "Admin can update memberships" on public.memberships;
create policy "Admin can update memberships"
on public.memberships
for update
using ((auth.jwt() ->> 'email') = 'nkapse27@gmail.com')
with check ((auth.jwt() ->> 'email') = 'nkapse27@gmail.com');
