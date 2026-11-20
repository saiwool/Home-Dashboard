'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import GoogleCalendarPanel from '@/app/components/GoogleCalendarPanel'
import {
  CALENDAR_VIEWS,
  DEFAULT_CALENDAR_VIEW,
  canChangeEvent,
  collectCalendars,
  eventCalendarName,
  eventColor,
  eventInterval,
  eventWhenLabel,
  filterEvents,
  foregroundFor,
  googleStatusLine,
  isCalendarView,
  parseHiddenIds,
  shiftAnchor,
  shortTime,
  syncedAgo,
  viewHeading,
  dateHeading,
  weekDates,
} from '@/lib/calendarGrid'
import { Chevron, MiniMonth, MonthView, ScheduleView, TimeGrid } from '@/app/components/calendar/CalendarViews'

const VIEW_KEY = 'hd-calendar-view'
const HIDDEN_KEY = 'hd-calendar-hidden'
const SIDEBAR_KEY = 'hd-calendar-sidebar'
const EMPTY_HIDDEN = []
const preferenceListeners = new Set()

function subscribePreferences(listener) {
  preferenceListeners.add(listener)
  window.addEventListener('storage', listener)
  return () => {
    preferenceListeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

function emitPreferences() {
  preferenceListeners.forEach((listener) => listener())
}

function readView() {
  const stored = window.localStorage.getItem(VIEW_KEY)
  return isCalendarView(stored) ? stored : DEFAULT_CALENDAR_VIEW
}

let hiddenCache = { raw: '', ids: EMPTY_HIDDEN }
function readHidden() {
  const raw = window.localStorage.getItem(HIDDEN_KEY) || ''
  if (raw !== hiddenCache.raw) hiddenCache = { raw, ids: parseHiddenIds(raw) }
  return hiddenCache.ids
}

function readCollapsed() {
  return window.localStorage.getItem(SIDEBAR_KEY) === 'closed'
}

function writeView(next) {
  window.localStorage.setItem(VIEW_KEY, next)
  emitPreferences()
}

function writeHidden(ids) {
  const raw = JSON.stringify(ids)
  hiddenCache = { raw, ids }
  window.localStorage.setItem(HIDDEN_KEY, raw)
  emitPreferences()
}

function writeCollapsed(next) {
  window.localStorage.setItem(SIDEBAR_KEY, next ? 'closed' : 'open')
  emitPreferences()
}

const inputClass = 'w-full px-3.5 py-2.5 bg-[#F9F9FB] rounded-xl border border-[#E5E5EA] text-[14px] text-[#1C1C1E] placeholder-[#AEAEB2] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF] transition-all'

function popoverPosition(rect) {
  if (typeof window === 'undefined' || !rect || window.innerWidth < 640) {
    return {
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      width: 'min(22rem, calc(100vw - 2rem))',
    }
  }
  const width = 340
  const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12)
  let top = rect.bottom + 8
  if (top > window.innerHeight - 320) top = Math.max(12, rect.top - 320)
  return { left, top, width }
}

export default function CalendarBoard({
  tz,
  today,
  events,
  loading,
  googleStatus,
  syncing,
  onSync,
  notice,
  banner,
  onDismissBanner,
  userId,
  names,
  manageOpen,
  onManageOpen,
  localEventCount,
  onEventsChanged,
  onGoogleStatus,
  showForm,
  editing,
  form,
  setForm,
  saving,
  error,
  targets,
  onCreate,
  onEdit,
  onCloseForm,
  onSave,
  onDelete,
}) {
  const shellRef = useRef(null)
  const view = useSyncExternalStore(subscribePreferences, readView, () => DEFAULT_CALENDAR_VIEW)
  const hiddenIds = useSyncExternalStore(subscribePreferences, readHidden, () => EMPTY_HIDDEN)
  const collapsed = useSyncExternalStore(subscribePreferences, readCollapsed, () => false)
  const [anchor, setAnchor] = useState(today)
  const [anchorPinned, setAnchorPinned] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [details, setDetails] = useState(null)
  const [more, setMore] = useState(null)
  const [confirming, setConfirming] = useState(false)

  if (!anchorPinned && anchor !== today) setAnchor(today)

  useLayoutEffect(() => {
    const el = shellRef.current
    if (!el) return undefined
    const fit = () => {
      const top = el.getBoundingClientRect().top
      el.style.height = `${Math.max(420, window.innerHeight - Math.max(0, top))}px`
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  useEffect(() => {
    function onKey(event) {
      if (event.key !== 'Escape') return
      if (details) {
        setDetails(null)
        return
      }
      if (more) {
        setMore(null)
        return
      }
      if (showForm) {
        onCloseForm()
        return
      }
      if (manageOpen) onManageOpen(false)
      if (mobileOpen) setMobileOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [details, more, showForm, manageOpen, mobileOpen, onCloseForm, onManageOpen])

  const visibleEvents = useMemo(() => filterEvents(events, hiddenIds), [events, hiddenIds])
  const calendars = useMemo(
    () => collectCalendars(events, googleStatus?.calendars),
    [events, googleStatus],
  )

  function moveAnchor(next) {
    setAnchorPinned(true)
    setAnchor(next)
  }

  function chooseView(next) {
    writeView(next)
  }

  function toggleCalendar(id) {
    const next = hiddenIds.includes(id) ? hiddenIds.filter((item) => item !== id) : [...hiddenIds, id]
    writeHidden(next)
  }

  function toggleSidebar() {
    const desktop = window.matchMedia('(min-width: 1024px)').matches
    if (desktop) {
      writeCollapsed(!collapsed)
      return
    }
    setMobileOpen((value) => !value)
  }

  function requestCreate(preset) {
    setDetails(null)
    setMore(null)
    setConfirming(false)
    setMobileOpen(false)
    onCreate(preset)
  }

  function openEvent(event, rect) {
    setMore(null)
    setConfirming(false)
    setDetails({ event, rect })
  }

  const heading = viewHeading(view, anchor)
  const sidebarClass = mobileOpen
    ? 'fixed inset-y-0 left-0 z-40 flex w-[min(20rem,calc(100%-2.75rem))] flex-col bg-[#F2F2F7] shadow-xl lg:static lg:z-auto lg:flex lg:w-[260px] lg:shadow-none'
    : collapsed
      ? 'hidden'
      : 'hidden lg:flex lg:w-[260px] lg:shrink-0 lg:flex-col'

  return (
    <div
      ref={shellRef}
      className="-m-5 flex h-[calc(100dvh-7rem)] min-h-0 overflow-hidden bg-[#F2F2F7] sm:-m-6 lg:-m-8 lg:h-dvh"
    >
      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          aria-label="Close calendars"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside className={`${sidebarClass} min-h-0 border-[#E5E5EA] lg:border-r`}>
        <div className="flex shrink-0 items-center justify-between px-3 pt-3 lg:hidden">
          <p className="text-[13px] font-semibold text-[#1C1C1E]">Calendars</p>
          <button type="button" onClick={() => setMobileOpen(false)} className="rounded-full px-2 py-1 text-[12px] font-semibold text-[#6C6C70] hover:bg-[#E5E5EA]">
            Close
          </button>
        </div>
        <div className="shrink-0 px-3 pb-2 pt-3">
          <MiniMonth
            key={anchor.slice(0, 7)}
            anchor={anchor}
            today={today}
            view={view}
            onSelect={(date) => {
              moveAnchor(date)
              setMobileOpen(false)
            }}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.07em] text-[#AEAEB2]">Calendars</p>
          <ul>
            {calendars.map((calendar) => {
              const hidden = hiddenIds.includes(calendar.id)
              return (
                <li key={calendar.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={!hidden}
                    onClick={() => toggleCalendar(calendar.id)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-[#E5E5EA]"
                  >
                    <span
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px]"
                      style={{
                        backgroundColor: hidden ? 'transparent' : calendar.color,
                        boxShadow: `inset 0 0 0 1.5px ${calendar.color}`,
                      }}
                    >
                      {!hidden && (
                        <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
                          <path d="M2.5 6.2 4.8 8.5 9.5 3.5" fill="none" stroke={foregroundFor(calendar.color)} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-[#1C1C1E]">{calendar.name}</span>
                      {calendar.hint && <span className="block truncate text-[11px] text-[#AEAEB2]">{calendar.hint}</span>}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
        <div className="shrink-0 border-t border-[#E5E5EA] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[#AEAEB2]">Google</p>
          <p className="mt-1 text-[13px] font-medium leading-snug text-[#1C1C1E]">{googleStatusLine(googleStatus)}</p>
          {googleStatus?.connected && (
            <p className="mt-0.5 text-[12px] text-[#6C6C70]">{syncedAgo(googleStatus.lastSyncedAt)}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onSync}
              disabled={syncing || !googleStatus?.connected || googleStatus?.needsReconnect}
              className="rounded-full bg-[#007AFF] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#0066DD] disabled:opacity-50"
            >
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false)
                onManageOpen(true)
              }}
              className="rounded-full px-3 py-1.5 text-[12px] font-semibold text-[#007AFF] hover:bg-[#E5E5EA]"
            >
              Manage Google calendars
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 flex-col gap-2 px-3 py-3 sm:px-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label="Toggle calendars"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[#1C1C1E] hover:bg-[#E5E5EA]"
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5" aria-hidden="true">
                <path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13" strokeLinecap="round" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => requestCreate({ date: anchor, allDay: true })}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#007AFF] px-3.5 text-[13.5px] font-semibold text-white hover:bg-[#0066DD]"
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
                <path d="M10 4v12M4 10h12" strokeLinecap="round" />
              </svg>
              Create
            </button>
            <button
              type="button"
              onClick={() => moveAnchor(today)}
              className="h-9 rounded-full border border-[#E5E5EA] bg-white px-3.5 text-[13px] font-semibold text-[#1C1C1E] hover:bg-[#F9F9FB]"
            >
              Today
            </button>
            <button
              type="button"
              aria-label="Previous"
              onClick={() => moveAnchor(shiftAnchor(view, anchor, -1))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#E5E5EA] bg-white text-[#1C1C1E] hover:bg-[#F9F9FB]"
            >
              <Chevron direction="left" />
            </button>
            <button
              type="button"
              aria-label="Next"
              onClick={() => moveAnchor(shiftAnchor(view, anchor, 1))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#E5E5EA] bg-white text-[#1C1C1E] hover:bg-[#F9F9FB]"
            >
              <Chevron direction="right" />
            </button>
            <h1 className="min-w-0 truncate text-[18px] font-semibold tracking-[-0.02em] text-[#1C1C1E] sm:text-[22px]">
              {heading}
            </h1>
            {loading && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#007AFF]/30 border-t-[#007AFF]" role="status" aria-label="Loading events" />
            )}
          </div>
          <div role="tablist" aria-label="Calendar view" className="inline-flex max-w-full self-start overflow-x-auto rounded-full border border-[#E5E5EA] bg-white p-0.5 lg:self-auto">
            {CALENDAR_VIEWS.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={view === id}
                onClick={() => chooseView(id)}
                className={`rounded-full px-3 py-1.5 text-[13px] font-semibold capitalize ${view === id ? 'bg-[#EBF5FF] text-[#007AFF]' : 'text-[#6C6C70] hover:bg-[#F2F2F7]'}`}
              >
                {id}
              </button>
            ))}
          </div>
        </div>

        {banner?.text && (
          <div className={`mx-3 mb-2 flex items-start justify-between gap-3 rounded-xl px-3 py-2 text-[13px] sm:mx-4 ${banner.type === 'success' ? 'bg-[#E8F8ED] text-[#1A7A36]' : 'bg-[#FFF0EF] text-[#FF3B30]'}`} role="status">
            <p>{banner.text}</p>
            <button type="button" onClick={onDismissBanner} className="shrink-0 font-semibold" aria-label="Dismiss">×</button>
          </div>
        )}
        {notice?.text && (
          <p className={`mx-3 mb-2 rounded-xl px-3 py-2 text-[13px] sm:mx-4 ${notice.tone === 'success' ? 'bg-[#E8F8ED] text-[#1A7A36]' : notice.tone === 'info' ? 'bg-[#FFF4E5] text-[#1C1C1E]' : 'bg-[#FFF0EF] text-[#FF3B30]'}`} role="status">
            {notice.text}
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-hidden border-t border-[#E5E5EA] bg-white" role="tabpanel">
          {view === 'month' && (
            <MonthView
              anchor={anchor}
              today={today}
              events={visibleEvents}
              tz={tz}
              onCreateDay={(date) => requestCreate({ date, allDay: true })}
              onOpenEvent={openEvent}
              onOpenMore={(date, dayEvents, rect) => setMore({ date, events: dayEvents, rect })}
            />
          )}
          {view === 'week' && (
            <TimeGrid
              dates={weekDates(anchor)}
              events={visibleEvents}
              tz={tz}
              today={today}
              onCreateSlot={requestCreate}
              onOpenEvent={openEvent}
              onOpenMore={(date, dayEvents, rect) => setMore({ date, events: dayEvents, rect })}
              onFocusDay={(date) => {
                moveAnchor(date)
                chooseView('day')
              }}
            />
          )}
          {view === 'day' && (
            <TimeGrid
              dates={[anchor]}
              events={visibleEvents}
              tz={tz}
              today={today}
              onCreateSlot={requestCreate}
              onOpenEvent={openEvent}
              onOpenMore={(date, dayEvents, rect) => setMore({ date, events: dayEvents, rect })}
              onFocusDay={moveAnchor}
            />
          )}
          {view === 'schedule' && (
            <ScheduleView
              anchor={anchor}
              today={today}
              events={visibleEvents}
              tz={tz}
              names={names}
              onOpenEvent={openEvent}
              onCreateDay={(date) => requestCreate({ date, allDay: true })}
            />
          )}
        </div>
      </div>

      {showForm && (
        <EventFormDialog
          editing={editing}
          form={form}
          setForm={setForm}
          saving={saving}
          error={error}
          targets={targets}
          onClose={onCloseForm}
          onSave={onSave}
        />
      )}
      {details && (
        <EventDetails
          event={details.event}
          rect={details.rect}
          tz={tz}
          names={names}
          userId={userId}
          confirming={confirming}
          onConfirm={() => setConfirming(true)}
          onCancelConfirm={() => setConfirming(false)}
          onClose={() => setDetails(null)}
          onEdit={() => {
            const event = details.event
            setDetails(null)
            onEdit(event)
          }}
          onDelete={() => {
            const event = details.event
            setDetails(null)
            onDelete(event)
          }}
        />
      )}
      {more && (
        <DayList
          date={more.date}
          events={more.events}
          rect={more.rect}
          tz={tz}
          onClose={() => setMore(null)}
          onOpen={openEvent}
        />
      )}
      {manageOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close Google settings" onClick={() => onManageOpen(false)} />
          <div role="dialog" aria-modal="true" aria-labelledby="google-settings-title" className="relative z-10 max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-2 card sm:rounded-2xl">
            <div className="flex items-center justify-between px-3 pt-3">
              <h2 id="google-settings-title" className="text-[15px] font-semibold text-[#1C1C1E]">Google Calendar</h2>
              <button type="button" onClick={() => onManageOpen(false)} className="rounded-full px-2 py-1 text-[13px] font-semibold text-[#6C6C70] hover:bg-[#F2F2F7]" aria-label="Close">
                Close
              </button>
            </div>
            <GoogleCalendarPanel
              plain
              returnTo="calendar"
              localEventCount={localEventCount}
              onStatus={onGoogleStatus}
              onEventsChanged={onEventsChanged}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function EventFormDialog({ editing, form, setForm, saving, error, targets, onClose, onSave }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close event form" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="event-form-title" className="relative z-10 max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 card sm:rounded-2xl sm:p-6">
        <h2 id="event-form-title" className="mb-5 text-[16px] font-semibold text-[#1C1C1E]">{editing ? 'Edit event' : 'New event'}</h2>
        <form onSubmit={onSave} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-[#6C6C70]" htmlFor="event-title">Title *</label>
            <input
              id="event-title"
              type="text"
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              required
              autoFocus
              placeholder="Event title"
              className={inputClass}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-[#6C6C70]" htmlFor="event-start">Start date *</label>
              <input id="event-start" type="date" value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} required className={inputClass} />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-[#6C6C70]" htmlFor="event-end">End date</label>
              <input id="event-end" type="date" value={form.end_date} onChange={(event) => setForm({ ...form, end_date: event.target.value })} className={inputClass} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-[14px] text-[#1C1C1E]">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#007AFF]"
              checked={form.all_day}
              onChange={(event) => setForm({ ...form, all_day: event.target.checked })}
            />
            All day
          </label>
          {!form.all_day && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-[#6C6C70]" htmlFor="event-start-time">Start time</label>
                <input id="event-start-time" type="time" value={form.start_time} onChange={(event) => setForm({ ...form, start_time: event.target.value })} required className={inputClass} />
              </div>
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-[#6C6C70]" htmlFor="event-end-time">End time</label>
                <input id="event-end-time" type="time" value={form.end_time} onChange={(event) => setForm({ ...form, end_time: event.target.value })} required className={inputClass} />
              </div>
            </div>
          )}
          {editing?.google_event_id ? (
            <p className="text-[13px] text-[#6C6C70]">
              Saved to {editing.calendar_name || 'Google Calendar'}. Changes here are written to that Google calendar.
            </p>
          ) : targets.length > 0 && (
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-[#6C6C70]" htmlFor="event-calendar">Save to</label>
              <select
                id="event-calendar"
                value={form.google_calendar_id}
                onChange={(event) => setForm({ ...form, google_calendar_id: event.target.value })}
                className={inputClass}
              >
                <option value="">Only in this dashboard</option>
                {targets.map((calendar) => (
                  <option key={calendar.googleCalendarId} value={calendar.googleCalendarId}>{calendar.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-[#6C6C70]" htmlFor="event-notes">Notes</label>
            <textarea
              id="event-notes"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              rows={2}
              placeholder="Optional details"
              className={`${inputClass} resize-none`}
            />
          </div>
          {error && <p className="rounded-lg bg-[#FFF0EF] px-3 py-2 text-[13px] text-[#FF3B30]">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-[14px] font-medium text-[#6C6C70] hover:bg-[#F2F2F7]">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="rounded-xl bg-[#007AFF] px-5 py-2 text-[14px] font-semibold text-white hover:bg-[#0066DD] disabled:opacity-50">
              {saving ? 'Saving…' : 'Save event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EventDetails({ event, rect, tz, names, userId, confirming, onConfirm, onCancelConfirm, onClose, onEdit, onDelete }) {
  const color = eventColor(event)
  const calendar = eventCalendarName(event, names)
  const canChange = canChangeEvent(event, userId)
  const interval = eventInterval(event, tz)
  return (
    <div className="fixed inset-0 z-50">
      <button type="button" className="absolute inset-0 bg-black/30" aria-label="Close event" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-details-title"
        className="absolute z-10 max-h-[min(32rem,calc(100dvh-1.5rem))] overflow-y-auto rounded-2xl bg-white p-4 card"
        style={popoverPosition(rect)}
      >
        <div className="flex items-start gap-3">
          <span className="mt-1.5 h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: color }} />
          <div className="min-w-0 flex-1">
            <h2 id="event-details-title" className="text-[18px] font-semibold leading-tight text-[#1C1C1E]">{event.title}</h2>
            <p className="mt-2 text-[14px] text-[#1C1C1E]">{eventWhenLabel(event, tz)}</p>
            {interval.allDay && <p className="text-[13px] text-[#6C6C70]">All day</p>}
            <p className="mt-2 flex items-center gap-2 text-[13px] text-[#6C6C70]">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
              <span className="truncate">{calendar}</span>
            </p>
          </div>
        </div>
        {event.description && (
          <p className="mt-3 max-h-40 overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-[#1C1C1E]">{event.description}</p>
        )}
        {!canChange && (
          <p className="mt-3 text-[12px] text-[#AEAEB2]">You can view this event. The person who added it can change it.</p>
        )}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {canChange && !confirming && (
            <>
              <button type="button" onClick={onEdit} className="rounded-xl px-3 py-1.5 text-[13px] font-semibold text-[#007AFF] hover:bg-[#EBF5FF]">Edit</button>
              <button type="button" onClick={onConfirm} className="rounded-xl px-3 py-1.5 text-[13px] font-semibold text-[#FF3B30] hover:bg-[#FFF0EF]">Delete</button>
            </>
          )}
          {canChange && confirming && (
            <>
              <p className="mr-auto self-center text-[12px] text-[#6C6C70]">
                {event.google_event_id ? 'This also removes it from Google.' : 'Remove this household event?'}
              </p>
              <button type="button" onClick={onCancelConfirm} className="rounded-xl px-3 py-1.5 text-[13px] font-semibold text-[#6C6C70] hover:bg-[#F2F2F7]">Cancel</button>
              <button type="button" onClick={onDelete} className="rounded-xl bg-[#FF3B30] px-3 py-1.5 text-[13px] font-semibold text-white">Delete</button>
            </>
          )}
          {!confirming && (
            <button type="button" onClick={onClose} className="rounded-xl px-3 py-1.5 text-[13px] font-semibold text-[#6C6C70] hover:bg-[#F2F2F7]">Close</button>
          )}
        </div>
      </div>
    </div>
  )
}

function DayList({ date, events, rect, tz, onClose, onOpen }) {
  return (
    <div className="fixed inset-0 z-50">
      <button type="button" className="absolute inset-0 bg-black/30" aria-label="Close day" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={date}
        className="absolute z-10 max-h-[min(28rem,calc(100dvh-1.5rem))] overflow-y-auto rounded-2xl bg-white p-3 card"
        style={popoverPosition(rect)}
      >
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <h2 className="text-[14px] font-semibold text-[#1C1C1E]">{dateHeading(date)}</h2>
          <button type="button" onClick={onClose} className="text-[12px] font-semibold text-[#6C6C70]" aria-label="Close">Close</button>
        </div>
        <ul className="space-y-1">
          {events.map((event) => {
            const color = eventColor(event)
            const interval = eventInterval(event, tz)
            const when = interval.allDay ? 'All day' : shortTime(interval.start, tz)
            return (
              <li key={event.id}>
                <button
                  type="button"
                  onClick={(click) => onOpen(event, click.currentTarget.getBoundingClientRect())}
                  className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left hover:bg-[#F2F2F7]"
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                  <span className="w-16 shrink-0 text-[12px] text-[#6C6C70]">{when}</span>
                  <span className="min-w-0 truncate text-[14px] font-medium text-[#1C1C1E]">{event.title}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
