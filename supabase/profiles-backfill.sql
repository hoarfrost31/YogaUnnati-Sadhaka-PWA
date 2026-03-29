insert into public.profiles (id, display_name, avatar_url)
select
  au.id,
  coalesce(nullif(trim(au.raw_user_meta_data ->> 'display_name'), ''), split_part(au.email, '@', 1), 'Yoga Member') as display_name,
  null as avatar_url
from auth.users au
left join public.profiles p on p.id = au.id
where p.id is null;
