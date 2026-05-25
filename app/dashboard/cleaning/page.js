'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

const FREQUENCIES = [
  { value: 'daily', label: 'Daily', days: 1 },
  { value: 'weekly', label: 'Weekly', days: 7 },
  { value: 'biweekly', label: 'Every 2 Weeks', days: 14 },
  { value: 'monthly', label: 'Monthly', days: 30 },
]

function nextDueDate(freq) {
  const days = FREQUENCIES.find((f) => f.value === freq)?.days || 7
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

const today = new Date().toISOString().split('T')[0]

function fmtDate(d) {
  if (!d) return null
  const date = new Date(d + 'T00:00:00')
  const diff = Math.ceil((date - new Date(today + 'T00:00:00')) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff < 0) return `${Math.abs(diff)} days overdue`
  if (diff < 7) return `In ${diff} days`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

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
    const profileMap = Object.fromEntries((profileData || []).map((p) => [p.id, p.display_name]))
    setProfiles(profileMap)
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

  const overdue = tasks.filter((t) => t.next_due && t.next_due < today)
  const dueSoon = tasks.filter((t) => t.next_due && t.next_due >= today && t.next_due <= new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0])
  const upcoming = tasks.filter((t) => !t.next_due || t.next_due > new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Cleaning Schedule</h2>
          <p className="text-slate-500 text-sm mt-0.5">Keep the house sparkling</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Task
        </button>
      </div>

      {tasks.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-red-50 rounded-xl p-4 border border-red-100 text-center">
            <p className="text-2xl font-bold text-red-600">{overdue.length}</p>
            <p className="text-xs font-medium text-red-500 mt-0.5">Overdue</p>
          </div>
          <div className="bg-amber-50 rounded-xl p-4 border border-amber-100 text-center">
            <p className="text-2xl font-bold text-amber-600">{dueSoon.length}</p>
            <p className="text-xs font-medium text-amber-500 mt-0.5">Due Soon</p>
          </div>
          <div className="bg-green-50 rounded-xl p-4 border border-green-100 text-center">
            <p className="text-2xl font-bold text-green-600">{upcoming.length}</p>
            <p className="text-xs font-medium text-green-500 mt-0.5">Upcoming</p>
          </div>
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-semibold text-slate-900 mb-4">New Cleaning Task</h3>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Task Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  placeholder="e.g. Vacuum living room, clean bathrooms…"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Frequency</label>
                <select
                  value={form.frequency}
                  onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Assign To</label>
                <select
                  value={form.assigned_to}
                  onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Anyone</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.display_name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button type="submit" disabled={saving} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-lg">
                {saving ? 'Saving…' : 'Add Task'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-slate-400">Loading…</div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-16 text-slate-400">No cleaning tasks yet. Add one to get started!</div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => {
            const isOverdue = task.next_due && task.next_due < today
            const isDueSoon = !isOverdue && task.next_due && task.next_due <= new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0]
            const statusColor = isOverdue ? 'border-l-red-400 bg-red-50/30' : isDueSoon ? 'border-l-amber-400 bg-amber-50/20' : 'border-l-transparent'
            const dotColor = isOverdue ? 'bg-red-400' : isDueSoon ? 'bg-amber-400' : 'bg-green-400'
            return (
              <div key={task.id} className={`bg-white rounded-xl p-4 shadow-sm border border-slate-100 border-l-4 ${statusColor} flex items-center gap-4`}>
                <button
                  onClick={() => handleMarkDone(task)}
                  title="Mark as done"
                  className="shrink-0 w-6 h-6 rounded-full border-2 border-slate-300 hover:border-green-500 hover:bg-green-50 transition-colors flex items-center justify-center group"
                >
                  <svg className="w-3 h-3 text-green-500 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-slate-800">{task.name}</p>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 capitalize">
                      {FREQUENCIES.find((f) => f.value === task.frequency)?.label || task.frequency}
                    </span>
                    {task.assigned_to && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
                        {profiles[task.assigned_to] || 'Unknown'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <div className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                    <p className={`text-xs ${isOverdue ? 'text-red-500 font-medium' : isDueSoon ? 'text-amber-600' : 'text-slate-400'}`}>
                      {task.next_due ? fmtDate(task.next_due) : 'No due date'}
                    </p>
                    {task.last_done && (
                      <p className="text-xs text-slate-400">Last done {fmtDate(task.last_done)}</p>
                    )}
                  </div>
                </div>
                <button onClick={() => handleDelete(task.id)} className="text-slate-300 hover:text-red-400 transition-colors shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
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
