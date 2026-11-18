-- Google Calendar connection and links from dashboard events.
-- Safe to re-run in the Supabase SQL Editor (Dashboard → SQL → New query).
-- Run this file, not the full supabase/schema.sql, on a database that already has data.
-- Do not add google_calendar_connection to supabase_realtime. It holds encrypted tokens.

alter table public.calendar_events
  add column if not exists start_time timestamptz,
  add column if not exists end_time timestamptz,
  add column if not exists google_event_id text;

create unique index if not exists calendar_events_google_event_id_key
  on public.calendar_events (google_event_id);

comment on column public.calendar_events.google_event_id is
  'Google Calendar event id when this row is linked. Null means the event exists only in the dashboard until it is imported.';

create table if not exists public.google_calendar_connection (
  id smallint primary key default 1,
  connected_by uuid references auth.users(id) on delete set null,
  google_email text,
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  calendar_id text,
  scope text,
  token_status text not null default 'active',
  last_synced_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint google_calendar_connection_id_check check (id = 1),
  constraint google_calendar_connection_token_status_check check (token_status in ('active', 'needs_reconnect'))
);

alter table public.google_calendar_connection
  add column if not exists connected_by uuid references auth.users(id) on delete set null,
  add column if not exists google_email text,
  add column if not exists refresh_token text,
  add column if not exists access_token text,
  add column if not exists access_token_expires_at timestamptz,
  add column if not exists calendar_id text,
  add column if not exists scope text,
  add column if not exists token_status text not null default 'active',
  add column if not exists last_synced_at timestamptz,
  add column if not exists connected_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'google_calendar_connection_id_check'
  ) then
    alter table public.google_calendar_connection
      add constraint google_calendar_connection_id_check check (id = 1);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'google_calendar_connection_token_status_check'
  ) then
    alter table public.google_calendar_connection
      add constraint google_calendar_connection_token_status_check
      check (token_status in ('active', 'needs_reconnect'));
  end if;
end $$;

alter table public.google_calendar_connection enable row level security;

revoke all on table public.google_calendar_connection from PUBLIC, anon, authenticated;

comment on table public.google_calendar_connection is
  'Single household Google connection. Tokens are encrypted by the app. No policies, so anon and authenticated cannot read or write it. Server routes use the service role after checking the signed-in user.';
