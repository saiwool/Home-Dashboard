# Project context

Shared household dashboard for Zac and his wife. Production: https://home-dashboard-ebon.vercel.app

Grok (Home) and Claude both work in this repo. Before starting, fetch and branch from the latest `main`. When a change lands, update this file in the same PR so the next person does not work from a stale picture. `README.md` is still the create-next-app stub. This file is the handoff.

## Stack

- Next.js 16 App Router, plain JavaScript (no TypeScript), Tailwind 4
- Supabase via `@supabase/supabase-js` and `@supabase/ssr`
- Browser client: `lib/supabase/client.js`. Server client: `lib/supabase/server.js`
- Session refresh lives in `proxy.js` (Next.js 16 proxy, not `middleware.js`). The dashboard layout sends anonymous visitors to `/login`
- Auth is email and password. Do not change auth settings or add environment variables unless Zac asks
- Existing public env vars, already set on Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Household "today" on the server overview uses `America/Chicago` (`DEFAULT_TZ` in `lib/dateUtils.js`). Client pages use the browser timezone through `app/hooks/useTimezone.js`
- There is no `household_id`. Both logged-in users are the household. Authenticated reads are shared

## Deploy

Vercel deploys production from `main`. Do not push schema-dependent work straight to `main`. Open a pull request so Vercel can build a preview while the new tables are still missing. After Zac runs the SQL and the PR is merged, production updates from `main`.

The UI must keep working when a new table does not exist yet. `lib/dbErrors.js` detects a missing relation, and `app/components/QueryState.js` shows a setup message instead of crashing the page.

## Schema

`supabase/schema.sql` is the full picture for a fresh database. Do not paste that whole file into a database that already has data. Policies there are not written to be re-run.

Incremental changes go in `supabase/migrations/<date>_<name>.sql` and must also be copied into `supabase/schema.sql`. Migrations should be idempotent where practical (`create table if not exists`, `drop policy if exists`, `create index if not exists`).

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
| `profiles` | Account | Created on signup |
| `calendar_events` | Calendar | Supabase only. No Google sync yet |
| `budget_items` | Budget | Manual income and expenses |
| `agreements` | Agreements | Proposals the other person responds to |
| `cleaning_tasks` | Cleaning | Recurring. Delete is limited to the creator |
| `inbox_messages` | Inbox widget | Short notes between the two of you |
| `shopping_items` | Shopping | Realtime. Optional quantity and store/category |
| `meals` | Meals | One row per date and slot. Ingredients are jsonb |
| `maintenance_tasks` | Maintenance | Separate from cleaning. `next_due` is stored |
| `house_projects` | Projects | Backlog, not a today list |
| `date_nights` | Date nights | Ideas until `done_on` is set |

New tables enable RLS. Any signed-in user can select, update, and delete. Inserts must set `created_by` to `auth.uid()`. Delete is shared on these new tables so either person can clear a shopping item or edit a row the other created. That is wider than `cleaning_tasks`, which only lets the creator delete.

## Tabs

| Tab | Route | State |
| --- | --- | --- |
| Overview | `/dashboard` | Greeting, week events, month net, cleaning overdue, proposals. Also tonight's dinner, unchecked shopping count, and maintenance that is overdue or due within 14 days |
| Calendar | `/dashboard/calendar` | Shared Supabase events |
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

## Planned next work

1. **Next:** Google Calendar two-way sync with the calendar named `with Baby`. The Calendar tab is Supabase-only today. Do this before any finance work.
2. **Deferred:** finance, Plaid, and a Rocket Money CSV history import. Do not start these until someone explicitly asks. Budget stays manual.

## While you are in the code

- Match the existing iOS-style UI: white cards, `#007AFF`, `#1C1C1E`, rounded-2xl, the shared `card` shadow.
- Keep commits small. One tab or one concern is enough.
- Read `node_modules/next/dist/docs/` before changing framework APIs. This Next.js version differs from older App Router habits, including `proxy.js` instead of `middleware.js`.
- After you change tabs, schema, deploy steps, or the plan, update this file before you open or finish the pull request.
