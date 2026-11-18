import test from 'node:test'
import assert from 'node:assert/strict'
import { formatInTimeZone, formatWallTime, zonedTimeToUtc } from '../dateUtils.js'
import { fromGoogleEvent, parseEventInput, toGoogleEventBody } from './mapEvent.js'

test('converts Chicago wall time to UTC', () => {
  assert.equal(zonedTimeToUtc('2026-07-15', '15:30', 'America/Chicago'), '2026-07-15T20:30:00.000Z')
  assert.equal(zonedTimeToUtc('2026-01-15', '15:30', 'America/Chicago'), '2026-01-15T21:30:00.000Z')
  assert.equal(zonedTimeToUtc('2026-07-15', '00:00', 'America/Chicago'), '2026-07-15T05:00:00.000Z')
})

test('round-trips a Chicago time', () => {
  const iso = zonedTimeToUtc('2026-11-18', '15:00', 'America/Chicago')
  const date = new Date(iso)
  assert.equal(formatInTimeZone(date, 'America/Chicago'), '2026-11-18')
  assert.equal(formatWallTime(date, 'America/Chicago'), '15:00')
})

test('maps an all-day Google event to inclusive dates', () => {
  const mapped = fromGoogleEvent({
    summary: 'Trip',
    start: { date: '2026-11-18' },
    end: { date: '2026-11-21' },
  })
  assert.equal(mapped.all_day, true)
  assert.equal(mapped.start_date, '2026-11-18')
  assert.equal(mapped.end_date, '2026-11-20')
  assert.equal(mapped.start_time, null)
})

test('builds an exclusive Google end date', () => {
  const body = toGoogleEventBody({
    title: 'Trip',
    description: '',
    allDay: true,
    startDate: '2026-11-18',
    endDate: '2026-11-20',
    timeZone: 'America/Chicago',
    dashboardId: 'abc',
  })
  assert.equal(body.start.date, '2026-11-18')
  assert.equal(body.end.date, '2026-11-21')
  assert.equal(body.extendedProperties.private.dashboardId, 'abc')
})

test('maps a timed Google event', () => {
  const mapped = fromGoogleEvent({
    summary: 'Pediatrician',
    description: 'Bring the folder',
    start: { dateTime: '2026-11-18T15:00:00-06:00', timeZone: 'America/Chicago' },
    end: { dateTime: '2026-11-18T15:30:00-06:00', timeZone: 'America/Chicago' },
  })
  assert.equal(mapped.all_day, false)
  assert.equal(mapped.start_date, '2026-11-18')
  assert.equal(mapped.start_time, '2026-11-18T21:00:00.000Z')
  assert.equal(mapped.title, 'Pediatrician')
})

test('rejects an end time before the start', () => {
  const parsed = parseEventInput({
    title: 'Checkup',
    start_date: '2026-11-18',
    end_date: '2026-11-18',
    all_day: false,
    start_time: '15:00',
    end_time: '14:00',
    time_zone: 'America/Chicago',
  })
  assert.equal(parsed.error, 'The end time must be after the start time.')
})

test('rejects a calendar date that does not exist', () => {
  const parsed = parseEventInput({
    title: 'Nope',
    start_date: '2026-02-31',
    all_day: true,
  })
  assert.equal(parsed.error, 'Enter a valid date.')
})
