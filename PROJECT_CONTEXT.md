# Project context

Shared household dashboard for Zac and his wife. Production: https://home-dashboard-ebon.vercel.app

Grok (Home) and Claude both work in this repo. Before starting, fetch and branch from the latest `main`. When a change lands, update this file in the same PR so the next person does not work from a stale picture. `README.md` is still the create-next-app stub. This file is the handoff.

## Stack

- Next.js 16 App Router, plain JavaScript (no TypeScript), Tailwind 4
- Supabase via `@supabase/supabase-js` and `@supabase/ssr`
- Browser client: `lib/supabase/client.js`. Server client: `lib/supabase/server.js`
- Session refresh lives in `proxy.js` (Next.js 16 proxy, not `middleware.js`). The dashboard layout sends anonymous visitors to `/login`
- Auth is email and password. Do not change those auth settings. Google Calendar is a separate server-side OAuth flow and does not replace login
- Existing public env vars, already set on Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Google Calendar adds four server-only env vars, listed in the Google Calendar section. Do not add any others unless asked, and do not prefix the new ones with `NEXT_PUBLIC_`
- Household "today" on the server overview uses `America/Chicago` (`DEFAULT_TZ` in `lib/dateUtils.js`). Client pages use the browser timezone through `app/hooks/useTimezone.js`
- There is no `household_id`. Both logged-in users are the household. Authenticated reads are shared

## Deploy

Vercel deploys production from `main`. Do not push schema-dependent work straight to `main`. Open a pull request so Vercel can build a preview while the new tables are still missing. After Zac runs the SQL and the PR is merged, production updates from `main`.

The UI must keep working when a new table does not exist yet. `lib/dbErrors.js` detects a missing relation, and `app/components/QueryState.js` shows a setup message instead of crashing the page.

## Schema

`supabase/schema.sql` is the full picture for a fresh database. Do not paste that whole file into a database that already has data. Policies there are not written to be re-run.

Incremental changes go in `supabase/migrations/<date>_<name>.sql` and must also be copied into `supabase/schema.sql`. Migrations should be idempotent where practical (`create table if not exists`, `drop policy if exists`, `create index if not exists`).

Migrations, in order:

- `supabase/migrations/20261117_new_tabs.sql` — shopping, meals, maintenance, projects, date nights. Already the household-tabs migration.
- `supabase/migrations/20261118_google_calendar.sql` — Google Calendar link columns and the connection table. Run this one for the calendar sync.

Zac runs a migration by hand:

1. Open the Supabase project that backs the Vercel app.
2. Go to SQL Editor and start a new query.
3. Paste the entire migration file.
4. Run it once. These files are safe to run again.
5. For the tabs migration, confirm `shopping_items`, `meals`, `maintenance_tasks`, `house_projects`, and `date_nights` exist, and that `shopping_items` is in the `supabase_realtime` publication.
6. For the Google migration, confirm `google_calendar_connection` exists and `calendar_events` has `google_event_id`. Do not add `google_calendar_connection` to realtime.
7. Refresh the dashboard. Until the SQL for a feature has been run, that feature shows a setup message and the rest of the dashboard still loads.

### Tables

| Table | Used by | Notes |
| --- | --- | --- |
| `profiles` | Account | Created on signup |
| `calendar_events` | Calendar | Shared events. `google_event_id` is set once a row is linked to Google. Null means it exists only in the dashboard until someone imports it. `start_time` and `end_time` are set for timed events |
| `budget_items` | Budget | Manual income and expenses |
| `agreements` | Agreements | Proposals the other person responds to |
| `cleaning_tasks` | Cleaning | Recurring. Delete is limited to the creator |
| `inbox_messages` | Inbox widget | Short notes between the two of you |
| `shopping_items` | Shopping | Realtime. Optional quantity and store/category |
| `meals` | Meals | One row per date and slot. Ingredients are jsonb |
| `maintenance_tasks` | Maintenance | Separate from cleaning. `next_due` is stored |
| `house_projects` | Projects | Backlog, not a today list |
| `date_nights` | Date nights | Ideas until `done_on` is set |
| `google_calendar_connection` | Calendar sync | One household row. Refresh and access tokens are encrypted with `GOOGLE_CLIENT_SECRET`. RLS is on and there are no policies, so the browser cannot read or write it. Server routes use the service role only after `getUser()` confirms a signed-in household member |

New tables enable RLS. Any signed-in user can select, update, and delete. Inserts must set `created_by` to `auth.uid()`. Delete is shared on these new tables so either person can clear a shopping item or edit a row the other created. That is wider than `cleaning_tasks`, which only lets the creator delete.

## Tabs

| Tab | Route | State |
| --- | --- | --- |
| Overview | `/dashboard` | Greeting, week events, month net, cleaning overdue, proposals. Also tonight's dinner, unchecked shopping count, and maintenance that is overdue or due within 14 days. When Google is connected, upcoming events include the shared calendar |
| Calendar | `/dashboard/calendar` | Shared events. Supabase-only until Google is connected, then two-way with the shared Google calendar |
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
| Profile | `/dashboard/profile` | Name and avatar |

Nav lives in `app/components/SidebarNav.js` and `app/components/MobileTabNav.js`.

## Google Calendar

Two-way sync with the shared calendar named `with Baby`, owned by zachj8@gmail.com and shared with Zac's wife.

Calendar id: `l1662ekg9q175mvofks89hs12c@group.calendar.google.com`

Either signed-in person connects a Google account once. The refresh token is stored for the household, so the other person does not connect separately. The account that connects must be allowed to change events on that calendar. Creating, editing, or deleting an event in the dashboard writes it to Google. Opening Calendar or Overview pulls Google changes back into `calendar_events`. Existing dashboard events are not copied automatically. The Calendar tab has an **Import existing dashboard events to Google** button for that.

If the Google env vars are missing, or the migration has not been run, the Calendar tab keeps working with dashboard events and shows a Connect Google Calendar card instead of crashing.

Code:

- OAuth and Calendar API calls live in `lib/google/` and `app/api/google/*`. Event create, edit, and delete while connected go through `app/api/calendar/events`.
- Redirects that Google will accept are only `https://home-dashboard-ebon.vercel.app/api/google/callback` and `http://localhost:3000/api/google/callback`. Other hosts, including Vercel preview URLs, can use a connection made on the main site but cannot start OAuth.
- `sendUpdates=none` so edits do not email guests. Both people still see the event because they share the calendar.

### Env vars for Vercel Production and Preview

Add all four. Then redeploy so the running app picks them up. Leave the existing Supabase URL and anon key as they are.

| Name | Where the value comes from |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Google Cloud OAuth client |
| `GOOGLE_CLIENT_SECRET` | That same OAuth client. Rotating it means connecting Google Calendar again |
| `GOOGLE_CALENDAR_ID` | `l1662ekg9q175mvofks89hs12c@group.calendar.google.com` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` secret |

`SUPABASE_SERVICE_ROLE_KEY` is required. The refresh token is stored in `google_calendar_connection`, and that table has no policies, so the anon key cannot read it. The service role bypasses row level security. It must stay server-only. Never put it in client code, never prefix it with `NEXT_PUBLIC_`, and never paste it into the browser.

### Database

Run `supabase/migrations/20261118_google_calendar.sql` in the Supabase SQL Editor before connecting. If the Calendar tab still says the migration is needed after a successful run, wait a few seconds for the API schema cache to reload and refresh.

### Create the Google OAuth client

Do this while signed in to Google as zachj8@gmail.com.

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project named `Home Dashboard` (project picker at the top, then New project).
3. Open **APIs & Services → Library**, search for **Google Calendar API**, and enable it.
4. Open **APIs & Services → OAuth consent screen** (Google’s newer label is **Google Auth Platform**).
5. If asked for a user type, choose **External**. Set the app name to `Home Dashboard`, and set the user support email and developer contact to zachj8@gmail.com.
6. Leave the publishing status on **Testing**.
7. Add test users: zachj8@gmail.com and his wife's Google account.
8. If the screen asks for scopes, add `https://www.googleapis.com/auth/calendar.events`, plus `openid` and `email` (or `https://www.googleapis.com/auth/userinfo.email`).
9. Open **APIs & Services → Credentials → Create credentials → OAuth client ID**.
10. Choose **Web application**. Name it `Home Dashboard`.
11. Leave **Authorized JavaScript origins** empty. This app uses a server redirect, not a browser token.
12. Under **Authorized redirect URIs**, add these two values exactly, with no trailing slash:

    - `https://home-dashboard-ebon.vercel.app/api/google/callback`
    - `http://localhost:3000/api/google/callback`

13. Create the client and copy the client id and client secret into the Vercel env vars above.

A Vercel preview URL is not in that list. Connect from the production site or from `http://localhost:3000`. Preview deploys that share the same Supabase project will use the connection after that.

### Testing mode expires after 7 days

While the consent screen stays in **Testing**, Google expires the refresh token 7 days after consent. The dashboard then asks you to reconnect. That is expected.

To stop the 7-day expiry:

1. Open the OAuth consent screen (or **Google Auth Platform → Audience**).
2. Click **Publish app**. Confirm it.
3. Open the dashboard and choose **Reconnect Google Calendar** so the stored token is a new one.

Publishing does not by itself remove Google’s “unverified app” warning. Calendar access is a sensitive scope, and full verification is a separate Google review. For this household app you can continue past the warning (Advanced, then continue to Home Dashboard). Publishing is what removes the 7-day limit. The unverified-app user cap does not matter for two people.

## Planned next work

1. **Deferred:** finance, Plaid, and a Rocket Money CSV history import. Do not start these until someone explicitly asks. Budget stays manual. Google Calendar sync is in place.

## While you are in the code

- Match the existing iOS-style UI: white cards, `#007AFF`, `#1C1C1E`, rounded-2xl, the shared `card` shadow.
- Keep commits small. One tab or one concern is enough.
- Read `node_modules/next/dist/docs/` before changing framework APIs. This Next.js version differs from older App Router habits, including `proxy.js` instead of `middleware.js`.
- After you change tabs, schema, deploy steps, or the plan, update this file before you open or finish the pull request.
