'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()
const today = new Date().toISOString().split('T')[0]

const fmtDate = (d) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

function PageHeader({ onAdd }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h2 className="text-[22px] font-bold text-[#1C1C1E] tracking-[-0.01em]">Calendar</h2>
        <p className="text-[14px] text-[#AEAEB2] mt-0.5">Shared household events</p>
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

function EventCard({ evt, onDelete, dim }) {
  const d = new Date(evt.start_date + 'T00:00:00')
  return (
    <div className={`bg-white rounded-2xl p-4 card flex items-start gap-4 transition-opacity ${dim ? 'opacity-50' : ''}`}>
      <div className="shrink-0 w-12 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#AEAEB2]">
          {d.toLocaleDateString('en-US', { month: 'short' })}
        </p>
        <p className="text-[24px] font-bold text-[#1C1C1E] leading-tight">{d.getDate()}</p>
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-[14px] font-semibold text-[#1C1C1E]">{evt.title}</p>
        {evt.description && <p className="text-[13px] text-[#6C6C70] mt-0.5 line-clamp-2">{evt.description}</p>}
        {evt.end_date && evt.end_date !== evt.start_date && (
          <p className="text-[12px] text-[#AEAEB2] mt-1">through {fmtDate(evt.end_date)}</p>
        )}
      </div>
      <button
        onClick={() => onDelete(evt.id)}
        className="text-[#C7C7CC] hover:text-[#FF3B30] hover:bg-[#FFF0EF] p-1.5 rounded-lg transition-all duration-150 shrink-0"
        title="Delete event"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-3.5 h-3.5">
          <path d="M5 15L15 5M5 5l10 10" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}

function EventSection({ title, events, onDelete, dim }) {
  if (!events.length) return null
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[#AEAEB2] mb-3">{title}</p>
      <div className="space-y-2.5">
        {events.map((evt) => <EventCard key={evt.id} evt={evt} onDelete={onDelete} dim={dim} />)}
      </div>
    </div>
  )
}

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

  const inputClass = 'w-full px-3.5 py-2.5 bg-[#F9F9FB] rounded-xl border border-[#E5E5EA] text-[14px] text-[#1C1C1E] placeholder-[#AEAEB2] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF] transition-all'

  return (
    <div>
      <PageHeader onAdd={() => setShowForm(!showForm)} />

      {showForm && (
        <div className="bg-white rounded-2xl p-6 card mb-6">
          <h3 className="text-[15px] font-semibold text-[#1C1C1E] mb-5">New Event</h3>
          <form onSubmit={handleAdd} className="space-y-4">
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
            {error && <p className="text-[13px] text-[#FF3B30] bg-[#FFF0EF] px-3 py-2 rounded-lg">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-[14px] font-medium text-[#6C6C70] hover:bg-[#F2F2F7] rounded-xl transition-colors">
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
          <EventSection title="Upcoming" events={upcoming} onDelete={handleDelete} dim={false} />
          {past.length > 0 && <EventSection title="Past" events={[...past].reverse()} onDelete={handleDelete} dim />}
        </div>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="bg-white rounded-2xl p-12 card flex flex-col items-center text-center">
      <div className="w-14 h-14 bg-[#F2F2F7] rounded-2xl flex items-center justify-center mb-4">
        <svg viewBox="0 0 20 20" fill="none" stroke="#AEAEB2" strokeWidth="1.5" className="w-7 h-7">
          <rect x="2.5" y="3.75" width="15" height="13.75" rx="1.5" />
          <path d="M2.5 7.917h15M6.667 2.5v2.5M13.333 2.5v2.5" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-[16px] font-semibold text-[#1C1C1E] mb-1">No events yet</p>
      <p className="text-[14px] text-[#AEAEB2]">Add your first household event to get started.</p>
    </div>
  )
}
