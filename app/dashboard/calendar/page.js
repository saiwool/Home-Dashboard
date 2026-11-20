'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import CalendarBoard from '@/app/components/calendar/CalendarBoard'
import { useTimezone } from '@/app/hooks/useTimezone'
import { createClient } from '@/lib/supabase/client'
import { formatWallTime, getTodayStr, zonedTimeToUtc } from '@/lib/dateUtils'
import { isMissingColumn } from '@/lib/dbErrors'
import { GOOGLE_CONNECTED_MESSAGE, googleErrorMessage } from '@/lib/google/messages'

const supabase = createClient()

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

function personName(profile) {
  if (!profile) return ''
  return profile.display_name || profile.first_name || ''
}

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
  const [banner, setBanner] = useState(null)
  const [googleStatus, setGoogleStatus] = useState(null)
  const [manageOpen, setManageOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [tick, setTick] = useState(0)

  const reloadEvents = useCallback(() => setTick((value) => value + 1), [])

  useEffect(() => {
    let cancelled = false
    async function readReturn() {
      const params = new URLSearchParams(window.location.search)
      const flag = params.get('google')
      if (!flag || cancelled) return
      const reason = params.get('reason')
      const url = new URL(window.location.href)
      url.searchParams.delete('google')
      url.searchParams.delete('reason')
      const search = url.searchParams.toString()
      window.history.replaceState(null, '', `${url.pathname}${search ? `?${search}` : ''}`)
      await Promise.resolve()
      if (cancelled) return
      if (flag === 'connected') {
        setBanner({ type: 'success', text: GOOGLE_CONNECTED_MESSAGE })
        setManageOpen(true)
      }
      if (flag === 'error') setBanner({ type: 'error', text: googleErrorMessage(reason) })
    }
    readReturn()
    return () => {
      cancelled = true
    }
  }, [])

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

    async function loadStatus() {
      const res = await fetch('/api/google/status', { cache: 'no-store' }).catch(() => null)
      if (!res?.ok) return null
      return res.json().catch(() => null)
    }

    async function load() {
      if (tick === 0) setLoading(true)
      const first = await loadRows()
      if (cancelled) return
      setEvents(first.rows)
      setNames(first.names)
      setUserId(first.userId)
      setLoading(false)
      const status = await loadStatus()
      if (!cancelled && status) setGoogleStatus(status)

      const res = await fetch('/api/google/sync', { method: 'POST' }).catch(() => null)
      if (cancelled || !res?.ok) return
      const body = await res.json().catch(() => ({}))
      if (body.skipped) return
      const next = await loadRows()
      if (cancelled) return
      setEvents(next.rows)
      setNames(next.names)
      setUserId(next.userId)
      const nextStatus = await loadStatus()
      if (!cancelled && nextStatus) setGoogleStatus(nextStatus)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [tick])

  const targets = (googleStatus?.calendars || []).filter((calendar) => (
    calendar.selected && calendar.writable && !googleStatus?.needsReconnect
  ))
  const localEventCount = events.filter((event) => !event.google_event_id).length

  function closeForm() {
    setShowForm(false)
    setEditing(null)
    setError('')
  }

  function openCreate(preset = {}) {
    const date = preset.date || today
    setEditing(null)
    setError('')
    setForm({
      title: '',
      description: '',
      start_date: date,
      end_date: preset.endDate || '',
      all_day: preset.allDay !== false,
      start_time: preset.startTime || '09:00',
      end_time: preset.endTime || '10:00',
      google_calendar_id: '',
    })
    setShowForm(true)
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

  async function handleSave(event) {
    event.preventDefault()
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
    if (editing?.id === evt.id) closeForm()
  }

  async function syncNow() {
    setSyncing(true)
    setNotice(null)
    try {
      const res = await fetch('/api/google/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setNotice({ tone: 'error', text: body.error || 'Could not sync Google Calendar.' })
      } else if (body.skipped === 'needs_reconnect') {
        setNotice({ tone: 'error', text: 'Google needs you to connect again before Home can refresh events.' })
      } else if (body.calendarErrors?.length) {
        setNotice({ tone: 'error', text: body.calendarErrors.map((item) => `${item.name}: ${item.message}`).join(' ') })
      } else {
        setNotice({ tone: 'success', text: 'Calendars updated.' })
      }
      reloadEvents()
    } catch {
      setNotice({ tone: 'error', text: 'Could not sync Google Calendar. Try again.' })
    }
    setSyncing(false)
  }

  return (
    <CalendarBoard
      tz={tz}
      today={today}
      events={events}
      loading={loading}
      googleStatus={googleStatus}
      syncing={syncing}
      onSync={syncNow}
      notice={notice}
      banner={banner}
      onDismissBanner={() => setBanner(null)}
      userId={userId}
      names={names}
      manageOpen={manageOpen}
      onManageOpen={setManageOpen}
      localEventCount={localEventCount}
      onEventsChanged={reloadEvents}
      onGoogleStatus={setGoogleStatus}
      showForm={showForm}
      editing={editing}
      form={form}
      setForm={setForm}
      saving={saving}
      error={error}
      targets={targets}
      onCreate={openCreate}
      onEdit={openEdit}
      onCloseForm={closeForm}
      onSave={handleSave}
      onDelete={handleDelete}
    />
  )
}
