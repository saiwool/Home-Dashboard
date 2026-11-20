# Project context

Shared household dashboard for Zac and his wife. Production: https://home-dashboard-ebon.vercel.app

Grok (Home) and Claude both work in this repo. Before starting, fetch and branch from the latest `main`. When a change lands, update this file in the same PR so the next person does not work from a stale picture. `README.md` is still the create-next-app stub. This file is the handoff.

## Stack

- Next.js 16 App Router, plain JavaScript (no TypeScript), Tailwind 4
- Supabase via `@supabase/supabase-js` and `@supabase/ssr`
- Browser client: `lib/supabase/client.js`. Server client: `lib/supabase/server.js`
- Session refresh lives in `proxy.js` (Next.js 16 proxy, not `middleware.js`). The dashboard layout sends anonymous visitors to `/login`
- Auth is email and password. Do not replace that with Google sign-in. Google Calendar is a separate server-side connection for each person
- Existing public env vars, already set on Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Google Calendar adds three server-only env vars, listed in the Google Calendar section. Do not prefix them with `NEXT_PUBLIC_` and do not add any others unless asked
- Household "today" on the server overview uses `America/Chicago` (`DEFAULT_TZ` in `lib/dateUtils.js`). Client pages use the browser timezone through `app/hooks/useTimezone.js`
- There is no `household_id`. Both logged-in users are the household. Authenticated reads are shared
- Theme is per user: Light, Dark, or System, stored on `user_preferences`. `app/layout.js` puts `class="dark"` on `<html>` for that signed-in user only. A cookie (`hd-theme`, `hd-theme-user`, `hd-resolved`) is just a paint cache and is ignored when it belongs to the other account. Sign-out clears it. Do not bring back the old `prefers-color-scheme` block in `app/globals.css`; System mode adds the class from the device instead

## Deploy

Vercel deploys production from `main`. Do not push schema-dependent work straight to `main`. Open a pull request so Vercel can build a preview while the new tables are still missing. After Zac runs the SQL and the PR is merged, production updates from `main`.

The UI must keep working when a new table does not exist yet. `lib/dbErrors.js` detects a missing relation, and `app/components/QueryState.js` shows a setup message instead of crashing the page.

## Schema

`supabase/schema.sql` is the full picture for a fresh database. Do not paste that whole file into a database that already has data. Policies there are not written to be re-run.

Incremental changes go in `supabase/migrations/<date>_<name>.sql` and must also be copied into `supabase/schema.sql`. Migrations should be idempotent where practical (`create table if not exists`, `drop policy if exists`, `create index if not exists`).

Migrations Zac runs by hand, in order, if they are not already applied:

1. `supabase/migrations/20261117_new_tabs.sql` — shopping, meals, maintenance, projects, date nights
2. `supabase/migrations/20261118_account_preferences.sql` — profile name columns, profile insert/update policies, and per-user preferences
3. `supabase/migrations/20261120_google_calendar.sql` — per-person Google connections, calendar choices, and event link columns. `20261118_google_calendar.sql` was never applied and is not in this repo. Do not run that old file

Account migration:

`supabase/migrations/20261118_account_preferences.sql`

Zac runs it by hand:

1. Open the Supabase project that backs the Vercel app.
2. Go to SQL Editor and start a new query.
3. Paste the entire file `supabase/migrations/20261118_account_preferences.sql`.
4. Run it once. It is safe to run again.
5. Confirm `profiles` has `first_name`, `last_name`, and `avatar_url`.
6. Confirm `user_preferences` exists, RLS is on, and the policies are select/insert/update for `auth.uid() = id` only.
7. Confirm both accounts have a `profiles` row and a `user_preferences` row. The migration backfills them from `auth.users`.
8. Refresh the dashboard and open Account. Until this SQL has been run, profile and preference saves show the Supabase error plus the name of this file. Email and password changes do not need the new table.

Google Calendar migration:

`supabase/migrations/20261120_google_calendar.sql`

Zac runs it by hand:

1. Open the Supabase project that backs the Vercel app.
2. Go to SQL Editor and start a new query.
3. Paste the entire file `supabase/migrations/20261120_google_calendar.sql`.
4. Run it once. It is safe to run again.
5. Confirm `google_connections` and `google_calendars` exist, and that `calendar_events` has `google_calendar_id`, `google_event_id`, and `origin`.
6. Confirm the unique index is `calendar_events_google_identity_key` on `(google_calendar_id, google_event_id)`.
7. Do not add `google_connections` to realtime. It holds encrypted tokens.
8. Refresh Calendar. Until this SQL has been run, Google shows a setup message and household events still load.

Current migration for the household tabs:

`supabase/migrations/20261117_new_tabs.sql`

Zac runs it by hand:

1. Open the Supabase project that backs the Vercel app.
2. Go to SQL Editor and start a new query.
3. Paste the entire file `supabase/migrations/20261117_new_tabs.sql`.
4. Run it once. It is safe to run again.
5. Confirm these tables exist: `shopping_items`, `meals`, `maintenance_tasks`, `house_projects`, `date_nights`.
6. Confirm `shopping_items` is in the `supabase_realtime` publication. The migration adds it when that publication exists.
7. Refresh the dashboard. Until this SQL has been run, the new tabs show a setup message and Overview still loads.

### Tables

| Table | Used by | Notes |
| --- | --- | --- |
| `profiles` | Account | Names and avatar. Any signed-in user can read them. Insert and update are own-row only (`auth.uid() = id`, update also has `with check`) |
| `user_preferences` | Account | One row per user: `theme` (`light`, `dark`, `system`) and `default_tab`. Select, insert, and update are own-row only. The other person cannot read this row |
| `calendar_events` | Calendar | Shared events. `origin = dashboard` was created in Home and stays if Google is disconnected. `origin = google` was copied from Google and is removed when nobody still syncs that calendar. A linked row is unique on `(google_calendar_id, google_event_id)`, so With Baby selected by both people is stored once. The browser can insert and update ordinary fields on events that person created, and only when `google_event_id` is null. Google link columns are written by server routes |
| `budget_items` | Budget | Manual income and expenses |
| `agreements` | Agreements | Proposals the other person responds to |
| `cleaning_tasks` | Cleaning | Recurring. Delete is limited to the creator |
| `inbox_messages` | Inbox widget | Short notes between the two of you |
| `shopping_items` | Shopping | Realtime. Optional quantity and store/category |
| `meals` | Meals | One row per date and slot. Ingredients are jsonb |
| `maintenance_tasks` | Maintenance | Separate from cleaning. `next_due` is stored |
| `house_projects` | Projects | Backlog, not a today list |
| `date_nights` | Date nights | Ideas until `done_on` is set |
| `google_connections` | Calendar | One row per user (`user_id`). Encrypted refresh and access tokens. RLS: select and delete own row only. Token columns are not granted to `authenticated`. Server routes use the service role |
| `google_calendars` | Calendar | Calendars listed from that person's Google account. `selected` is the sync toggle. RLS: select and update own rows. `authenticated` can update only `selected` and `updated_at`. Deleting the connection cascades these rows |

New tables enable RLS. Any signed-in user can select, update, and delete. Inserts must set `created_by` to `auth.uid()`. Delete is shared on these new tables so either person can clear a shopping item or edit a row the other created. That is wider than `cleaning_tasks`, which only lets the creator delete.

## Tabs

| Tab | Route | State |
| --- | --- | --- |
| Overview | `/dashboard` | Greeting, week events, month net, cleaning overdue, proposals. Also tonight's dinner, unchecked shopping count, and maintenance that is overdue or due within 14 days. Opening Overview syncs Google unless that already happened in the last minute, then labels upcoming events with their calendar color |
| Calendar | `/dashboard/calendar` | Google Calendar-style month, week, day, and schedule views. Defaults to month and remembers the last view on this browser. Home-only events still work with no Google setup. After a person connects, they choose calendars and events sync both ways |
| Meals | `/dashboard/meals` | Monday–Sunday. Dinner is always shown. Breakfast and lunch are optional. A meal can send its ingredients to the shopping list |
| Shopping | `/dashboard/shopping` | Shared list with Realtime, check off, edit, clear checked |
| Date nights | `/dashboard/date-nights` | Ideas with category and cost. Pick one at random. Mark done with a date |
| Budget | `/dashboard/budget` | Manual. Leave this alone until the finance work below is explicitly started |
| Cleaning | `/dashboard/cleaning` | Recurring chores |
| Maintenance | `/dashboard/maintenance` | HVAC, detectors, oil changes, and similar. Frequencies: weekly, monthly, quarterly, semiannual, yearly, or a custom number of days. Marking done sets last done to today and recalculates next due. Optional assignee and notes. Overdue rows are highlighted |
| Projects | `/dashboard/projects` | Status idea / planned / in progress / done, plus priority, optional target date, and notes |
| Agreements | `/dashboard/agreements` | Household proposals |
| Documents | `/dashboard/documents` | Placeholder |
| Contacts | `/dashboard/home-contacts` | Placeholder |
| Inbox | Overview popup, `/dashboard/inbox` | Notes between the two accounts |
| Profile | `/dashboard/profile` | Account. Own display name, first and last name, avatar, email (confirmation email via `supabase.auth.updateUser`), password with a confirm field, theme, and default landing tab. The other person's name is listed and is read only. The same Google Calendar card as Calendar is here, for this login only. Sidebar and the mobile header have the same theme control |

Nav lives in `app/components/SidebarNav.js` and `app/components/MobileTabNav.js`.

## Google Calendar

Each signed-in person connects their own Google account. Zac and Sarah do this separately, from Calendar or Account. Login stays email and password.

Zac's shared calendar to turn on, along with the personal calendars he wants, is With Baby:

`l1662ekg9q175mvofks89hs12c@group.calendar.google.com`

The first time a calendar is seen, Home turns on calendars that person owns, their primary calendar, and With Baby when Google shares it with that account. Holiday and birthday feeds stay off until someone checks them. Either person can change their own checkboxes later.

If both people select the same Google calendar, sync keeps a single `calendar_events` row for each `(google_calendar_id, google_event_id)`. The household calendar shows that event once, with the calendar color and name. A second personal calendar with its own copy is a different calendar id, so it stays separate.

Creating, editing, or deleting a Google-linked event goes through `app/api/calendar/events` and is written back to Google with `sendUpdates=none`. The write uses a connected account that can edit that calendar, preferring the person who clicked. Events with no Google id still save through the browser Supabase client, and only the creator can edit or delete those. Disconnecting removes that person's tokens and drops Google-copied events that nobody else still syncs. Events created in Home stay.

Opening Calendar or Overview syncs selected calendars. A sync in the last minute is skipped unless someone presses Sync now. The window is the past year through about 18 months ahead. Google events that disappear inside that window are removed here. Older linked rows outside the window are left alone.

The Calendar screen is a grid, not a list. The toolbar has Create, Today, previous and next, the current month or day, and Month / Week / Day / Schedule. Week and day use a Sunday–Saturday hourly grid with an all-day row, overlapping events side by side, and a red line on today. Month cells show color-coded pills and a `+ more` list. Schedule is a compact agenda. Clicking an empty day or hour opens the event form with that date and time. Clicking an event opens details with Edit and Delete. Google-backed edits and deletes still go through `app/api/calendar/events`.

A collapsible sidebar (a drawer on a phone) has a mini month, color checkboxes that only hide calendars in this browser, and Sync now. Manage Google calendars opens the same connect, calendar-choice, import, and disconnect card used on Account. Hiding a calendar does not change `google_calendars.selected` and does not disconnect Google. There is no location column; details show the stored notes.

If `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, or `SUPABASE_SERVICE_ROLE_KEY` is missing, or the migration has not been run, Calendar keeps working and the card explains that in plain language. It does not list the variable names.

Code:

- OAuth, Calendar API, and sync live in `lib/google/` and `app/api/google/*`.
- Redirect URI is `${origin}/api/google/callback`. Google will accept only these two, with no trailing slash:
  - `https://home-dashboard-ebon.vercel.app/api/google/callback`
  - `http://localhost:3000/api/google/callback`
- Other hosts, including Vercel preview URLs, can use a connection made on the home site but cannot start OAuth.
- Scopes requested, space-separated: `openid`, `email`, `https://www.googleapis.com/auth/calendar.calendarlist.readonly`, `https://www.googleapis.com/auth/calendar.events`.

### Env vars for Vercel Production and Preview

Add all three. Then redeploy so the running app picks them up. Leave the existing Supabase URL and anon key as they are.

| Name | Where the value comes from |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Google Cloud OAuth client |
| `GOOGLE_CLIENT_SECRET` | That same OAuth client. Rotating it means each person connects again, because tokens are encrypted with it |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` secret |

There is no `GOOGLE_CALENDAR_ID`. Calendar choice is stored per user in `google_calendars`.

`SUPABASE_SERVICE_ROLE_KEY` stays server-only. Never put it in client code, never prefix it with `NEXT_PUBLIC_`, and never paste it into the browser. The anon key cannot read token columns.

### Database

Run `supabase/migrations/20261120_google_calendar.sql` in the Supabase SQL Editor before connecting. If Calendar still says the database needs an update after a successful run, wait a few seconds and refresh.

### Create the Google OAuth client

Do this while signed in to Google as zachj8@gmail.com, unless Sarah is creating the Cloud project. Either Google account can be the Cloud owner. Each person still connects their own account inside Home.

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project named `Home Dashboard`, or open the existing one.
3. Open **APIs & Services → Library**, search for **Google Calendar API**, and enable it.
4. Open **APIs & Services → OAuth consent screen** (Google’s newer label is **Google Auth Platform**).
5. If asked for a user type, choose **External**. Set the app name to `Home Dashboard`, and set the user support email and developer contact to zachj8@gmail.com.
6. Leave the publishing status on **Testing** until you are ready to publish.
7. Add test users: `zachj8@gmail.com` and `beyondthepoolofstars@gmail.com`.
8. Add the scopes `openid`, `email`, `https://www.googleapis.com/auth/calendar.calendarlist.readonly`, and `https://www.googleapis.com/auth/calendar.events`.
9. Open **APIs & Services → Credentials → Create credentials → OAuth client ID**.
10. Choose **Web application**. Name it `Home Dashboard`.
11. Leave **Authorized JavaScript origins** empty. This app uses a server redirect, not a browser token.
12. Under **Authorized redirect URIs**, add these two values exactly, with no trailing slash:
    - `https://home-dashboard-ebon.vercel.app/api/google/callback`
    - `http://localhost:3000/api/google/callback`
13. Create the client and copy the client id and client secret into the Vercel env vars above.

### Testing mode expires after 7 days

While the consent screen stays in **Testing**, Google expires the refresh token 7 days after consent. Home then asks that person to reconnect. That is expected. Publish the app, then reconnect, to stop the 7-day expiry. Publishing does not by itself remove Google’s unverified-app warning. Calendar access is a sensitive scope. For this household, continue past the warning. The unverified-app user cap does not matter for two people.

## Planned next work

1. **Deferred:** finance, Plaid, and a Rocket Money CSV history import. Do not start these until someone explicitly asks. Budget stays manual. Google Calendar sync is in place.

## While you are in the code

- Match the existing iOS-style UI: white cards, `#007AFF`, `#1C1C1E`, rounded-2xl, the shared `card` shadow. Dark mode recolors those utilities from `app/globals.css` under `html.dark`. New UI should keep using that palette so it follows the class.
- Account saves must surface `error.message` from Supabase. Do not show a success state when the write returns an error or zero rows.
- Keep commits small. One tab or one concern is enough.
- Read `node_modules/next/dist/docs/` before changing framework APIs. This Next.js version differs from older App Router habits, including `proxy.js` instead of `middleware.js`.
- After you change tabs, schema, deploy steps, or the plan, update this file before you open or finish the pull request.
