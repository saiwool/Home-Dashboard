-- Run this in your Supabase SQL editor to set up the database schema.

-- Profiles (extends auth.users)
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  display_name text,
  first_name text,
  last_name text,
  avatar_url text,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can view all profiles" on public.profiles
  for select using (auth.uid() is not null);

create policy "Users can insert their own profile" on public.profiles
  for insert with check (auth.uid() = id);

create policy "Users can update their own profile" on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

-- Backfill profiles for users created before trigger was set up (run once if needed):
-- insert into public.profiles (id, display_name)
-- select id, split_part(email, '@', 1) from auth.users
-- where id not in (select id from public.profiles)
-- on conflict (id) do nothing;

-- Per-user preferences. Readable and writable only by that user, so one
-- person's theme and landing tab cannot change the other's.
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

create policy "Users can view their own preferences" on public.user_preferences
  for select using (auth.uid() = id);

create policy "Users can insert their own preferences" on public.user_preferences
  for insert with check (auth.uid() = id);

create policy "Users can update their own preferences" on public.user_preferences
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

grant select, insert, update on table public.user_preferences to authenticated;

-- Auto-create profile and preferences on sign up
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

-- Calendar Events
-- google_calendar_id + google_event_id is unique so a shared calendar synced by
-- both people is stored once. origin = dashboard stays in Home if Google is
-- disconnected. origin = google is removed when nobody still syncs that calendar.
create table if not exists public.calendar_events (
  id uuid default gen_random_uuid() primary key,
  created_by uuid references auth.users(id) on delete cascade not null,
  title text not null,
  description text,
  start_date date not null,
  end_date date,
  all_day boolean default true,
  start_time timestamptz,
  end_time timestamptz,
  google_calendar_id text,
  google_event_id text,
  calendar_name text,
  calendar_color text,
  google_owner_id uuid references auth.users(id) on delete set null,
  origin text not null default 'dashboard' check (origin in ('dashboard', 'google')),
  created_at timestamptz default now()
);

alter table public.calendar_events enable row level security;

create policy "Authenticated users can view all events" on public.calendar_events
  for select using (auth.uid() is not null);

create policy "Users can insert their own events" on public.calendar_events
  for insert with check (auth.uid() = created_by);

create policy "Users can delete their own events" on public.calendar_events
  for delete using (auth.uid() = created_by and google_event_id is null);

create policy "Users can update their own events" on public.calendar_events
  for update using (auth.uid() = created_by and google_event_id is null)
  with check (auth.uid() = created_by and google_event_id is null);

create unique index if not exists calendar_events_google_identity_key
  on public.calendar_events (google_calendar_id, google_event_id);

comment on column public.calendar_events.google_event_id is
  'Google event id. Together with google_calendar_id this is unique, so a shared calendar selected by both people is stored once.';

revoke all on table public.calendar_events from anon, authenticated;

grant select on table public.calendar_events to authenticated;

grant insert (
  id,
  created_by,
  title,
  description,
  start_date,
  end_date,
  all_day,
  start_time,
  end_time,
  created_at
) on table public.calendar_events to authenticated;

grant update (
  title,
  description,
  start_date,
  end_date,
  all_day,
  start_time,
  end_time
) on table public.calendar_events to authenticated;

grant delete on table public.calendar_events to authenticated;

-- One Google account per household user. Tokens are encrypted by the app.
-- Authenticated users can read their own status columns and disconnect.
-- They cannot read token columns. Server routes use the service role.
create table if not exists public.google_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  google_email text,
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  scope text,
  token_status text not null default 'active' check (token_status in ('active', 'needs_reconnect')),
  last_synced_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_connections enable row level security;

revoke all on table public.google_connections from public, anon, authenticated;

grant select (
  user_id,
  google_email,
  scope,
  token_status,
  last_synced_at,
  connected_at,
  updated_at
) on table public.google_connections to authenticated;

grant delete on table public.google_connections to authenticated;

create policy "Users can view their own Google connection" on public.google_connections
  for select using (auth.uid() = user_id);

create policy "Users can delete their own Google connection" on public.google_connections
  for delete using (auth.uid() = user_id);

comment on table public.google_connections is
  'One Google account per household user. Refresh and access tokens are encrypted with GOOGLE_CLIENT_SECRET. Authenticated users can read their own status and disconnect. Server routes use the service role to store tokens.';

-- Calendars discovered for one user. selected is the household sync toggle.
create table if not exists public.google_calendars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  google_calendar_id text not null,
  summary text not null default '',
  description text,
  background_color text,
  foreground_color text,
  access_role text,
  primary_calendar boolean not null default false,
  selected boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint google_calendars_user_fk foreign key (user_id) references auth.users(id) on delete cascade,
  constraint google_calendars_connection_fk foreign key (user_id) references public.google_connections(user_id) on delete cascade,
  constraint google_calendars_user_calendar_key unique (user_id, google_calendar_id)
);

create index if not exists google_calendars_user_selected_idx
  on public.google_calendars (user_id, selected);

alter table public.google_calendars enable row level security;

revoke all on table public.google_calendars from public, anon, authenticated;

grant select on table public.google_calendars to authenticated;

grant update (selected, updated_at) on table public.google_calendars to authenticated;

create policy "Users can view their own Google calendars" on public.google_calendars
  for select using (auth.uid() = user_id);

create policy "Users can update their own Google calendars" on public.google_calendars
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table public.google_calendars is
  'Calendars discovered for one user. selected is the household sync toggle. Server routes write the list; the signed-in user can change selected on their own rows.';

-- Budget Items
create table if not exists public.budget_items (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  amount numeric(10, 2) not null,
  category text not null default 'General',
  type text not null check (type in ('income', 'expense')),
  item_date date not null default current_date,
  created_at timestamptz default now()
);

alter table public.budget_items enable row level security;

create policy "Authenticated users can view all budget items" on public.budget_items
  for select using (auth.uid() is not null);

create policy "Users can insert their own budget items" on public.budget_items
  for insert with check (auth.uid() = user_id);

create policy "Users can delete their own budget items" on public.budget_items
  for delete using (auth.uid() = user_id);

-- Agreements
create table if not exists public.agreements (
  id uuid default gen_random_uuid() primary key,
  created_by uuid references auth.users(id) on delete cascade not null,
  title text not null,
  content text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  responded_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.agreements enable row level security;

create policy "Authenticated users can view all agreements" on public.agreements
  for select using (auth.uid() is not null);

create policy "Users can create agreements" on public.agreements
  for insert with check (auth.uid() = created_by);

create policy "Users can update agreements they did not create" on public.agreements
  for update using (auth.uid() != created_by);

create policy "Users can delete their own agreements" on public.agreements
  for delete using (auth.uid() = created_by);

-- Cleaning Tasks
create table if not exists public.cleaning_tasks (
  id uuid default gen_random_uuid() primary key,
  created_by uuid references auth.users(id) on delete cascade not null,
  assigned_to uuid references auth.users(id),
  name text not null,
  frequency text not null default 'weekly' check (frequency in ('daily', 'weekly', 'biweekly', 'monthly')),
  last_done date,
  next_due date,
  created_at timestamptz default now()
);

alter table public.cleaning_tasks enable row level security;

create policy "Authenticated users can view all cleaning tasks" on public.cleaning_tasks
  for select using (auth.uid() is not null);

create policy "Users can insert cleaning tasks" on public.cleaning_tasks
  for insert with check (auth.uid() = created_by);

create policy "Authenticated users can update cleaning tasks" on public.cleaning_tasks
  for update using (auth.uid() is not null);

create policy "Users can delete their own cleaning tasks" on public.cleaning_tasks
  for delete using (auth.uid() = created_by);

-- Inbox Messages
create table if not exists public.inbox_messages (
  id uuid default gen_random_uuid() primary key,
  from_user_id uuid references auth.users(id) on delete cascade not null,
  to_user_id uuid references auth.users(id) on delete cascade not null,
  subject text not null,
  body text not null,
  emoji text default '💌',
  created_at timestamptz default now(),
  expires_at timestamptz,
  archived_at timestamptz
);

alter table public.inbox_messages enable row level security;

create policy "Users can view their own messages" on public.inbox_messages
  for select using (auth.uid() = from_user_id or auth.uid() = to_user_id);

create policy "Users can send messages" on public.inbox_messages
  for insert with check (auth.uid() = from_user_id);

create policy "Recipients can archive messages" on public.inbox_messages
  for update using (auth.uid() = to_user_id);

create policy "Senders can delete their messages" on public.inbox_messages
  for delete using (auth.uid() = from_user_id);

-- Safe if the profiles table already existed without these columns.
alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name text;
alter table public.profiles add column if not exists avatar_url text;

-- Shopping list
-- Shared by every signed-in household member. Either person can check off,
-- edit, and clear items, including ones the other person added.
create table if not exists public.shopping_items (
  id uuid default gen_random_uuid() primary key,
  created_by uuid references auth.users(id) on delete cascade not null,
  name text not null,
  quantity text,
  store text,
  checked boolean not null default false,
  checked_at timestamptz,
  created_at timestamptz default now()
);

alter table public.shopping_items enable row level security;

create policy "Authenticated users can view shopping items" on public.shopping_items
  for select using (auth.uid() is not null);

create policy "Users can insert shopping items" on public.shopping_items
  for insert with check (auth.uid() = created_by);

create policy "Authenticated users can update shopping items" on public.shopping_items
  for update using (auth.uid() is not null);

create policy "Authenticated users can delete shopping items" on public.shopping_items
  for delete using (auth.uid() is not null);

create index if not exists shopping_items_checked_created_idx
  on public.shopping_items (checked, created_at);

-- Realtime so both people see adds, checks, and clears immediately.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'shopping_items'
     ) then
    alter publication supabase_realtime add table public.shopping_items;
  end if;
end $$;

-- Meals
-- One row per day and slot. Ingredients are sent to the shopping list from the app.
create table if not exists public.meals (
  id uuid default gen_random_uuid() primary key,
  created_by uuid references auth.users(id) on delete cascade not null,
  meal_date date not null,
  slot text not null default 'dinner' check (slot in ('breakfast', 'lunch', 'dinner')),
  title text not null,
  notes text,
  ingredients jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  constraint meals_one_per_slot unique (meal_date, slot)
);

alter table public.meals enable row level security;

create policy "Authenticated users can view meals" on public.meals
  for select using (auth.uid() is not null);

create policy "Users can insert meals" on public.meals
  for insert with check (auth.uid() = created_by);

create policy "Authenticated users can update meals" on public.meals
  for update using (auth.uid() is not null);

create policy "Authenticated users can delete meals" on public.meals
  for delete using (auth.uid() is not null);

create index if not exists meals_meal_date_idx on public.meals (meal_date);

-- Maintenance
-- Home and life upkeep, separate from cleaning. Next due is stored so the
-- list can be sorted without recomputing a frequency on every read.
create table if not exists public.maintenance_tasks (
  id uuid default gen_random_uuid() primary key,
  created_by uuid references auth.users(id) on delete cascade not null,
  assigned_to uuid references auth.users(id),
  name text not null,
  frequency text not null default 'monthly' check (frequency in ('weekly', 'monthly', 'quarterly', 'semiannual', 'yearly', 'custom')),
  custom_days integer,
  last_done date,
  next_due date,
  notes text,
  created_at timestamptz default now(),
  constraint maintenance_tasks_custom_days_check check (
    frequency <> 'custom' or (custom_days is not null and custom_days > 0)
  )
);

alter table public.maintenance_tasks enable row level security;

create policy "Authenticated users can view maintenance tasks" on public.maintenance_tasks
  for select using (auth.uid() is not null);

create policy "Users can insert maintenance tasks" on public.maintenance_tasks
  for insert with check (auth.uid() = created_by);

create policy "Authenticated users can update maintenance tasks" on public.maintenance_tasks
  for update using (auth.uid() is not null);

create policy "Authenticated users can delete maintenance tasks" on public.maintenance_tasks
  for delete using (auth.uid() is not null);

create index if not exists maintenance_tasks_next_due_idx on public.maintenance_tasks (next_due);

-- House projects
-- A backlog, not a today list. Status moves from idea to done over time.
create table if not exists public.house_projects (
  id uuid default gen_random_uuid() primary key,
  created_by uuid references auth.users(id) on delete cascade not null,
  title text not null,
  status text not null default 'idea' check (status in ('idea', 'planned', 'in_progress', 'done')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  target_date date,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.house_projects enable row level security;

create policy "Authenticated users can view house projects" on public.house_projects
  for select using (auth.uid() is not null);

create policy "Users can insert house projects" on public.house_projects
  for insert with check (auth.uid() = created_by);

create policy "Authenticated users can update house projects" on public.house_projects
  for update using (auth.uid() is not null);

create policy "Authenticated users can delete house projects" on public.house_projects
  for delete using (auth.uid() is not null);

create index if not exists house_projects_status_idx on public.house_projects (status, priority);

-- Date nights
-- Ideas stay pickable until someone marks one done on a date.
create table if not exists public.date_nights (
  id uuid default gen_random_uuid() primary key,
  created_by uuid references auth.users(id) on delete cascade not null,
  title text not null,
  category text,
  cost_level text check (cost_level is null or cost_level in ('free', '$', '$$', '$$$')),
  notes text,
  done_on date,
  created_at timestamptz default now()
);

alter table public.date_nights enable row level security;

create policy "Authenticated users can view date nights" on public.date_nights
  for select using (auth.uid() is not null);

create policy "Users can insert date nights" on public.date_nights
  for insert with check (auth.uid() = created_by);

create policy "Authenticated users can update date nights" on public.date_nights
  for update using (auth.uid() is not null);

create policy "Authenticated users can delete date nights" on public.date_nights
  for delete using (auth.uid() is not null);

create index if not exists date_nights_done_on_idx on public.date_nights (done_on);
