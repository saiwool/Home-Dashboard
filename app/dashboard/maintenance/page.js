'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTimezone } from '@/app/hooks/useTimezone'
import { addDays, advanceByFrequency, fmtRelative, getTodayStr } from '@/lib/dateUtils'
import { isMissingRelation } from '@/lib/dbErrors'
import { LoadingSpinner, MissingTableNotice, QueryError } from '@/app/components/QueryState'

const supabase = createClient()

const FREQUENCIES = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'semiannual', label: 'Every 6 months' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'custom', label: 'Custom days' },
]

const emptyForm = {
  name: '',
  frequency: 'monthly',
  custom_days: '',
  assigned_to: '',
  notes: '',
  last_done: '',
}

const inputClass = 'w-full px-3.5 py-2.5 bg-[#F9F9FB] rounded-xl border border-[#E5E5EA] text-[14px] text-[#1C1C1E] placeholder-[#AEAEB2] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF] transition-all'

function frequencyLabel(task) {
  if (task.frequency === 'custom') {
    return task.custom_days ? `Every ${task.custom_days} days` : 'Custom'
  }
  return FREQUENCIES.find((item) => item.value === task.frequency)?.label ?? task.frequency
}

function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    if (!a.next_due && !b.next_due) return a.name.localeCompare(b.name)
    if (!a.next_due) return 1
    if (!b.next_due) return -1
    return a.next_due.localeCompare(b.next_due) || a.name.localeCompare(b.name)
  })
}

function customDaysValue(frequency, raw) {
  if (frequency !== 'custom') return null
  const days = parseInt(raw, 10)
  return Number.isFinite(days) && days > 0 ? days : null
}

export default function MaintenancePage() {
  const tz = useTimezone()
  const today = useMemo(() => getTodayStr(tz), [tz])
  const horizon = useMemo(() => addDays(today, 14), [today])

  const [tasks, setTasks] = useState([])
  const [profiles, setProfiles] = useState({})
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [user, setUser] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
  }, [])

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      const [{ data: taskData, error: taskError }, { data: profileData, error: profileError }] = await Promise.all([
        supabase.from('maintenance_tasks').select('*').order('next_due', { ascending: true, nullsFirst: false }),
        supabase.from('profiles').select('id, display_name'),
      ])
      if (!active) return
      if (taskError) {
        setTasks([])
        setLoadError(taskError)
      } else {
        setTasks(sortTasks(taskData || []))
        setLoadError(null)
      }
      if (!profileError) {
        setProfiles(Object.fromEntries((profileData || []).map((profile) => [profile.id, profile.display_name])))
        setUsers(profileData || [])
      }
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [reloadToken])

  const previewDue = useMemo(() => {
    const days = customDaysValue(form.frequency, form.custom_days)
    if (form.frequency === 'custom' && !days) return null
    const editing = tasks.find((task) => task.id === editingId)
    const lastDone = form.last_done || null
    const scheduleChanged = !editing
      || editing.frequency !== form.frequency
      || (editing.custom_days || null) !== days
      || (editing.last_done || null) !== lastDone
    if (!scheduleChanged) return editing.next_due
    return advanceByFrequency(lastDone || today, form.frequency, days)
  }, [form, tasks, editingId, today])

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setFormError('')
    setShowForm(true)
  }

  function openEdit(task) {
    setEditingId(task.id)
    setForm({
      name: task.name,
      frequency: task.frequency,
      custom_days: task.custom_days ? String(task.custom_days) : '',
      assigned_to: task.assigned_to || '',
      notes: task.notes || '',
      last_done: task.last_done || '',
    })
    setFormError('')
    setShowForm(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!user) return
    const days = customDaysValue(form.frequency, form.custom_days)
    if (form.frequency === 'custom' && !days) {
      setFormError('Enter how many days between each time.')
      return
    }
    setSaving(true)
    setFormError('')

    const editing = tasks.find((task) => task.id === editingId)
    const lastDone = form.last_done || null
    const scheduleChanged = !editing
      || editing.frequency !== form.frequency
      || (editing.custom_days || null) !== days
      || (editing.last_done || null) !== lastDone
    const nextDue = scheduleChanged
      ? advanceByFrequency(lastDone || today, form.frequency, days)
      : editing.next_due

    const payload = {
      name: form.name.trim(),
      frequency: form.frequency,
      custom_days: days,
      assigned_to: form.assigned_to || null,
      notes: form.notes.trim() || null,
      last_done: lastDone,
      next_due: nextDue,
    }

    const query = editing
      ? supabase.from('maintenance_tasks').update(payload).eq('id', editing.id)
      : supabase.from('maintenance_tasks').insert({ ...payload, created_by: user.id })

    const { data, error } = await query.select().single()
    if (error) {
      if (isMissingRelation(error)) setLoadError(error)
      setFormError(error.message)
    } else if (data) {
      setTasks((prev) => sortTasks(editing
        ? prev.map((task) => (task.id === data.id ? data : task))
        : [...prev, data]))
      setForm(emptyForm)
      setEditingId(null)
      setShowForm(false)
    }
    setSaving(false)
  }

  async function handleMarkDone(task) {
    const nextDue = advanceByFrequency(today, task.frequency, task.custom_days)
    const patch = { last_done: today, next_due: nextDue }
    setTasks((prev) => sortTasks(prev.map((row) => (row.id === task.id ? { ...row, ...patch } : row))))
    const { data, error } = await supabase
      .from('maintenance_tasks')
      .update(patch)
      .eq('id', task.id)
      .select()
      .single()
    if (error) {
      setTasks((prev) => sortTasks(prev.map((row) => (row.id === task.id ? task : row))))
      setFormError(error.message)
      return
    }
    if (data) setTasks((prev) => sortTasks(prev.map((row) => (row.id === data.id ? data : row))))
  }

  async function handleDelete(task) {
    const previous = tasks
    setTasks((prev) => prev.filter((row) => row.id !== task.id))
    const { error } = await supabase.from('maintenance_tasks').delete().eq('id', task.id)
    if (error) setTasks(previous)
  }

  const overdue = tasks.filter((task) => task.next_due && task.next_due < today)
  const dueSoon = tasks.filter((task) => task.next_due && task.next_due >= today && task.next_due <= horizon)
  const later = tasks.filter((task) => !task.next_due || task.next_due > horizon)
  const missing = isMissingRelation(loadError)

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-[22px] font-bold text-[#1C1C1E] tracking-[-0.01em]">Maintenance</h2>
          <p className="text-[14px] text-[#AEAEB2] mt-0.5">Filters, detectors, oil changes, and the rest</p>
        </div>
        {!missing && (
          <button
            type="button"
            onClick={() => (showForm && !editingId ? setShowForm(false) : openCreate())}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#007AFF] hover:bg-[#0066DD] text-white text-[13.5px] font-semibold rounded-xl transition-colors shrink-0"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M10 4v12M4 10h12" strokeLinecap="round" />
            </svg>
            Add Task
          </button>
        )}
      </div>

      {tasks.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white rounded-2xl p-4 card text-center">
            <p className={`text-[24px] font-bold ${overdue.length > 0 ? 'text-[#FF3B30]' : 'text-[#AEAEB2]'}`}>{overdue.length}</p>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#AEAEB2] mt-0.5">Overdue</p>
          </div>
          <div className="bg-white rounded-2xl p-4 card text-center">
            <p className={`text-[24px] font-bold ${dueSoon.length > 0 ? 'text-[#E6860A]' : 'text-[#AEAEB2]'}`}>{dueSoon.length}</p>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#AEAEB2] mt-0.5">Next 14 days</p>
          </div>
          <div className="bg-white rounded-2xl p-4 card text-center">
            <p className="text-[24px] font-bold text-[#28A745]">{later.length}</p>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#AEAEB2] mt-0.5">Later</p>
          </div>
        </div>
      )}

      {showForm && !missing && (
        <div className="bg-white rounded-2xl p-6 card mb-6">
          <h3 className="text-[15px] font-semibold text-[#1C1C1E] mb-5">{editingId ? 'Edit task' : 'New maintenance task'}</h3>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Task *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                placeholder="HVAC filter, smoke detectors, oil change…"
                className={inputClass}
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Frequency</label>
                <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} className={inputClass}>
                  {FREQUENCIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </div>
              {form.frequency === 'custom' ? (
                <div>
                  <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Every how many days *</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={form.custom_days}
                    onChange={(e) => setForm({ ...form, custom_days: e.target.value })}
                    required
                    placeholder="45"
                    className={inputClass}
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Assigned to</label>
                  <select value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })} className={inputClass}>
                    <option value="">Anyone</option>
                    {users.map((person) => <option key={person.id} value={person.id}>{person.display_name}</option>)}
                  </select>
                </div>
              )}
            </div>
            {form.frequency === 'custom' && (
              <div>
                <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Assigned to</label>
                <select value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })} className={inputClass}>
                  <option value="">Anyone</option>
                  {users.map((person) => <option key={person.id} value={person.id}>{person.display_name}</option>)}
                </select>
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Last done</label>
                <input
                  type="date"
                  value={form.last_done}
                  onChange={(e) => setForm({ ...form, last_done: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="flex items-end">
                <p className="text-[13px] text-[#6C6C70] pb-2.5">
                  {previewDue
                    ? <>Next due <span className="font-semibold text-[#1C1C1E]">{fmtRelative(previewDue, today)}</span>. Marking it done moves the date forward.</>
                    : 'Enter a number of days to calculate the next due date.'}
                </p>
              </div>
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                placeholder="Filter size, where the ladder is, which car…"
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
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add task'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : missing ? (
        <MissingTableNotice feature="Maintenance" />
      ) : loadError ? (
        <QueryError message={loadError.message} onRetry={() => setReloadToken((value) => value + 1)} />
      ) : tasks.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 card flex flex-col items-center text-center">
          <div className="w-14 h-14 bg-[#F2F2F7] rounded-2xl flex items-center justify-center mb-4">
            <svg viewBox="0 0 20 20" fill="none" stroke="#AEAEB2" strokeWidth="1.5" className="w-7 h-7">
              <path d="M12.5 4.167c1.25-1.25 3.333-1.25 4.583 0s1.25 3.333 0 4.583L15 6.667 13.333 8.333l2.5 2.5c-1.25 1.25-3.333 1.25-4.583 0L7.5 14.583c-.834.834-2.083.834-2.917 0-.833-.833-.833-2.083 0-2.916L8.333 7.917C7.083 6.667 7.083 4.583 8.333 3.333" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="text-[16px] font-semibold text-[#1C1C1E] mb-1">No maintenance tasks yet</p>
          <p className="text-[14px] text-[#AEAEB2] max-w-xs">Track the things that come around every month or every year, separate from cleaning.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {tasks.map((task) => {
            const isOverdue = task.next_due && task.next_due < today
            const isDueSoon = !isOverdue && task.next_due && task.next_due <= horizon
            return (
              <div
                key={task.id}
                className={`bg-white rounded-2xl p-4 card flex items-center gap-4 ${
                  isOverdue ? 'border-l-4 border-l-[#FF3B30]' : isDueSoon ? 'border-l-4 border-l-[#FF9500]' : ''
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleMarkDone(task)}
                  title="Mark as done"
                  aria-label={`Mark ${task.name} done`}
                  className="shrink-0 w-6 h-6 rounded-full border-2 border-[#C7C7CC] hover:border-[#34C759] hover:bg-[#E8F8ED] transition-all flex items-center justify-center group"
                >
                  <svg viewBox="0 0 20 20" fill="none" stroke="#34C759" strokeWidth="2.5" className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <path d="M4 10l4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[14px] font-medium text-[#1C1C1E] break-words">{task.name}</p>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#F2F2F7] text-[#6C6C70] font-medium">
                      {frequencyLabel(task)}
                    </span>
                    {task.assigned_to && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#EBF5FF] text-[#007AFF] font-medium">
                        {profiles[task.assigned_to] ?? ''}
                      </span>
                    )}
                  </div>
                  <p className={`text-[12px] mt-1 ${isOverdue ? 'text-[#FF3B30] font-medium' : isDueSoon ? 'text-[#E6860A]' : 'text-[#AEAEB2]'}`}>
                    {task.next_due ? fmtRelative(task.next_due, today) : 'No due date'}
                    {task.last_done && <span className="text-[#AEAEB2] font-normal"> · Last done {fmtRelative(task.last_done, today)}</span>}
                  </p>
                  {task.notes && <p className="text-[13px] text-[#6C6C70] mt-1 break-words">{task.notes}</p>}
                </div>

                <button
                  type="button"
                  onClick={() => openEdit(task)}
                  aria-label={`Edit ${task.name}`}
                  className="text-[#C7C7CC] hover:text-[#007AFF] hover:bg-[#EBF5FF] p-1.5 rounded-lg transition-all shrink-0"
                >
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-3.5 h-3.5">
                    <path d="M11.25 4.167 15.833 8.75M3.333 16.667l.834-3.334L13.333 4.167a1.768 1.768 0 0 1 2.5 2.5L6.667 15.833l-3.334.834Z" strokeLinejoin="round" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(task)}
                  aria-label={`Delete ${task.name}`}
                  className="text-[#C7C7CC] hover:text-[#FF3B30] hover:bg-[#FFF0EF] p-1.5 rounded-lg transition-all shrink-0"
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
