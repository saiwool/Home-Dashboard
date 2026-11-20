import test from 'node:test'
import assert from 'node:assert/strict'
import { zonedTimeToUtc } from './dateUtils.js'
import {
  allDayOnDate,
  canChangeEvent,
  collectCalendars,
  dayTimedBlocks,
  eventCoversDate,
  eventWhenLabel,
  eventsOnDate,
  filterEvents,
  foregroundFor,
  HOUSEHOLD_CALENDAR_ID,
  isCalendarView,
  layoutOverlaps,
  monthMatrix,
  parseHiddenIds,
  scheduleGroups,
  shiftAnchor,
  slotFromOffset,
  startOfSundayWeek,
  timedBlock,
  viewHeading,
  visibleChips,
  weekDates,
} from './calendarGrid.js'

const TZ = 'America/Chicago'

function timed(id, start, end, extra = {}) {
  return {
    id,
    title: id,
    all_day: false,
    start_date: '2026-11-18',
    end_date: '2026-11-18',
    start_time: zonedTimeToUtc('2026-11-18', start, TZ),
    end_time: zonedTimeToUtc('2026-11-18', end, TZ),
    ...extra,
  }
}

test('November 2026 opens on Sunday and covers six weeks', () => {
  assert.equal(startOfSundayWeek('2026-11-20'), '2026-11-15')
  assert.deepEqual(weekDates('2026-11-20'), [
    '2026-11-15',
    '2026-11-16',
    '2026-11-17',
    '2026-11-18',
    '2026-11-19',
    '2026-11-20',
    '2026-11-21',
  ])
  const matrix = monthMatrix('2026-11-20')
  assert.equal(matrix.length, 6)
  assert.equal(matrix[0][0], '2026-11-01')
  assert.equal(matrix[5][6], '2026-12-12')
  assert.equal(viewHeading('month', '2026-11-20'), 'November 2026')
  assert.equal(viewHeading('week', '2026-11-20'), 'November 2026')
  assert.equal(viewHeading('day', '2026-11-20'), 'Friday, November 20')
})

test('shifts the visible range by month, week, or day', () => {
  assert.equal(shiftAnchor('month', '2026-11-20', 1), '2026-12-20')
  assert.equal(shiftAnchor('month', '2026-11-20', -1), '2026-10-20')
  assert.equal(shiftAnchor('week', '2026-11-20', 1), '2026-11-27')
  assert.equal(shiftAnchor('schedule', '2026-11-20', -1), '2026-11-13')
  assert.equal(shiftAnchor('day', '2026-11-20', 1), '2026-11-21')
  assert.equal(isCalendarView('month'), true)
  assert.equal(isCalendarView('agenda'), false)
})

test('all-day events cover each inclusive date and timed events use the viewer clock', () => {
  const trip = { id: 'trip', title: 'Trip', all_day: true, start_date: '2026-11-18', end_date: '2026-11-20' }
  assert.equal(eventCoversDate(trip, '2026-11-18', TZ), true)
  assert.equal(eventCoversDate(trip, '2026-11-20', TZ), true)
  assert.equal(eventCoversDate(trip, '2026-11-21', TZ), false)
  assert.equal(allDayOnDate([trip, timed('meet', '09:00', '10:00')], '2026-11-18', TZ).map((event) => event.id).join(), 'trip')

  const evening = timed('late', '22:30', '23:30')
  const block = timedBlock(evening, '2026-11-18', TZ)
  assert.equal(block.startMin, 22 * 60 + 30)
  assert.equal(block.endMin, 23 * 60 + 30)
  assert.equal(timedBlock(trip, '2026-11-18', TZ), null)
  assert.match(eventWhenLabel(trip, TZ), /November 18, 2026/)
  assert.match(eventWhenLabel(evening, TZ), /10:30 PM/)
})

test('places overlapping events side by side and stacks events that only touch', () => {
  const placed = layoutOverlaps([
    { id: 'a', startMin: 0, endMin: 100 },
    { id: 'b', startMin: 10, endMin: 40 },
    { id: 'c', startMin: 50, endMin: 80 },
    { id: 'd', startMin: 100, endMin: 130 },
  ])
  const byId = Object.fromEntries(placed.map((item) => [item.id, item]))
  assert.equal(byId.a.column, 0)
  assert.equal(byId.b.column, 1)
  assert.equal(byId.c.column, 1)
  assert.equal(byId.a.columns, 2)
  assert.equal(byId.d.columns, 1)
  assert.equal(byId.d.column, 0)

  const day = dayTimedBlocks([
    timed('a', '09:00', '11:00'),
    timed('b', '10:00', '12:00'),
    timed('c', '12:00', '13:00'),
  ], '2026-11-18', TZ)
  const columns = Object.fromEntries(day.map((item) => [item.id, item.columns]))
  assert.equal(columns.a, 2)
  assert.equal(columns.b, 2)
  assert.equal(columns.c, 1)
})

test('keeps a short event visible and snaps empty slots to 30 minutes', () => {
  const block = timedBlock(timed('blip', '15:00', '15:05'), '2026-11-18', TZ)
  assert.equal(block.endMin - block.startMin, 25)
  assert.deepEqual(slotFromOffset(9.25 * 48), { startTime: '09:00', endTime: '10:00' })
  assert.deepEqual(slotFromOffset(9.6 * 48), { startTime: '09:30', endTime: '10:30' })
  assert.equal(slotFromOffset(23.9 * 48).startTime, '23:30')
  assert.equal(slotFromOffset(23.9 * 48).endTime, '23:59')
})

test('filters calendars without dropping hidden ids from the saved list', () => {
  const events = [
    { id: '1', title: 'Home', start_date: '2026-11-20' },
    { id: '2', title: 'Baby', start_date: '2026-11-20', google_calendar_id: 'baby', calendar_name: 'With Baby', calendar_color: '#34c759' },
  ]
  assert.deepEqual(filterEvents(events, ['baby']).map((event) => event.id), ['1'])
  assert.deepEqual(filterEvents(events, [HOUSEHOLD_CALENDAR_ID]).map((event) => event.id), ['2'])
  assert.deepEqual(parseHiddenIds('["baby"]'), ['baby'])
  assert.deepEqual(parseHiddenIds('nope'), [])

  const list = collectCalendars(events, [
    { googleCalendarId: 'baby', name: 'With Baby', color: '#34c759', selected: true, withBaby: true, writable: true },
    { googleCalendarId: 'off', name: 'Holidays', color: '#ff0000', selected: false },
  ])
  assert.deepEqual(list.map((calendar) => calendar.id), [HOUSEHOLD_CALENDAR_ID, 'baby'])
  assert.equal(canChangeEvent(events[1], 'user-a'), false)
  assert.equal(canChangeEvent({ ...events[0], created_by: 'user-a' }, 'user-a'), true)
  assert.equal(canChangeEvent({ ...events[1], google_event_id: 'g1' }, 'user-b'), true)
})

test('month chips leave a slot for the overflow link and schedule groups by day', () => {
  const events = [1, 2, 3, 4].map((n) => ({ id: String(n), title: `E${n}`, all_day: true, start_date: '2026-11-20', end_date: '2026-11-20' }))
  const chips = visibleChips(events, 3)
  assert.equal(chips.visible.length, 2)
  assert.equal(chips.more, 2)
  assert.equal(visibleChips(events.slice(0, 3), 3).more, 0)

  const groups = scheduleGroups([
    ...events,
    { id: 'later', title: 'Later', all_day: true, start_date: '2026-11-22', end_date: '2026-11-22' },
  ], '2026-11-20', TZ, 5)
  assert.deepEqual(groups.map((group) => group.date), ['2026-11-20', '2026-11-22'])
  assert.equal(eventsOnDate(events, '2026-11-20', TZ).length, 4)
})

test('picks readable text for event colors', () => {
  assert.equal(foregroundFor('#007aff'), '#ffffff')
  assert.equal(foregroundFor('#ffcc00'), '#1C1C1E')
  assert.equal(foregroundFor('nope'), '#ffffff')
})
