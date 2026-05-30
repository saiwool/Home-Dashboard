'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

const FREQUENCIES = [
  { value: 'daily', label: 'Daily', days: 1 },
  { value: 'weekly', label: 'Weekly', days: 7 },
  { value: 'biweekly', label: 'Every 2 weeks', days: 14 },
  { value: 'monthly', label: 'Monthly', days: 30 },
]

const today = new Date().toISOString().split('T')[0]

function nextDueDate(freq) {
  const days = FREQUENCIES.find((f) => f.value === freq)?.days ?? 7
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function fmtRelative(d) {
  if (!d) return null
  const diff = Math.ceil((new Date(d + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff < 0) return `${Math.abs(diff)}d overdue`
  if (diff < 7) return `In ${diff} days`
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const inputClass = 'w-full px-3.5 py-2.5 bg-[#F9F9FB] rounded-xl border border-[#E5E5EA] text-[14px] text-[#1C1C1E] placeholder-[#AEAEB2] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF] transition-all'

export default function CleaningPage() {
  const [tasks, setTasks] = useState([])
  const [profiles, setProfiles] = useState({})
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [users, setUsers] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', frequency: 'weekly', assigned_to: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    const [{ data: taskData }, { data: profileData }] = await Promise.all([
      supabase.from('cleaning_tasks').select('*').order('next_due', { ascending: true, nullsFirst: false }),
      supabase.from('profiles').select('id, display_name'),
    ])
    setTasks(taskData || [])
    setProfiles(Object.fromEntries((profileData || []).map((p) => [p.id, p.display_name])))
    setUsers(profileData || [])
    setLoading(false)
  }

  async function handleAdd(e) {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    const { error } = await supabase.from('cleaning_tasks').insert({
      created_by: user.id,
      assigned_to: form.assigned_to || null,
      name: form.name,
      frequency: form.frequency,
      next_due: nextDueDate(form.frequency),
    })
    if (!error) {
      setForm({ name: '', frequency: 'weekly', assigned_to: '' })
      setShowForm(false)
      fetchData()
    }
    setSaving(false)
  }

  async function handleMarkDone(task) {
    const done = today
    const due = nextDueDate(task.frequency)
    await supabase.from('cleaning_tasks').update({ last_done: done, next_due: due }).eq('id', task.id)
    setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, last_done: done, next_due: due } : t))
  }

  async function handleDelete(id) {
    await supabase.from('cleaning_tasks').delete().eq('id', id)
    setTasks((prev) => prev.filter((t) => t.id !== id))
  }

  const threeDays = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0]
  const overdue = tasks.filter((t) => t.next_due && t.next_due < today)
  const dueSoon = tasks.filter((t) => t.next_due && t.next_due >= today && t.next_due <= threeDays)
  const upcoming = tasks.filter((t) => !t.next_due || t.next_due > threeDays)

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-[22px] font-bold text-[#1C1C1E] tracking-[-0.01em]">Cleaning</h2>
          <p className="text-[14px] text-[#AEAEB2] mt-0.5">Keep the house sparkling</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#007AFF] hover:bg-[#0066DD] text-white text-[13.5px] font-semibold rounded-xl transition-colors shrink-0"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <path d="M10 4v12M4 10h12" strokeLinecap="round" />
          </svg>
          Add Task
        </button>
      </div>

      {tasks.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white rounded-2xl p-4 card text-center">
            <p className={`text-[24px] font-bold ${overdue.length > 0 ? 'text-[#FF3B30]' : 'text-[#AEAEB2]'}`}>{overdue.length}</p>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#AEAEB2] mt-0.5">Overdue</p>
          </div>
          <div className="bg-white rounded-2xl p-4 card text-center">
            <p className={`text-[24px] font-bold ${dueSoon.length > 0 ? 'text-[#E6860A]' : 'text-[#AEAEB2]'}`}>{dueSoon.length}</p>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#AEAEB2] mt-0.5">Due Soon</p>
          </div>
          <div className="bg-white rounded-2xl p-4 card text-center">
            <p className="text-[24px] font-bold text-[#28A745]">{upcoming.length}</p>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#AEAEB2] mt-0.5">Upcoming</p>
          </div>
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-2xl p-6 card mb-6">
          <h3 className="text-[15px] font-semibold text-[#1C1C1E] mb-5">New Cleaning Task</h3>
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Task Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                placeholder="e.g. Vacuum living room, scrub bathrooms…"
                className={inputClass}
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Frequency</label>
                <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} className={inputClass}>
                  {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Assigned To</label>
                <select value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })} className={inputClass}>
                  <option value="">Anyone</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.display_name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-[14px] font-medium text-[#6C6C70] hover:bg-[#F2F2F7] rounded-xl transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="px-5 py-2 bg-[#007AFF] hover:bg-[#0066DD] disabled:opacity-50 text-white text-[14px] font-semibold rounded-xl transition-colors">
                {saving ? 'Saving…' : 'Add Task'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-[#007AFF]/30 border-t-[#007AFF] rounded-full animate-spin" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 card flex flex-col items-center text-center">
          <div className="w-14 h-14 bg-[#F2F2F7] rounded-2xl flex items-center justify-center mb-4">
            <svg viewBox="0 0 20 20" fill="none" stroke="#AEAEB2" strokeWidth="1.5" className="w-7 h-7">
              <path d="M10 2.5l.833 2.5H13.333l-2.083 1.458.833 2.709L10 7.708l-2.083 1.459.833-2.709L6.667 5H9.167L10 2.5Z" strokeLinejoin="round" />
              <path d="M5 13.75l2.5-2.5M4.167 15.833C3.333 15.833 2.5 15 2.5 14.167S3.333 12.5 4.167 12.5L7.5 15.833s-1.667 1.667-3.333 0Z" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="text-[16px] font-semibold text-[#1C1C1E] mb-1">No cleaning tasks yet</p>
          <p className="text-[14px] text-[#AEAEB2]">Add tasks to keep track of your cleaning schedule.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {tasks.map((task) => {
            const isOverdue = task.next_due && task.next_due < today
            const isDueSoon = !isOverdue && task.next_due && task.next_due <= threeDays
            const freqLabel = FREQUENCIES.find((f) => f.value === task.frequency)?.label ?? task.frequency
            return (
              <div
                key={task.id}
                className={`bg-white rounded-2xl p-4 card flex items-center gap-4 ${
                  isOverdue ? 'border-l-4 border-l-[#FF3B30]' : isDueSoon ? 'border-l-4 border-l-[#FF9500]' : ''
                }`}
              >
                {/* Done button */}
                <button
                  onClick={() => handleMarkDone(task)}
                  title="Mark as done"
                  className="shrink-0 w-6 h-6 rounded-full border-2 border-[#C7C7CC] hover:border-[#34C759] hover:bg-[#E8F8ED] transition-all duration-150 flex items-center justify-center group"
                >
                  <svg viewBox="0 0 20 20" fill="none" stroke="#34C759" strokeWidth="2.5" className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <path d="M4 10l4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[14px] font-medium text-[#1C1C1E]">{task.name}</p>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#F2F2F7] text-[#6C6C70] font-medium">
                      {freqLabel}
                    </span>
                    {task.assigned_to && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#EBF5FF] text-[#007AFF] font-medium">
                        {profiles[task.assigned_to] ?? ''}
                      </span>
                    )}
                  </div>
                  <p className={`text-[12px] mt-1 ${isOverdue ? 'text-[#FF3B30] font-medium' : isDueSoon ? 'text-[#E6860A]' : 'text-[#AEAEB2]'}`}>
                    {task.next_due ? fmtRelative(task.next_due) : 'No due date'}
                    {task.last_done && <span className="text-[#AEAEB2] font-normal"> · Last done {fmtRelative(task.last_done)}</span>}
                  </p>
                </div>

                <button
                  onClick={() => handleDelete(task.id)}
                  className="text-[#C7C7CC] hover:text-[#FF3B30] hover:bg-[#FFF0EF] p-1.5 rounded-lg transition-all duration-150 shrink-0"
                >
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-3.5 h-3.5">
                    <path d="M5 15L15 5M5 5l10 10" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
