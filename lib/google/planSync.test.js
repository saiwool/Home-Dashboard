import test from 'node:test'
import assert from 'node:assert/strict'
import { WITH_BABY_CALENDAR_ID } from './constants.js'
import { chooseSyncOwner, suggestSelected } from './calendarChoice.js'
import { planGoogleSync } from './planSync.js'
import { CALENDAR_EVENTS_SCOPE, CALENDAR_LIST_SCOPE, hasRequiredScopes } from './scopes.js'

const BABY = WITH_BABY_CALENDAR_ID

test('requires calendar list and event scopes', () => {
  assert.equal(hasRequiredScopes(`${CALENDAR_LIST_SCOPE} ${CALENDAR_EVENTS_SCOPE}`), true)
  assert.equal(hasRequiredScopes(CALENDAR_EVENTS_SCOPE), false)
  assert.equal(hasRequiredScopes('https://www.googleapis.com/auth/calendar'), true)
})

test('suggests personal calendars and With Baby, not holiday feeds', () => {
  assert.equal(suggestSelected({ id: 'zac-primary', summary: 'Zac', primary: true, accessRole: 'owner' }), true)
  assert.equal(suggestSelected({ id: BABY, summary: 'With Baby', accessRole: 'writer' }), true)
  assert.equal(suggestSelected({ id: 'work', summary: 'Work', accessRole: 'owner' }), true)
  assert.equal(suggestSelected({ id: 'shared-read', summary: 'School', accessRole: 'reader' }), false)
  assert.equal(suggestSelected({
    id: 'en.usa#holiday@group.v.calendar.google.com',
    summary: 'Holidays in United States',
    accessRole: 'reader',
  }), false)
})

test('picks one writer when both people selected the same calendar', () => {
  const chosen = chooseSyncOwner([
    { userId: 'sarah', accessRole: 'reader', primary: false },
    { userId: 'zac', accessRole: 'owner', primary: false },
  ])
  assert.equal(chosen.userId, 'zac')
})

test('keeps one row when both accounts sync the same With Baby event', () => {
  const existing = [{
    id: 'row-1',
    created_by: 'zac',
    origin: 'google',
    google_calendar_id: BABY,
    google_event_id: 'evt-1',
    start_date: '2026-11-20',
  }]
  const incoming = [
    {
      google_calendar_id: BABY,
      google_event_id: 'evt-1',
      title: 'Nap',
      all_day: true,
      start_date: '2026-11-20',
      end_date: '2026-11-20',
      created_by: 'sarah',
      calendar_name: 'With Baby',
      google_owner_id: 'sarah',
    },
    {
      google_calendar_id: BABY,
      google_event_id: 'evt-1',
      title: 'Nap',
      all_day: true,
      start_date: '2026-11-20',
      end_date: '2026-11-20',
      created_by: 'zac',
      calendar_name: 'With Baby',
      google_owner_id: 'zac',
    },
  ]
  const plan = planGoogleSync({
    existing,
    incoming,
    selectedCalendarIds: [BABY],
    syncedCalendarIds: [BABY],
    windowStart: '2026-01-01',
    windowEnd: '2026-12-31',
    idFactory: () => 'new-id',
  })
  assert.equal(plan.upserts.length, 1)
  assert.equal(plan.upserts[0].id, 'row-1')
  assert.equal(plan.upserts[0].created_by, 'zac')
  assert.equal(plan.deleteIds.length, 0)
})

test('does not merge the same event id from two different calendars', () => {
  const plan = planGoogleSync({
    existing: [],
    incoming: [
      {
        google_calendar_id: 'zac-personal',
        google_event_id: 'evt-1',
        title: 'Dentist',
        all_day: false,
        start_date: '2026-11-20',
        end_date: '2026-11-20',
        start_time: '2026-11-20T15:00:00.000Z',
        end_time: '2026-11-20T16:00:00.000Z',
        created_by: 'zac',
      },
      {
        google_calendar_id: BABY,
        google_event_id: 'evt-1',
        title: 'Dentist',
        all_day: false,
        start_date: '2026-11-20',
        end_date: '2026-11-20',
        start_time: '2026-11-20T15:00:00.000Z',
        end_time: '2026-11-20T16:00:00.000Z',
        created_by: 'sarah',
      },
    ],
    selectedCalendarIds: ['zac-personal', BABY],
    syncedCalendarIds: ['zac-personal', BABY],
    windowStart: '2026-01-01',
    windowEnd: '2026-12-31',
    idFactory: () => 'generated',
  })
  assert.equal(plan.upserts.length, 2)
})

test('drops google copies when nobody still has that calendar selected', () => {
  const plan = planGoogleSync({
    existing: [
      {
        id: 'google-row',
        origin: 'google',
        google_calendar_id: 'zac-personal',
        google_event_id: 'evt-9',
        start_date: '2020-01-01',
      },
      {
        id: 'home-row',
        origin: 'dashboard',
        google_calendar_id: 'zac-personal',
        google_event_id: 'evt-8',
        start_date: '2026-11-20',
      },
      {
        id: 'plain',
        origin: 'dashboard',
        google_calendar_id: null,
        google_event_id: null,
        start_date: '2026-11-21',
      },
    ],
    incoming: [],
    selectedCalendarIds: [],
    syncedCalendarIds: [],
    windowStart: '2026-01-01',
    windowEnd: '2026-12-31',
    idFactory: () => 'generated',
  })
  assert.deepEqual(plan.deleteIds, ['google-row'])
  assert.equal(plan.upserts.length, 0)
})

test('removes a synced event that disappeared inside the window', () => {
  const plan = planGoogleSync({
    existing: [
      {
        id: 'gone',
        origin: 'google',
        google_calendar_id: BABY,
        google_event_id: 'evt-gone',
        start_date: '2026-05-01',
      },
      {
        id: 'old',
        origin: 'google',
        google_calendar_id: BABY,
        google_event_id: 'evt-old',
        start_date: '2024-01-01',
      },
    ],
    incoming: [],
    selectedCalendarIds: [BABY],
    syncedCalendarIds: [BABY],
    windowStart: '2026-01-01',
    windowEnd: '2026-12-31',
    idFactory: () => 'generated',
  })
  assert.deepEqual(plan.deleteIds, ['gone'])
})
