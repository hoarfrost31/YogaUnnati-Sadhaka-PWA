alter table public.profiles
  add column if not exists login_disabled boolean not null default false;
