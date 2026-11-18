'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTimezone } from '@/app/hooks/useTimezone'
import GoogleCalendarCard from '@/app/components/GoogleCalendarCard'
import { addMinutesToWallTime, formatDisplayTime, formatWallTime, getTodayStr, zonedTimeToUtc } from '@/lib/dateUtils'
import { GOOGLE_CONNECTED_MESSAGE, GOOGLE_ERRORS } from '@/lib/google/messages'

const supabase = createClient()

const fmtDate = (d) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

function emptyForm(today) {
  return {
    title: '',
    description: '',
    start_date: today,
    end_date: '',
    all_day: true,
    start_time: '',
    end_time: '',
  }
}

function emptyStatus() {
  return {
    configured: false,
    connected: false,
    needsMigration: false,
    needsReconnect: false,
    canConnect: false,
    schemaReady: false,
    email: null,
    calendarLabel: 'with Baby',
    missing: [],
    statusError: null,
  }
}

function normalizeStatus(body) {
  if (!body || typeof body !== 'object' || body.configured === undefined) {
    return { ...emptyStatus(), statusError: body?.error || 'Could not check Google Calendar.' }
  }
  return {
    configured: Boolean(body.configured),
    connected: Boolean(body.connected),
    needsMigration: Boolean(body.needsMigration),
    needsReconnect: Boolean(body.needsReconnect),
    canConnect: Boolean(body.canConnect),
    schemaReady: Boolean(body.schemaReady),
    email: body.email || null,
    calendarLabel: body.calendarLabel || 'Google Calendar',
    missing: Array.isArray(body.missing) ? body.missing : [],
    statusError: body.statusError || null,
  }
}

async function readJson(res) {
  const text = await res.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { error: 'Sign in again, then retry.' }
  }
}

function sortEvents(events) {
  return [...events].sort((a, b) => {
    if (a.start_date !== b.start_date) return a.start_date < b.start_date ? -1 : 1
    const at = a.start_time || ''
    const bt = b.start_time || ''
    if (at !== bt) return at < bt ? -1 : 1
    return String(a.title).localeCompare(String(b.title))
  })
}

function eventTimeLabel(evt, tz) {
  if (evt.all_day !== false || !evt.start_time) return null
  try {
    const start = formatDisplayTime(new Date(evt.start_time), tz)
    if (!evt.end_time) return start
    const end = formatDisplayTime(new Date(evt.end_time), tz)
    return end && end !== start ? `${start} – ${end}` : start
  } catch {
    return null
  }
}

function dbMessage(error) {
  const text = `${error?.code || ''} ${error?.message || ''}`.toLowerCase()
  if (text.includes('42501') || text.includes('row-level security')) {
    return 'You can only change events you created.'
  }
  return error?.message || 'Could not save that event.'
}

function PageHeader({ onAdd, subtitle }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h2 className="text-[22px] font-bold text-[#1C1C1E] tracking-[-0.01em]">Calendar</h2>
        <p className="text-[14px] text-[#AEAEB2] mt-0.5">{subtitle}</p>
      </div>
      <button
        onClick={onAdd}
        className="flex items-center gap-2 px-4 py-2.5 bg-[#007AFF] hover:bg-[#0066DD] text-white text-[13.5px] font-semibold rounded-xl transition-colors shrink-0"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
          <path d="M10 4v12M4 10h12" strokeLinecap="round" />
        </svg>
        Add Event
      </button>
    </div>
  )
}

function EventCard({ evt, tz, showSource, onEdit, onDelete }) {
  const d = new Date(evt.start_date + 'T00:00:00')
  const timeLabel = eventTimeLabel(evt, tz)
  return (
    <div className="bg-white rounded-2xl p-4 card flex items-start gap-4">
      <div className="shrink-0 w-12 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#AEAEB2]">
          {d.toLocaleDateString('en-US', { month: 'short' })}
        </p>
        <p className="text-[24px] font-bold text-[#1C1C1E] leading-tight">{d.getDate()}</p>
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-[14px] font-semibold text-[#1C1C1E] truncate">{evt.title}</p>
          {showSource && (
            <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md ${evt.google_event_id ? 'text-[#007AFF] bg-[#EBF5FF]' : 'text-[#E6860A] bg-[#FFF4E5]'}`}>
              {evt.google_event_id ? 'Google' : 'Dashboard only'}
            </span>
          )}
        </div>
        {timeLabel && <p className="text-[12px] text-[#007AFF] mt-0.5">{timeLabel}</p>}
        {evt.description && <p className="text-[13px] text-[#6C6C70] mt-0.5 line-clamp-2">{evt.description}</p>}
        {evt.end_date && evt.end_date !== evt.start_date && (
          <p className="text-[12px] text-[#AEAEB2] mt-1">through {fmtDate(evt.end_date)}</p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => onEdit(evt)}
          className="text-[#C7C7CC] hover:text-[#007AFF] hover:bg-[#EBF5FF] p-1.5 rounded-lg transition-all duration-150"
          title="Edit event"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-3.5 h-3.5">
            <path d="M11.5 4.5 15.5 8.5 7 17H3v-4L11.5 4.5Z" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => onDelete(evt)}
          className="text-[#C7C7CC] hover:text-[#FF3B30] hover:bg-[#FFF0EF] p-1.5 rounded-lg transition-all duration-150"
          title="Delete event"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-3.5 h-3.5">
            <path d="M5 15L15 5M5 5l10 10" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function EventSection({ title, events, tz, showSource, onEdit, onDelete, dim }) {
  if (!events.length) return null
  return (
    <div className={dim ? 'opacity-60' : ''}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[#AEAEB2] mb-3">{title}</p>
      <div className="space-y-2.5">
        {events.map((evt) => (
          <EventCard key={evt.id} evt={evt} tz={tz} showSource={showSource} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </div>
    </div>
  )
}

function googleBody(form, tz, schemaReady) {
  const allDay = !schemaReady || form.all_day
  let endDate = form.end_date || form.start_date
  let endTime = form.end_time
  if (!allDay && form.start_time && !endTime) {
    const next = addMinutesToWallTime(form.start_date, form.start_time, 60, tz)
    endTime = next.time
    if (!form.end_date) endDate = next.date
  }
  return {
    title: form.title,
    description: form.description,
    start_date: form.start_date,
    end_date: endDate,
    all_day: allDay,
    start_time: allDay ? null : form.start_time,
    end_time: allDay ? null : endTime,
    time_zone: tz,
  }
}

function localRow(form, tz, schemaReady) {
  const body = googleBody(form, tz, schemaReady)
  const row = {
    title: body.title.trim(),
    description: body.description.trim() || null,
    start_date: body.start_date,
    end_date: body.end_date,
  }
  if (!schemaReady) return row
  row.all_day = body.all_day
  if (body.all_day) {
    row.start_time = null
    row.end_time = null
  } else {
    row.start_time = zonedTimeToUtc(body.start_date, body.start_time, tz)
    row.end_time = zonedTimeToUtc(body.end_date, body.end_time, tz)
  }
  return row
}

export default function CalendarPage() {
  const tz = useTimezone()
  const today = useMemo(() => getTodayStr(tz), [tz])

  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState(emptyStatus)
  const [form, setForm] = useState(emptyForm(today))
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [formError, setFormError] = useState('')
  const [message, setMessage] = useState(null)

  async function fetchEvents() {
    const { data, error } = await supabase
      .from('calendar_events')
      .select('*')
      .order('start_date', { ascending: true })
    if (error) {
      setMessage({ tone: 'error', text: 'Could not load events.' })
      return
    }
    setEvents(sortEvents(data || []))
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      const params = new URLSearchParams(window.location.search)
      if (params.get('google') === 'connected') {
        setMessage({ tone: 'ok', text: GOOGLE_CONNECTED_MESSAGE })
      } else if (params.get('google') === 'error') {
        const reason = params.get('reason')
        setMessage({ tone: 'error', text: GOOGLE_ERRORS[reason] || GOOGLE_ERRORS.exchange })
      }
      if (params.has('google')) {
        params.delete('google')
        params.delete('reason')
        const next = params.toString()
        window.history.replaceState(null, '', next ? `${window.location.pathname}?${next}` : window.location.pathname)
      }

      setLoading(true)
      const [{ data }, statusRes] = await Promise.all([
        supabase.auth.getUser(),
        fetch('/api/google/status').then(readJson).catch(() => ({ error: 'Could not check Google Calendar.' })),
      ])
      if (cancelled) return
      setUser(data.user || null)
      const nextStatus = normalizeStatus(statusRes)
      setStatus(nextStatus)

      if (nextStatus.connected && !nextStatus.needsReconnect && !nextStatus.needsMigration) {
        const syncRes = await fetch('/api/google/sync', { method: 'POST' })
        const syncBody = await readJson(syncRes).catch(() => ({}))
        if (cancelled) return
        if (syncBody?.code === 'needs_reconnect' || syncBody?.skipped === 'needs_reconnect') {
          setStatus((current) => ({ ...current, needsReconnect: true }))
        } else if (!syncRes.ok && syncBody?.error) {
          setMessage({ tone: 'error', text: syncBody.error })
        }
      }

      await fetchEvents()
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  function openNew() {
    if (showForm && !editingId) {
      setShowForm(false)
      return
    }
    setEditingId(null)
    setForm(emptyForm(today))
    setFormError('')
    setShowForm(true)
  }

  function openEdit(evt) {
    if (status.needsReconnect && evt.google_event_id) {
      setMessage({ tone: 'error', text: 'Reconnect Google Calendar before changing this event.' })
      return
    }
    setEditingId(evt.id)
    setFormError('')
    setForm({
      title: evt.title || '',
      description: evt.description || '',
      start_date: evt.start_date,
      end_date: evt.end_date && evt.end_date !== evt.start_date ? evt.end_date : '',
      all_day: evt.all_day !== false && !evt.start_time,
      start_time: evt.start_time ? formatWallTime(new Date(evt.start_time), tz) : '',
      end_time: evt.end_time ? formatWallTime(new Date(evt.end_time), tz) : '',
    })
    setShowForm(true)
  }

  const googleWritable = status.connected && !status.needsReconnect && !status.needsMigration
  const upcoming = events.filter((e) => e.start_date >= today)
  const past = events.filter((e) => e.start_date < today)
  const unlinkedCount = events.filter((evt) => !evt.google_event_id).length
  const subtitle = googleWritable
    ? `Shared with ${status.calendarLabel} on Google Calendar`
    : 'Shared household events'

  async function handleSave(e) {
    e.preventDefault()
    if (!user) return
    if (status.needsReconnect && editingId && events.some((evt) => evt.id === editingId && evt.google_event_id)) {
      setFormError('Reconnect Google Calendar before changing this event.')
      return
    }
    if (!form.title.trim()) {
      setFormError('Title is required.')
      return
    }
    if (form.end_date && form.end_date < form.start_date) {
      setFormError('The end date cannot be before the start date.')
      return
    }
    if (status.schemaReady && !form.all_day && !form.start_time) {
      setFormError('Enter a start time, or mark the event as all day.')
      return
    }
    setSaving(true)
    setFormError('')

    if (googleWritable) {
      const res = await fetch(editingId ? `/api/calendar/events/${editingId}` : '/api/calendar/events', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(googleBody(form, tz, status.schemaReady)),
      })
      const body = await readJson(res)
      if (!res.ok) {
        if (body.code === 'needs_reconnect') setStatus((current) => ({ ...current, needsReconnect: true }))
        setFormError(body.error || 'Could not save that event.')
        setSaving(false)
        return
      }
    } else {
      const row = localRow(form, tz, status.schemaReady)
      if (row.start_time && row.end_time && new Date(row.end_time) <= new Date(row.start_time)) {
        setFormError('The end time must be after the start time.')
        setSaving(false)
        return
      }
      const result = editingId
        ? await supabase.from('calendar_events').update(row).eq('id', editingId)
        : await supabase.from('calendar_events').insert({ ...row, created_by: user.id })
      if (result.error) {
        setFormError(dbMessage(result.error))
        setSaving(false)
        return
      }
    }

    setForm(emptyForm(today))
    setEditingId(null)
    setShowForm(false)
    setMessage(status.needsReconnect
      ? { tone: 'ok', text: 'Saved in the dashboard. Reconnect Google Calendar to copy it to the shared calendar.' }
      : null)
    await fetchEvents()
    setSaving(false)
  }

  async function handleDelete(evt) {
    if (status.needsReconnect && evt.google_event_id) {
      setMessage({ tone: 'error', text: 'Reconnect Google Calendar before deleting this event.' })
      return
    }
    if (evt.google_event_id) {
      const ok = window.confirm(`Delete "${evt.title}" from Google Calendar too?`)
      if (!ok) return
    }
    if (googleWritable) {
      const res = await fetch(`/api/calendar/events/${evt.id}`, { method: 'DELETE' })
      const body = await readJson(res)
      if (!res.ok) {
        if (body.code === 'needs_reconnect') setStatus((current) => ({ ...current, needsReconnect: true }))
        setMessage({ tone: 'error', text: body.error || 'Could not delete that event.' })
        return
      }
    } else {
      const { error } = await supabase.from('calendar_events').delete().eq('id', evt.id)
      if (error) {
        setMessage({ tone: 'error', text: dbMessage(error) })
        return
      }
    }
    setEvents((prev) => prev.filter((item) => item.id !== evt.id))
  }

  async function handleImport() {
    setImporting(true)
    setImportResult(null)
    const res = await fetch('/api/google/import', { method: 'POST' })
    const body = await readJson(res)
    if (!res.ok) {
      setMessage({ tone: 'error', text: body.error || 'Could not import events.' })
    } else {
      setImportResult(body)
      await fetchEvents()
    }
    setImporting(false)
  }

  async function handleDisconnect() {
    setDisconnecting(true)
    const res = await fetch('/api/google/disconnect', { method: 'POST' })
    const body = await readJson(res)
    if (!res.ok) {
      setMessage({ tone: 'error', text: body.error || 'Could not disconnect Google Calendar.' })
    } else {
      setStatus((current) => ({
        ...current,
        connected: false,
        needsReconnect: false,
        email: null,
      }))
      setImportResult(null)
      setMessage({ tone: 'ok', text: 'Google Calendar disconnected. Dashboard events are unchanged.' })
    }
    setDisconnecting(false)
  }

  const inputClass = 'w-full px-3.5 py-2.5 bg-[#F9F9FB] rounded-xl border border-[#E5E5EA] text-[14px] text-[#1C1C1E] placeholder-[#AEAEB2] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF] transition-all'
  const showTimes = status.schemaReady

  return (
    <div>
      <PageHeader onAdd={openNew} subtitle={subtitle} />

      {message && (
        <div className={`rounded-2xl px-4 py-3 mb-4 text-[14px] ${message.tone === 'ok' ? 'bg-[#E8F8EE] text-[#1C7C3A]' : 'bg-[#FFF0EF] text-[#FF3B30]'}`}>
          {message.text}
        </div>
      )}

      {!loading && (
        <GoogleCalendarCard
          status={status}
          unlinkedCount={unlinkedCount}
          importing={importing}
          disconnecting={disconnecting}
          importResult={importResult}
          onImport={handleImport}
          onDisconnect={handleDisconnect}
        />
      )}

      {showForm && (
        <div className="bg-white rounded-2xl p-6 card mb-6">
          <h3 className="text-[15px] font-semibold text-[#1C1C1E] mb-5">{editingId ? 'Edit Event' : 'New Event'}</h3>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Title *</label>
              <input
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
                <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Start Date *</label>
                <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} required className={inputClass} />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">End Date</label>
                <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className={inputClass} />
              </div>
            </div>
            {showTimes && (
              <>
                <label className="flex items-center gap-2 text-[14px] text-[#1C1C1E]">
                  <input
                    type="checkbox"
                    checked={form.all_day}
                    onChange={(e) => setForm({ ...form, all_day: e.target.checked })}
                    className="accent-[#007AFF]"
                  />
                  All day
                </label>
                {!form.all_day && (
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Start Time *</label>
                      <input
                        type="time"
                        value={form.start_time}
                        onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                        required
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">End Time</label>
                      <input
                        type="time"
                        value={form.end_time}
                        onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
            <div>
              <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Notes</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                placeholder="Optional details"
                className={`${inputClass} resize-none`}
              />
            </div>
            {formError && <p className="text-[13px] text-[#FF3B30] bg-[#FFF0EF] px-3 py-2 rounded-lg">{formError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => { setShowForm(false); setEditingId(null) }} className="px-4 py-2 text-[14px] font-medium text-[#6C6C70] hover:bg-[#F2F2F7] rounded-xl transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="px-5 py-2 bg-[#007AFF] hover:bg-[#0066DD] disabled:opacity-50 text-white text-[14px] font-semibold rounded-xl transition-colors">
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Save Event'}
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
        <EmptyState connected={googleWritable} label={status.calendarLabel} />
      ) : (
        <div className="space-y-8">
          <EventSection title="Upcoming" events={upcoming} tz={tz} showSource={status.connected} onEdit={openEdit} onDelete={handleDelete} />
          {past.length > 0 && (
            <EventSection title="Past" events={[...past].reverse()} tz={tz} showSource={status.connected} onEdit={openEdit} onDelete={handleDelete} dim />
          )}
        </div>
      )}
    </div>
  )
}

function EmptyState({ connected, label }) {
  return (
    <div className="bg-white rounded-2xl p-12 card flex flex-col items-center text-center">
      <div className="w-14 h-14 bg-[#F2F2F7] rounded-2xl flex items-center justify-center mb-4">
        <svg viewBox="0 0 20 20" fill="none" stroke="#AEAEB2" strokeWidth="1.5" className="w-7 h-7">
          <rect x="2.5" y="3.75" width="15" height="13.75" rx="1.5" />
          <path d="M2.5 7.917h15M6.667 2.5v2.5M13.333 2.5v2.5" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-[16px] font-semibold text-[#1C1C1E] mb-1">No events yet</p>
      <p className="text-[14px] text-[#AEAEB2]">
        {connected
          ? `Add an event and it will be saved to ${label || 'Google Calendar'}.`
          : 'Add your first household event to get started.'}
      </p>
    </div>
  )
}
