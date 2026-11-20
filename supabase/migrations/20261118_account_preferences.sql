-- Account profile columns and per-user preferences.
-- Safe to re-run in the Supabase SQL Editor (Dashboard → SQL → New query).
-- Run this file, not the full supabase/schema.sql, on a database that already has data.

alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name text;
alter table public.profiles add column if not exists avatar_url text;

alter table public.profiles enable row level security;

drop policy if exists "Users can view all profiles" on public.profiles;
create policy "Users can view all profiles" on public.profiles
  for select using (auth.uid() is not null);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

-- One row per auth user. Other household members cannot read or change it.
create table if not exists public.user_preferences (
  id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'system' check (theme in ('light', 'dark', 'system')),
  default_tab text not null default 'overview' check (default_tab in (
    'overview', 'calendar', 'meals', 'shopping', 'date-nights', 'budget',
    'cleaning', 'maintenance', 'projects', 'agreements', 'documents',
    'home-contacts', 'inbox', 'profile'
  )),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

drop policy if exists "Users can view their own preferences" on public.user_preferences;
create policy "Users can view their own preferences" on public.user_preferences
  for select using (auth.uid() = id);

drop policy if exists "Users can insert their own preferences" on public.user_preferences;
create policy "Users can insert their own preferences" on public.user_preferences
  for insert with check (auth.uid() = id);

drop policy if exists "Users can update their own preferences" on public.user_preferences;
create policy "Users can update their own preferences" on public.user_preferences
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

grant select, insert, update on table public.user_preferences to authenticated;

insert into public.profiles (id, display_name)
select id, split_part(email, '@', 1)
from auth.users
where not exists (
  select 1 from public.profiles as existing where existing.id = auth.users.id
)
on conflict (id) do nothing;

insert into public.user_preferences (id)
select id from auth.users
on conflict (id) do nothing;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  insert into public.user_preferences (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

notify pgrst, 'reload schema';
