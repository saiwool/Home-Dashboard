-- Incremental migration for the shared household tabs.
-- Safe to re-run in the Supabase SQL Editor (Dashboard → SQL → New query).
-- Run this file, not the full supabase/schema.sql, on a database that already has data.

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

drop policy if exists "Authenticated users can view shopping items" on public.shopping_items;
create policy "Authenticated users can view shopping items" on public.shopping_items
  for select using (auth.uid() is not null);

drop policy if exists "Users can insert shopping items" on public.shopping_items;
create policy "Users can insert shopping items" on public.shopping_items
  for insert with check (auth.uid() = created_by);

drop policy if exists "Authenticated users can update shopping items" on public.shopping_items;
create policy "Authenticated users can update shopping items" on public.shopping_items
  for update using (auth.uid() is not null);

drop policy if exists "Authenticated users can delete shopping items" on public.shopping_items;
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

drop policy if exists "Authenticated users can view meals" on public.meals;
create policy "Authenticated users can view meals" on public.meals
  for select using (auth.uid() is not null);

drop policy if exists "Users can insert meals" on public.meals;
create policy "Users can insert meals" on public.meals
  for insert with check (auth.uid() = created_by);

drop policy if exists "Authenticated users can update meals" on public.meals;
create policy "Authenticated users can update meals" on public.meals
  for update using (auth.uid() is not null);

drop policy if exists "Authenticated users can delete meals" on public.meals;
create policy "Authenticated users can delete meals" on public.meals
  for delete using (auth.uid() is not null);

create index if not exists meals_meal_date_idx on public.meals (meal_date);
