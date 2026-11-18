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
  for update using (auth.uid() = id);

-- Backfill profiles for users created before trigger was set up (run once if needed):
-- insert into public.profiles (id, display_name)
-- select id, split_part(email, '@', 1) from auth.users
-- where id not in (select id from public.profiles)
-- on conflict (id) do nothing;

-- Auto-create profile on sign up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Calendar Events
create table if not exists public.calendar_events (
  id uuid default gen_random_uuid() primary key,
  created_by uuid references auth.users(id) on delete cascade not null,
  title text not null,
  description text,
  start_date date not null,
  end_date date,
  all_day boolean default true,
  created_at timestamptz default now()
);

alter table public.calendar_events enable row level security;

create policy "Authenticated users can view all events" on public.calendar_events
  for select using (auth.uid() is not null);

create policy "Users can insert their own events" on public.calendar_events
  for insert with check (auth.uid() = created_by);

create policy "Users can delete their own events" on public.calendar_events
  for delete using (auth.uid() = created_by);

create policy "Users can update their own events" on public.calendar_events
  for update using (auth.uid() = created_by);

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

-- Profile migration (run after table creation if upgrading)
-- alter table public.profiles add column if not exists first_name text;
-- alter table public.profiles add column if not exists last_name text;
-- alter table public.profiles add column if not exists avatar_url text;

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
