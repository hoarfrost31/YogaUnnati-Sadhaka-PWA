create table if not exists public.membership_cycles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_code text not null check (plan_code in ('app', 'online', 'studio')),
  status text not null check (status in ('active', 'past_due', 'cancelled', 'expired')),
  period_start timestamptz not null,
  period_end timestamptz,
  source text not null default 'payment',
  payment_intent_id uuid references public.payment_intents(id) on delete set null,
  provider_payment_id text,
  note text,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.membership_cycles add column if not exists payment_intent_id uuid references public.payment_intents(id) on delete set null;
alter table public.membership_cycles add column if not exists provider_payment_id text;
alter table public.membership_cycles add column if not exists note text;
alter table public.membership_cycles add column if not exists source text not null default 'payment';
alter table public.membership_cycles add column if not exists created_at timestamptz not null default timezone('utc', now());

create index if not exists membership_cycles_user_id_idx on public.membership_cycles(user_id);
create index if not exists membership_cycles_period_start_idx on public.membership_cycles(period_start desc);
create unique index if not exists membership_cycles_payment_intent_id_key on public.membership_cycles(payment_intent_id) where payment_intent_id is not null;

alter table public.membership_cycles enable row level security;

drop policy if exists "Users can read own membership cycles" on public.membership_cycles;
create policy "Users can read own membership cycles"
on public.membership_cycles
for select
using (auth.uid() = user_id);

drop policy if exists "Admin can read all membership cycles" on public.membership_cycles;
create policy "Admin can read all membership cycles"
on public.membership_cycles
for select
using ((auth.jwt() ->> 'email') = 'nkapse27@gmail.com');

drop policy if exists "Admin can insert membership cycles" on public.membership_cycles;
create policy "Admin can insert membership cycles"
on public.membership_cycles
for insert
with check ((auth.jwt() ->> 'email') = 'nkapse27@gmail.com');

drop policy if exists "Admin can update membership cycles" on public.membership_cycles;
create policy "Admin can update membership cycles"
on public.membership_cycles
for update
using ((auth.jwt() ->> 'email') = 'nkapse27@gmail.com')
with check ((auth.jwt() ->> 'email') = 'nkapse27@gmail.com');

insert into public.membership_cycles (
  user_id,
  plan_code,
  status,
  period_start,
  period_end,
  source,
  note
)
select
  m.user_id,
  m.plan_code,
  case
    when m.status in ('active', 'past_due', 'cancelled', 'expired') then m.status
    else 'active'
  end,
  m.started_at,
  m.current_period_end,
  'backfill',
  'Backfilled from memberships table'
from public.memberships m
where m.plan_code in ('app', 'online', 'studio')
  and m.started_at is not null
  and not exists (
    select 1
    from public.membership_cycles c
    where c.user_id = m.user_id
      and c.plan_code = m.plan_code
      and c.period_start = m.started_at
      and (
        (c.period_end is null and m.current_period_end is null)
        or c.period_end = m.current_period_end
      )
  );
