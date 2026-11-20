'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import GoogleCalendarPanel from '@/app/components/GoogleCalendarPanel'
import { useTimezone } from '@/app/hooks/useTimezone'
import { createClient } from '@/lib/supabase/client'
import { formatDisplayTime, formatWallTime, getTodayStr, zonedTimeToUtc } from '@/lib/dateUtils'
import { isMissingColumn } from '@/lib/dbErrors'
import { eventSourceLabel, sanitizeColor } from '@/lib/google/calendarChoice'

const supabase = createClient()

const fmtDate = (d) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

const inputClass = 'w-full px-3.5 py-2.5 bg-[#F9F9FB] rounded-xl border border-[#E5E5EA] text-[14px] text-[#1C1C1E] placeholder-[#AEAEB2] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF] transition-all'

function personName(profile) {
  if (!profile) return ''
  return profile.display_name || profile.first_name || ''
}

function whenLabel(evt, tz) {
  if (evt.all_day === false && evt.start_time) {
    const start = new Date(evt.start_time)
    const end = evt.end_time ? new Date(evt.end_time) : null
    if (Number.isNaN(start.getTime())) return ''
    const startLabel = formatDisplayTime(start, tz)
    const endLabel = end && !Number.isNaN(end.getTime()) ? formatDisplayTime(end, tz) : ''
    const sameDay = !evt.end_date || evt.end_date === evt.start_date
    if (sameDay) return endLabel ? `${startLabel} – ${endLabel}` : startLabel
    return `${startLabel}${evt.end_date ? ` – ${fmtDate(evt.end_date)}` : ''}${endLabel ? ` ${endLabel}` : ''}`
  }
  if (evt.end_date && evt.end_date !== evt.start_date) return `through ${fmtDate(evt.end_date)}`
  return ''
}

function PageHeader({ onAdd }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h2 className="text-[22px] font-bold text-[#1C1C1E] tracking-[-0.01em]">Calendar</h2>
        <p className="text-[14px] text-[#AEAEB2] mt-0.5">Household events from Home and Google</p>
      </div>
      <button
        onClick={onAdd}
        className="flex items-center gap-2 px-4 py-2.5 bg-[#007AFF] hover:bg-[#0066DD] text-white text-[13.5px] font-semibold rounded-xl transition-colors shrink-0"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4" aria-hidden="true">
          <path d="M10 4v12M4 10h12" strokeLinecap="round" />
        </svg>
        Add Event
      </button>
    </div>
  )
}

function EventCard({ evt, tz, names, onEdit, onDelete, dim, canChange }) {
  const d = new Date(evt.start_date + 'T00:00:00')
  const source = eventSourceLabel(evt, names)
  const color = sanitizeColor(evt.calendar_color)
  const schedule = whenLabel(evt, tz)
  return (
    <div className={`bg-white rounded-2xl p-4 card flex items-start gap-4 transition-opacity ${dim ? 'opacity-50' : ''}`}>
      <div className="shrink-0 w-12 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#AEAEB2]">
          {d.toLocaleDateString('en-US', { month: 'short' })}
        </p>
        <p className="text-[24px] font-bold text-[#1C1C1E] leading-tight">{d.getDate()}</p>
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-center gap-2 min-w-0">
          {color && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />}
          <p className="text-[14px] font-semibold text-[#1C1C1E] truncate">{evt.title}</p>
        </div>
        {source && <p className="text-[12px] text-[#6C6C70] mt-0.5 truncate">{source}</p>}
        {schedule && <p className="text-[12px] text-[#AEAEB2] mt-0.5">{schedule}</p>}
        {evt.description && <p className="text-[13px] text-[#6C6C70] mt-0.5 line-clamp-2">{evt.description}</p>}
      </div>
      {canChange && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onEdit(evt)}
            className="text-[#C7C7CC] hover:text-[#007AFF] hover:bg-[#EBF5FF] p-1.5 rounded-lg transition-all duration-150"
            title="Edit event"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-3.5 h-3.5" aria-hidden="true">
              <path d="M11.5 4.5 15.5 8.5 7 17H3v-4L11.5 4.5Z" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onDelete(evt)}
            className="text-[#C7C7CC] hover:text-[#FF3B30] hover:bg-[#FFF0EF] p-1.5 rounded-lg transition-all duration-150"
            title="Delete event"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-3.5 h-3.5" aria-hidden="true">
              <path d="M5 15L15 5M5 5l10 10" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}

function EventSection({ title, events, tz, names, onEdit, onDelete, dim, userId }) {
  if (!events.length) return null
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[#AEAEB2] mb-3">{title}</p>
      <div className="space-y-2.5">
        {events.map((evt) => (
          <EventCard
            key={evt.id}
            evt={evt}
            tz={tz}
            names={names}
            onEdit={onEdit}
            onDelete={onDelete}
            dim={dim}
            canChange={Boolean(evt.google_event_id) || evt.created_by === userId}
          />
        ))}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="bg-white rounded-2xl p-12 card flex flex-col items-center text-center">
      <div className="w-14 h-14 bg-[#F2F2F7] rounded-2xl flex items-center justify-center mb-4">
        <svg viewBox="0 0 20 20" fill="none" stroke="#AEAEB2" strokeWidth="1.5" className="w-7 h-7" aria-hidden="true">
          <rect x="2.5" y="3.75" width="15" height="13.75" rx="1.5" />
          <path d="M2.5 7.917h15M6.667 2.5v2.5M13.333 2.5v2.5" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-[16px] font-semibold text-[#1C1C1E] mb-1">No events yet</p>
      <p className="text-[14px] text-[#AEAEB2]">Add a household event, or connect Google and choose calendars to show.</p>
    </div>
  )
}

const blankForm = (today) => ({
  title: '',
  description: '',
  start_date: today,
  end_date: '',
  all_day: true,
  start_time: '09:00',
  end_time: '10:00',
  google_calendar_id: '',
})

export default function CalendarPage() {
  const tz = useTimezone()
  const today = useMemo(() => getTodayStr(tz), [tz])
  const [events, setEvents] = useState([])
  const [names, setNames] = useState({})
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [userId, setUserId] = useState(null)
  const [form, setForm] = useState(blankForm(today))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(null)
  const [googleStatus, setGoogleStatus] = useState(null)
  const [tick, setTick] = useState(0)

  const reloadEvents = useCallback(() => setTick((value) => value + 1), [])

  useEffect(() => {
    let cancelled = false

    async function loadRows() {
      const [{ data: rows }, { data: profiles }, { data: auth }] = await Promise.all([
        supabase.from('calendar_events').select('*').order('start_date', { ascending: true }),
        supabase.from('profiles').select('id, display_name, first_name'),
        supabase.auth.getUser(),
      ])
      return {
        rows: rows || [],
        names: Object.fromEntries((profiles || []).map((profile) => [profile.id, personName(profile)])),
        userId: auth.user?.id || null,
      }
    }

    async function load() {
      if (tick === 0) setLoading(true)
      const first = await loadRows()
      if (cancelled) return
      setEvents(first.rows)
      setNames(first.names)
      setUserId(first.userId)
      setLoading(false)

      const res = await fetch('/api/google/sync', { method: 'POST' }).catch(() => null)
      if (cancelled || !res?.ok) return
      const body = await res.json().catch(() => ({}))
      if (body.skipped) return
      const next = await loadRows()
      if (cancelled) return
      setEvents(next.rows)
      setNames(next.names)
      setUserId(next.userId)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [tick])

  const targets = (googleStatus?.calendars || []).filter((calendar) => (
    calendar.selected && calendar.writable && !googleStatus?.needsReconnect
  ))

  function openForm() {
    setEditing(null)
    setError('')
    setForm(blankForm(today))
    setShowForm((open) => !open)
  }

  function openEdit(evt) {
    setEditing(evt)
    setError('')
    const timed = evt.all_day === false && evt.start_time
    setForm({
      title: evt.title || '',
      description: evt.description || '',
      start_date: evt.start_date,
      end_date: evt.end_date && evt.end_date !== evt.start_date ? evt.end_date : '',
      all_day: evt.all_day !== false,
      start_time: timed ? wall(evt.start_time) : '09:00',
      end_time: timed && evt.end_time ? wall(evt.end_time) : '10:00',
      google_calendar_id: evt.google_calendar_id || '',
    })
    setShowForm(true)
  }

  function wall(iso) {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return '09:00'
    return formatWallTime(date, tz)
  }

  function householdEventFields() {
    const legacy = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      start_date: form.start_date,
      end_date: form.end_date || form.start_date,
    }
    const fields = {
      ...legacy,
      all_day: form.all_day,
      start_time: form.all_day ? null : zonedTimeToUtc(form.start_date, form.start_time, tz),
      end_time: form.all_day ? null : zonedTimeToUtc(form.end_date || form.start_date, form.end_time, tz),
    }
    return { fields, legacy }
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!userId) return
    setSaving(true)
    setError('')
    const payload = {
      title: form.title,
      description: form.description,
      start_date: form.start_date,
      end_date: form.end_date || form.start_date,
      all_day: form.all_day,
      start_time: form.all_day ? '' : form.start_time,
      end_time: form.all_day ? '' : form.end_time,
      time_zone: tz,
      google_calendar_id: editing?.google_event_id ? (editing.google_calendar_id || '') : form.google_calendar_id,
    }
    const useGoogle = Boolean(editing?.google_event_id) || Boolean(payload.google_calendar_id)

    try {
      if (useGoogle) {
        const res = await fetch(editing ? `/api/calendar/events/${editing.id}` : '/api/calendar/events', {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(body.error || 'Could not save that event.')
          setSaving(false)
          return
        }
      } else if (editing) {
        const update = householdEventFields()
        let { error: updateError } = await supabase.from('calendar_events').update(update.fields).eq('id', editing.id)
        if (updateError && isMissingColumn(updateError)) {
          updateError = (await supabase.from('calendar_events').update(update.legacy).eq('id', editing.id)).error
        }
        if (updateError) {
          setError(updateError.message)
          setSaving(false)
          return
        }
      } else {
        const insert = householdEventFields()
        let { error: insertError } = await supabase.from('calendar_events').insert({
          created_by: userId,
          ...insert.fields,
        })
        if (insertError && isMissingColumn(insertError)) {
          insertError = (await supabase.from('calendar_events').insert({
            created_by: userId,
            ...insert.legacy,
          })).error
          if (!insertError && !form.all_day) {
            setNotice({ tone: 'info', text: 'Saved on the household calendar. Times need the one-time calendar database update, so this one was saved by date.' })
          }
        }
        if (insertError) {
          setError(insertError.message)
          setSaving(false)
          return
        }
      }
      setForm(blankForm(today))
      setEditing(null)
      setShowForm(false)
      reloadEvents()
    } catch (err) {
      setError(err?.message || 'Could not save that event.')
    }
    setSaving(false)
  }

  async function handleDelete(evt) {
    setNotice(null)
    if (evt.google_event_id) {
      const res = await fetch(`/api/calendar/events/${evt.id}`, { method: 'DELETE' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setNotice({ tone: 'error', text: body.error || 'Could not delete that event.' })
        return
      }
    } else {
      const { error: deleteError } = await supabase.from('calendar_events').delete().eq('id', evt.id)
      if (deleteError) {
        setNotice({ tone: 'error', text: deleteError.message })
        return
      }
    }
    setEvents((prev) => prev.filter((item) => item.id !== evt.id))
    if (editing?.id === evt.id) {
      setEditing(null)
      setShowForm(false)
    }
  }

  const upcoming = events.filter((evt) => evt.start_date >= today)
  const past = events.filter((evt) => evt.start_date < today)
  const localEventCount = events.filter((evt) => !evt.google_event_id).length
  const legend = []
  const seenLegend = new Set()
  for (const evt of events) {
    if (!evt.google_calendar_id || seenLegend.has(evt.google_calendar_id)) continue
    seenLegend.add(evt.google_calendar_id)
    legend.push({
      id: evt.google_calendar_id,
      label: eventSourceLabel(evt, names) || evt.calendar_name || 'Google Calendar',
      color: sanitizeColor(evt.calendar_color) || '#007AFF',
    })
  }

  return (
    <div>
      <PageHeader onAdd={openForm} />
      <GoogleCalendarPanel
        returnTo="calendar"
        localEventCount={localEventCount}
        onStatus={setGoogleStatus}
        onEventsChanged={reloadEvents}
      />

      {legend.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {legend.map((item) => (
            <span key={item.id} className="inline-flex items-center gap-2 px-3 py-1.5 bg-white rounded-full text-[12px] font-medium text-[#1C1C1E] card">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      )}

      {notice?.text && (
        <p className={`text-[13px] px-3 py-2 rounded-xl mb-4 ${notice.tone === 'info' ? 'text-[#1C1C1E] bg-[#FFF4E5]' : 'text-[#FF3B30] bg-[#FFF0EF]'}`}>
          {notice.text}
        </p>
      )}

      {showForm && (
        <div className="bg-white rounded-2xl p-6 card mb-6">
          <h3 className="text-[15px] font-semibold text-[#1C1C1E] mb-5">{editing ? 'Edit Event' : 'New Event'}</h3>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider" htmlFor="event-title">Title *</label>
              <input
                id="event-title"
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
                placeholder="Event title"
                className={inputClass}
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider" htmlFor="event-start">Start Date *</label>
                <input id="event-start" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} required className={inputClass} />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider" htmlFor="event-end">End Date</label>
                <input id="event-end" type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className={inputClass} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-[14px] text-[#1C1C1E]">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#007AFF]"
                checked={form.all_day}
                onChange={(e) => setForm({ ...form, all_day: e.target.checked })}
              />
              All day
            </label>
            {!form.all_day && (
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider" htmlFor="event-start-time">Start time</label>
                  <input id="event-start-time" type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} required className={inputClass} />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider" htmlFor="event-end-time">End time</label>
                  <input id="event-end-time" type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} required className={inputClass} />
                </div>
              </div>
            )}
            {editing?.google_event_id ? (
              <p className="text-[13px] text-[#6C6C70]">
                Saved to {editing.calendar_name || 'Google Calendar'}. Changes here are written to that Google calendar.
              </p>
            ) : targets.length > 0 && (
              <div>
                <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider" htmlFor="event-calendar">Save to</label>
                <select
                  id="event-calendar"
                  value={form.google_calendar_id}
                  onChange={(e) => setForm({ ...form, google_calendar_id: e.target.value })}
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
              <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider" htmlFor="event-notes">Notes</label>
              <textarea
                id="event-notes"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                placeholder="Optional details"
                className={`${inputClass} resize-none`}
              />
            </div>
            {error && <p className="text-[13px] text-[#FF3B30] bg-[#FFF0EF] px-3 py-2 rounded-lg">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => { setShowForm(false); setEditing(null) }} className="px-4 py-2 text-[14px] font-medium text-[#6C6C70] hover:bg-[#F2F2F7] rounded-xl transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="px-5 py-2 bg-[#007AFF] hover:bg-[#0066DD] disabled:opacity-50 text-white text-[14px] font-semibold rounded-xl transition-colors">
                {saving ? 'Saving…' : 'Save Event'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-[#007AFF]/30 border-t-[#007AFF] rounded-full animate-spin" />
        </div>
      ) : !upcoming.length && !past.length ? (
        <EmptyState />
      ) : (
        <div className="space-y-8">
          <EventSection title="Upcoming" events={upcoming} tz={tz} names={names} onEdit={openEdit} onDelete={handleDelete} dim={false} userId={userId} />
          {past.length > 0 && (
            <EventSection title="Past" events={[...past].reverse()} tz={tz} names={names} onEdit={openEdit} onDelete={handleDelete} dim userId={userId} />
          )}
        </div>
      )}
    </div>
  )
}
