'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

const fmtDate = (d) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

const today = new Date().toISOString().split('T')[0]

export default function CalendarPage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [user, setUser] = useState(null)
  const [form, setForm] = useState({ title: '', description: '', start_date: today, end_date: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    fetchEvents()
  }, [])

  async function fetchEvents() {
    setLoading(true)
    const { data } = await supabase
      .from('calendar_events')
      .select('*')
      .order('start_date', { ascending: true })
    setEvents(data || [])
    setLoading(false)
  }

  async function handleAdd(e) {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    setError('')
    const { error } = await supabase.from('calendar_events').insert({
      created_by: user.id,
      title: form.title,
      description: form.description || null,
      start_date: form.start_date,
      end_date: form.end_date || form.start_date,
    })
    if (error) {
      setError(error.message)
    } else {
      setForm({ title: '', description: '', start_date: today, end_date: '' })
      setShowForm(false)
      fetchEvents()
    }
    setSaving(false)
  }

  async function handleDelete(id) {
    await supabase.from('calendar_events').delete().eq('id', id)
    setEvents((prev) => prev.filter((e) => e.id !== id))
  }

  const upcoming = events.filter((e) => e.start_date >= today)
  const past = events.filter((e) => e.start_date < today)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Calendar</h2>
          <p className="text-slate-500 text-sm mt-0.5">Shared household events</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Event
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-semibold text-slate-900 mb-4">New Event</h3>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Title *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                  placeholder="Event title"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Start Date *</label>
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
                <input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  placeholder="Optional notes"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-lg">
                {saving ? 'Saving…' : 'Save Event'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-slate-400">Loading events…</div>
      ) : (
        <>
          <EventSection title="Upcoming" events={upcoming} onDelete={handleDelete} today={today} />
          {past.length > 0 && <EventSection title="Past" events={past.reverse()} onDelete={handleDelete} today={today} dim />}
        </>
      )}
    </div>
  )
}

function EventSection({ title, events, onDelete, today, dim = false }) {
  if (!events.length) return null
  return (
    <div>
      <h3 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${dim ? 'text-slate-400' : 'text-slate-500'}`}>{title}</h3>
      <div className="space-y-2">
        {events.map((evt) => (
          <div key={evt.id} className={`bg-white rounded-xl p-4 shadow-sm border flex items-start gap-4 ${dim ? 'border-slate-100 opacity-60' : 'border-slate-100'}`}>
            <div className="text-center w-12 shrink-0">
              <div className="text-xs font-medium text-slate-500">
                {new Date(evt.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
              </div>
              <div className="text-xl font-bold text-slate-900 leading-none">
                {new Date(evt.start_date + 'T00:00:00').getDate()}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-800">{evt.title}</p>
              {evt.description && <p className="text-sm text-slate-500 mt-0.5">{evt.description}</p>}
              {evt.end_date && evt.end_date !== evt.start_date && (
                <p className="text-xs text-slate-400 mt-0.5">through {fmtDate(evt.end_date)}</p>
              )}
            </div>
            <button
              onClick={() => onDelete(evt.id)}
              className="text-slate-300 hover:text-red-400 transition-colors shrink-0"
              title="Delete event"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
