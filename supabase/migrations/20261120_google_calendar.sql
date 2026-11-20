-- Per-person Google Calendar connections, calendar choices, and shared-event dedupe.
-- Safe to re-run in the Supabase SQL Editor (Dashboard → SQL → New query).
-- Run this file, not the full supabase/schema.sql, on a database that already has data.
-- 20261118_google_calendar.sql was never applied. This file is the one to run.
-- It also drops that old single-row table if a preview database created it.
-- Do not add google_connections to supabase_realtime. It holds encrypted tokens.

drop table if exists public.google_calendar_connection;

alter table public.calendar_events
  add column if not exists start_time timestamptz,
  add column if not exists end_time timestamptz,
  add column if not exists google_calendar_id text,
  add column if not exists google_event_id text,
  add column if not exists calendar_name text,
  add column if not exists calendar_color text,
  add column if not exists google_owner_id uuid references auth.users(id) on delete set null,
  add column if not exists origin text;

update public.calendar_events
set origin = 'dashboard'
where origin is null;

alter table public.calendar_events
  alter column origin set default 'dashboard';

alter table public.calendar_events
  alter column origin set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'calendar_events_origin_check'
  ) then
    alter table public.calendar_events
      add constraint calendar_events_origin_check
      check (origin in ('dashboard', 'google'));
  end if;
end $$;

-- The unfinished draft used one unique google_event_id. Shared calendars need
-- the calendar id in the key, and several dashboard-only rows have a null id.
drop index if exists public.calendar_events_google_event_id_key;

create unique index if not exists calendar_events_google_identity_key
  on public.calendar_events (google_calendar_id, google_event_id);

comment on column public.calendar_events.google_calendar_id is
  'Google calendar id for a linked event. Null means the event exists only in Home.';

comment on column public.calendar_events.google_event_id is
  'Google event id. Together with google_calendar_id this is unique, so a shared calendar selected by both people is stored once.';

comment on column public.calendar_events.origin is
  'dashboard events were created in Home and are kept if Google is disconnected. google events were copied in from Google and leave the household view when nobody still syncs that calendar.';

-- Browser roles can read every column, including the labels, but cannot write
-- the Google link. Server routes use the service role for those fields.
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

drop policy if exists "Users can update their own events" on public.calendar_events;
create policy "Users can update their own events" on public.calendar_events
  for update using (auth.uid() = created_by and google_event_id is null)
  with check (auth.uid() = created_by and google_event_id is null);

drop policy if exists "Users can delete their own events" on public.calendar_events;
create policy "Users can delete their own events" on public.calendar_events
  for delete using (auth.uid() = created_by and google_event_id is null);

create table if not exists public.google_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  google_email text,
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  scope text,
  token_status text not null default 'active',
  last_synced_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_connections
  add column if not exists google_email text,
  add column if not exists refresh_token text,
  add column if not exists access_token text,
  add column if not exists access_token_expires_at timestamptz,
  add column if not exists scope text,
  add column if not exists token_status text not null default 'active',
  add column if not exists last_synced_at timestamptz,
  add column if not exists connected_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'google_connections_token_status_check'
  ) then
    alter table public.google_connections
      add constraint google_connections_token_status_check
      check (token_status in ('active', 'needs_reconnect'));
  end if;
end $$;

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

drop policy if exists "Users can view their own Google connection" on public.google_connections;
create policy "Users can view their own Google connection" on public.google_connections
  for select using (auth.uid() = user_id);

drop policy if exists "Users can delete their own Google connection" on public.google_connections;
create policy "Users can delete their own Google connection" on public.google_connections
  for delete using (auth.uid() = user_id);

comment on table public.google_connections is
  'One Google account per household user. Refresh and access tokens are encrypted with GOOGLE_CLIENT_SECRET. Authenticated users can read their own status and disconnect. They cannot read token columns or another person''s row. Server routes use the service role to store tokens.';

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
  updated_at timestamptz not null default now()
);

alter table public.google_calendars
  add column if not exists summary text not null default '',
  add column if not exists description text,
  add column if not exists background_color text,
  add column if not exists foreground_color text,
  add column if not exists access_role text,
  add column if not exists primary_calendar boolean not null default false,
  add column if not exists selected boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'google_calendars_user_fk'
  ) then
    alter table public.google_calendars
      add constraint google_calendars_user_fk
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'google_calendars_connection_fk'
  ) then
    alter table public.google_calendars
      add constraint google_calendars_connection_fk
      foreign key (user_id) references public.google_connections(user_id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'google_calendars_user_calendar_key'
  ) then
    alter table public.google_calendars
      add constraint google_calendars_user_calendar_key
      unique (user_id, google_calendar_id);
  end if;
end $$;

create index if not exists google_calendars_user_selected_idx
  on public.google_calendars (user_id, selected);

alter table public.google_calendars enable row level security;

revoke all on table public.google_calendars from public, anon, authenticated;

grant select on table public.google_calendars to authenticated;

grant update (selected, updated_at) on table public.google_calendars to authenticated;

drop policy if exists "Users can view their own Google calendars" on public.google_calendars;
create policy "Users can view their own Google calendars" on public.google_calendars
  for select using (auth.uid() = user_id);

drop policy if exists "Users can update their own Google calendars" on public.google_calendars;
create policy "Users can update their own Google calendars" on public.google_calendars
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table public.google_calendars is
  'Calendars discovered for one user. selected is the household sync toggle. Token storage stays on google_connections. Server routes write the list; the signed-in user can turn selected on or off for their own rows.';

notify pgrst, 'reload schema';
