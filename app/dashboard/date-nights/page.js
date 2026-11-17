'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTimezone } from '@/app/hooks/useTimezone'
import { getTodayStr } from '@/lib/dateUtils'
import { isMissingRelation } from '@/lib/dbErrors'
import { LoadingSpinner, MissingTableNotice, QueryError } from '@/app/components/QueryState'

const supabase = createClient()

const CATEGORIES = [
  'Dinner out',
  'Cooking together',
  'Movie',
  'At home',
  'Outdoors',
  'Day trip',
  'Show',
  'Other',
]

const COSTS = [
  { value: 'free', label: 'Free' },
  { value: '$', label: '$' },
  { value: '$$', label: '$$' },
  { value: '$$$', label: '$$$' },
]

const emptyForm = {
  title: '',
  category: 'Dinner out',
  cost_level: '$',
  notes: '',
}

const inputClass = 'w-full px-3.5 py-2.5 bg-[#F9F9FB] rounded-xl border border-[#E5E5EA] text-[14px] text-[#1C1C1E] placeholder-[#AEAEB2] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF] transition-all'

function formatDone(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function DateNightsPage() {
  const tz = useTimezone()
  const today = useMemo(() => getTodayStr(tz), [tz])

  const [ideas, setIdeas] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [user, setUser] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [actionError, setActionError] = useState('')
  const [picked, setPicked] = useState(null)
  const [doneDate, setDoneDate] = useState(today)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
  }, [])

  useEffect(() => {
    setDoneDate(today)
  }, [today])

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('date_nights')
        .select('*')
        .order('created_at', { ascending: false })
      if (!active) return
      if (error) {
        setIdeas([])
        setLoadError(error)
      } else {
        setIdeas(data || [])
        setLoadError(null)
      }
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [reloadToken])

  const openIdeas = ideas.filter((idea) => !idea.done_on)
  const doneIdeas = ideas
    .filter((idea) => idea.done_on)
    .sort((a, b) => b.done_on.localeCompare(a.done_on))

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setFormError('')
    setShowForm(true)
  }

  function openEdit(idea) {
    setEditingId(idea.id)
    setForm({
      title: idea.title,
      category: idea.category || 'Other',
      cost_level: idea.cost_level || '$',
      notes: idea.notes || '',
    })
    setFormError('')
    setShowForm(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    setFormError('')
    const payload = {
      title: form.title.trim(),
      category: form.category || null,
      cost_level: form.cost_level || null,
      notes: form.notes.trim() || null,
    }
    const query = editingId
      ? supabase.from('date_nights').update(payload).eq('id', editingId)
      : supabase.from('date_nights').insert({ ...payload, created_by: user.id })
    const { data, error } = await query.select().single()
    if (error) {
      if (isMissingRelation(error)) setLoadError(error)
      setFormError(error.message)
    } else if (data) {
      setIdeas((prev) => editingId
        ? prev.map((idea) => (idea.id === data.id ? data : idea))
        : [data, ...prev])
      if (picked?.id === data.id) setPicked(data)
      setForm(emptyForm)
      setEditingId(null)
      setShowForm(false)
    }
    setSaving(false)
  }

  function pickRandom() {
    const pool = openIdeas.filter((idea) => idea.id !== picked?.id)
    const source = pool.length ? pool : openIdeas
    if (!source.length) {
      setPicked(null)
      setActionError('Add an idea first, or bring a finished one back.')
      return
    }
    setActionError('')
    const choice = source[Math.floor(Math.random() * source.length)]
    setPicked(choice)
    setDoneDate(today)
  }

  async function markDone(idea, date) {
    if (!date) return
    setActionError('')
    const { data, error } = await supabase
      .from('date_nights')
      .update({ done_on: date })
      .eq('id', idea.id)
      .select()
      .single()
    if (error) {
      setActionError(error.message)
      return
    }
    if (data) {
      setIdeas((prev) => prev.map((row) => (row.id === data.id ? data : row)))
      if (picked?.id === data.id) setPicked(null)
    }
  }

  async function bringBack(idea) {
    setActionError('')
    const { data, error } = await supabase
      .from('date_nights')
      .update({ done_on: null })
      .eq('id', idea.id)
      .select()
      .single()
    if (error) {
      setActionError(error.message)
      return
    }
    if (data) setIdeas((prev) => prev.map((row) => (row.id === data.id ? data : row)))
  }

  async function handleDelete(idea) {
    const previous = ideas
    setIdeas((prev) => prev.filter((row) => row.id !== idea.id))
    if (picked?.id === idea.id) setPicked(null)
    if (editingId === idea.id) {
      setEditingId(null)
      setShowForm(false)
    }
    const { error } = await supabase.from('date_nights').delete().eq('id', idea.id)
    if (error) {
      setIdeas(previous)
      setActionError(error.message)
    }
  }

  const missing = isMissingRelation(loadError)

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-[22px] font-bold text-[#1C1C1E] tracking-[-0.01em]">Date Nights</h2>
          <p className="text-[14px] text-[#AEAEB2] mt-0.5">Ideas for when you don&apos;t want to decide</p>
        </div>
        {!missing && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={pickRandom}
              disabled={openIdeas.length === 0}
              className="px-4 py-2.5 bg-white card text-[13.5px] font-semibold text-[#1C1C1E] rounded-xl hover:bg-[#F9F9FB] disabled:opacity-40"
            >
              Pick one at random
            </button>
            <button
              type="button"
              onClick={() => (showForm && !editingId ? setShowForm(false) : openCreate())}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#007AFF] hover:bg-[#0066DD] text-white text-[13.5px] font-semibold rounded-xl transition-colors"
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <path d="M10 4v12M4 10h12" strokeLinecap="round" />
              </svg>
              Add Idea
            </button>
          </div>
        )}
      </div>

      {picked && (
        <div className="bg-[#EBF5FF] rounded-2xl p-6 mb-6 border border-[#007AFF]/15">
          <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[#007AFF] mb-2">How about this</p>
          <p className="text-[22px] font-bold text-[#1C1C1E] tracking-[-0.02em] break-words">{picked.title}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            {picked.category && <span className="text-[11px] px-2 py-0.5 rounded-full bg-white text-[#007AFF] font-medium">{picked.category}</span>}
            {picked.cost_level && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-white text-[#6C6C70] font-medium">
                {COSTS.find((cost) => cost.value === picked.cost_level)?.label || picked.cost_level}
              </span>
            )}
          </div>
          {picked.notes && <p className="text-[14px] text-[#3A3A3C] mt-3 whitespace-pre-wrap break-words">{picked.notes}</p>}
          <div className="flex flex-wrap items-end gap-2 mt-5">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#6C6C70] mb-1.5">Done on</label>
              <input
                type="date"
                value={doneDate}
                onChange={(e) => setDoneDate(e.target.value)}
                className={inputClass}
              />
            </div>
            <button
              type="button"
              onClick={() => markDone(picked, doneDate)}
              className="px-4 py-2.5 bg-[#007AFF] hover:bg-[#0066DD] text-white text-[14px] font-semibold rounded-xl"
            >
              Mark done
            </button>
            <button
              type="button"
              onClick={pickRandom}
              className="px-4 py-2.5 text-[14px] font-medium text-[#007AFF] hover:bg-white/70 rounded-xl"
            >
              Pick another
            </button>
          </div>
        </div>
      )}

      {showForm && !missing && (
        <div className="bg-white rounded-2xl p-6 card mb-6">
          <h3 className="text-[15px] font-semibold text-[#1C1C1E] mb-5">{editingId ? 'Edit idea' : 'New idea'}</h3>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Title *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
                placeholder="Pasta at the corner place, a walk after dark…"
                className={inputClass}
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Category</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputClass}>
                  {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Cost</label>
                <select value={form.cost_level} onChange={(e) => setForm({ ...form, cost_level: e.target.value })} className={inputClass}>
                  {COSTS.map((cost) => <option key={cost.value} value={cost.value}>{cost.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                placeholder="Reservations, what to wear, why it was fun last time…"
                className={`${inputClass} resize-none`}
              />
            </div>
            {formError && <p className="text-[13px] text-[#FF3B30] bg-[#FFF0EF] px-3 py-2 rounded-lg">{formError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => { setShowForm(false); setEditingId(null); setFormError('') }}
                className="px-4 py-2 text-[14px] font-medium text-[#6C6C70] hover:bg-[#F2F2F7] rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button type="submit" disabled={saving} className="px-5 py-2 bg-[#007AFF] hover:bg-[#0066DD] disabled:opacity-50 text-white text-[14px] font-semibold rounded-xl transition-colors">
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add idea'}
              </button>
            </div>
          </form>
        </div>
      )}

      {actionError && (
        <p className="text-[13px] text-[#FF3B30] bg-[#FFF0EF] px-3 py-2 rounded-lg mb-4">{actionError}</p>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : missing ? (
        <MissingTableNotice feature="Date nights" />
      ) : loadError ? (
        <QueryError message={loadError.message} onRetry={() => setReloadToken((value) => value + 1)} />
      ) : ideas.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 card flex flex-col items-center text-center">
          <div className="w-14 h-14 bg-[#F2F2F7] rounded-2xl flex items-center justify-center mb-4">
            <svg viewBox="0 0 20 20" fill="none" stroke="#AEAEB2" strokeWidth="1.5" className="w-7 h-7">
              <path d="M10 16.25S2.5 11.875 2.5 7.083c0-1.958 1.667-3.333 3.542-3.333C7.5 3.75 8.75 4.583 10 5.833c1.25-1.25 2.5-2.083 3.958-2.083 1.875 0 3.542 1.375 3.542 3.333C17.5 11.875 10 16.25 10 16.25Z" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="text-[16px] font-semibold text-[#1C1C1E] mb-1">No ideas yet</p>
          <p className="text-[14px] text-[#AEAEB2] max-w-xs">Save a few, then let the button choose when you are stuck.</p>
        </div>
      ) : (
        <div className="space-y-8">
          <section>
            <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[#AEAEB2] mb-3">Ideas</p>
            {openIdeas.length === 0 ? (
              <p className="text-[14px] text-[#AEAEB2]">Every idea has been done. Add another, or bring one back.</p>
            ) : (
              <div className="space-y-2.5">
                {openIdeas.map((idea) => (
                  <IdeaCard
                    key={idea.id}
                    idea={idea}
                    today={today}
                    onEdit={() => openEdit(idea)}
                    onDelete={() => handleDelete(idea)}
                    onDone={(date) => markDone(idea, date)}
                  />
                ))}
              </div>
            )}
          </section>

          {doneIdeas.length > 0 && (
            <section>
              <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[#AEAEB2] mb-3">Done</p>
              <div className="space-y-2.5">
                {doneIdeas.map((idea) => (
                  <div key={idea.id} className="bg-white rounded-2xl p-4 card flex items-start gap-4 opacity-80">
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-[#1C1C1E] break-words">{idea.title}</p>
                      <p className="text-[12px] text-[#AEAEB2] mt-1">
                        {idea.category ? `${idea.category} · ` : ''}Done {formatDone(idea.done_on)}
                      </p>
                      {idea.notes && <p className="text-[13px] text-[#6C6C70] mt-1 break-words">{idea.notes}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => bringBack(idea)}
                      className="text-[13px] font-medium text-[#007AFF] px-2 py-1.5 rounded-lg hover:bg-[#EBF5FF] shrink-0"
                    >
                      Use again
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(idea)}
                      aria-label={`Delete ${idea.title}`}
                      className="text-[#C7C7CC] hover:text-[#FF3B30] hover:bg-[#FFF0EF] p-1.5 rounded-lg shrink-0"
                    >
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-3.5 h-3.5">
                        <path d="M5 15L15 5M5 5l10 10" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

function IdeaCard({ idea, today, onEdit, onDelete, onDone }) {
  const [marking, setMarking] = useState(false)
  const [date, setDate] = useState(today)

  useEffect(() => {
    setDate(today)
  }, [today])

  return (
    <div className="bg-white rounded-2xl p-4 card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-[#1C1C1E] break-words">{idea.title}</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {idea.category && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#EBF5FF] text-[#007AFF] font-medium">{idea.category}</span>
            )}
            {idea.cost_level && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#F2F2F7] text-[#6C6C70] font-medium">
                {COSTS.find((cost) => cost.value === idea.cost_level)?.label || idea.cost_level}
              </span>
            )}
          </div>
          {idea.notes && <p className="text-[13px] text-[#6C6C70] mt-2 whitespace-pre-wrap break-words">{idea.notes}</p>}
        </div>
        <div className="flex items-center shrink-0">
          <button type="button" onClick={onEdit} className="text-[13px] font-medium text-[#6C6C70] px-2 py-1.5 rounded-lg hover:bg-[#F2F2F7]">
            Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${idea.title}`}
            className="text-[#C7C7CC] hover:text-[#FF3B30] hover:bg-[#FFF0EF] p-1.5 rounded-lg"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-3.5 h-3.5">
              <path d="M5 15L15 5M5 5l10 10" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-[#F2F2F7]">
        {marking ? (
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputClass} sm:max-w-[12rem]`} />
            <button
              type="button"
              onClick={() => { onDone(date); setMarking(false) }}
              className="px-3 py-2 bg-[#007AFF] text-white text-[13px] font-semibold rounded-xl"
            >
              Save date
            </button>
            <button type="button" onClick={() => setMarking(false)} className="px-3 py-2 text-[13px] font-medium text-[#6C6C70] rounded-xl hover:bg-[#F2F2F7]">
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setMarking(true)} className="text-[13px] font-semibold text-[#007AFF]">
            Mark done
          </button>
        )}
      </div>
    </div>
  )
}
