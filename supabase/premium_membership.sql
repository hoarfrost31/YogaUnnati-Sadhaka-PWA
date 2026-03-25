alter table public.profiles
add column if not exists membership_tier text not null default 'free';

alter table public.profiles
drop constraint if exists profiles_membership_tier_check;

alter table public.profiles
add constraint profiles_membership_tier_check
check (membership_tier in ('free', 'premium'));
