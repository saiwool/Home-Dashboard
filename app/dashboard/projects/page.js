'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTimezone } from '@/app/hooks/useTimezone'
import { getTodayStr } from '@/lib/dateUtils'
import { isMissingRelation } from '@/lib/dbErrors'
import { LoadingSpinner, MissingTableNotice, QueryError } from '@/app/components/QueryState'

const supabase = createClient()

const STATUSES = [
  { value: 'idea', label: 'Idea' },
  { value: 'planned', label: 'Planned' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
]

const PRIORITIES = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 }

const priorityClass = {
  high: 'bg-[#FFF0EF] text-[#FF3B30]',
  medium: 'bg-[#FFF4E5] text-[#E6860A]',
  low: 'bg-[#F2F2F7] text-[#6C6C70]',
}

const emptyForm = {
  title: '',
  status: 'idea',
  priority: 'medium',
  target_date: '',
  notes: '',
}

const inputClass = 'w-full px-3.5 py-2.5 bg-[#F9F9FB] rounded-xl border border-[#E5E5EA] text-[14px] text-[#1C1C1E] placeholder-[#AEAEB2] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF] transition-all'

function sortProjects(projects) {
  return [...projects].sort((a, b) => {
    const priority = (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1)
    if (priority !== 0) return priority
    if (a.target_date && b.target_date && a.target_date !== b.target_date) {
      return a.target_date.localeCompare(b.target_date)
    }
    if (a.target_date && !b.target_date) return -1
    if (!a.target_date && b.target_date) return 1
    return (a.created_at || '').localeCompare(b.created_at || '')
  })
}

function formatTarget(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function ProjectsPage() {
  const tz = useTimezone()
  const today = useMemo(() => getTodayStr(tz), [tz])

  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [user, setUser] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [actionError, setActionError] = useState('')
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
  }, [])

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('house_projects')
        .select('*')
        .order('created_at', { ascending: true })
      if (!active) return
      if (error) {
        setProjects([])
        setLoadError(error)
      } else {
        setProjects(sortProjects(data || []))
        setLoadError(null)
      }
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [reloadToken])

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setFormError('')
    setShowForm(true)
  }

  function openEdit(project) {
    setEditingId(project.id)
    setForm({
      title: project.title,
      status: project.status,
      priority: project.priority,
      target_date: project.target_date || '',
      notes: project.notes || '',
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
      status: form.status,
      priority: form.priority,
      target_date: form.target_date || null,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    }
    const query = editingId
      ? supabase.from('house_projects').update(payload).eq('id', editingId)
      : supabase.from('house_projects').insert({ ...payload, created_by: user.id })
    const { data, error } = await query.select().single()
    if (error) {
      if (isMissingRelation(error)) setLoadError(error)
      setFormError(error.message)
    } else if (data) {
      setProjects((prev) => sortProjects(editingId
        ? prev.map((project) => (project.id === data.id ? data : project))
        : [...prev, data]))
      setForm(emptyForm)
      setEditingId(null)
      setShowForm(false)
    }
    setSaving(false)
  }

  async function setStatus(project, status) {
    if (status === project.status) return
    const updatedAt = new Date().toISOString()
    setActionError('')
    setProjects((prev) => prev.map((row) => (row.id === project.id ? { ...row, status, updated_at: updatedAt } : row)))
    const { data, error } = await supabase
      .from('house_projects')
      .update({ status, updated_at: updatedAt })
      .eq('id', project.id)
      .select()
      .single()
    if (error) {
      setProjects((prev) => prev.map((row) => (row.id === project.id ? project : row)))
      setActionError(error.message)
      return
    }
    if (data) setProjects((prev) => sortProjects(prev.map((row) => (row.id === data.id ? data : row))))
  }

  async function handleDelete(project) {
    const previous = projects
    setProjects((prev) => prev.filter((row) => row.id !== project.id))
    if (editingId === project.id) {
      setEditingId(null)
      setShowForm(false)
    }
    const { error } = await supabase.from('house_projects').delete().eq('id', project.id)
    if (error) {
      setProjects(previous)
      setActionError(error.message)
    }
  }

  const missing = isMissingRelation(loadError)
  const columns = STATUSES.map((status) => ({
    ...status,
    items: projects.filter((project) => project.status === status.value),
  }))

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-[22px] font-bold text-[#1C1C1E] tracking-[-0.01em]">Projects</h2>
          <p className="text-[14px] text-[#AEAEB2] mt-0.5">Bigger jobs, whenever you get to them</p>
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
            Add Project
          </button>
        )}
      </div>

      {showForm && !missing && (
        <div className="bg-white rounded-2xl p-6 card mb-6">
          <h3 className="text-[15px] font-semibold text-[#1C1C1E] mb-5">{editingId ? 'Edit project' : 'New project'}</h3>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Title *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
                placeholder="Paint the bedroom, fix the fence, new shelves…"
                className={inputClass}
              />
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Status</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputClass}>
                  {STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Priority</label>
                <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className={inputClass}>
                  {PRIORITIES.map((priority) => <option key={priority.value} value={priority.value}>{priority.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Target date</label>
                <input
                  type="date"
                  value={form.target_date}
                  onChange={(e) => setForm({ ...form, target_date: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
                placeholder="Materials, who is doing it, why it can wait…"
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
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add project'}
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
        <MissingTableNotice feature="Projects" />
      ) : loadError ? (
        <QueryError message={loadError.message} onRetry={() => setReloadToken((value) => value + 1)} />
      ) : projects.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 card flex flex-col items-center text-center">
          <div className="w-14 h-14 bg-[#F2F2F7] rounded-2xl flex items-center justify-center mb-4">
            <svg viewBox="0 0 20 20" fill="none" stroke="#AEAEB2" strokeWidth="1.5" className="w-7 h-7">
              <rect x="2.5" y="3.333" width="4.167" height="13.334" rx="1" />
              <rect x="7.917" y="3.333" width="4.167" height="8.334" rx="1" />
              <rect x="13.333" y="3.333" width="4.167" height="10.834" rx="1" />
            </svg>
          </div>
          <p className="text-[16px] font-semibold text-[#1C1C1E] mb-1">No projects yet</p>
          <p className="text-[14px] text-[#AEAEB2] max-w-xs">Park house projects here so they stay off the daily list until you are ready.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 items-start">
          {columns.map((column) => (
            <section key={column.value} className="min-w-0">
              <div className="flex items-baseline justify-between mb-3 px-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[#AEAEB2]">{column.label}</p>
                <p className="text-[12px] font-medium text-[#AEAEB2]">{column.items.length}</p>
              </div>
              {column.items.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#E5E5EA] px-4 py-8 text-center">
                  <p className="text-[13px] text-[#AEAEB2]">Nothing here</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {column.items.map((project) => {
                    const late = project.target_date && project.target_date < today && project.status !== 'done'
                    return (
                      <article key={project.id} className={`bg-white rounded-2xl p-4 card ${column.value === 'done' ? 'opacity-70' : ''}`}>
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[14px] font-semibold text-[#1C1C1E] break-words">{project.title}</p>
                          <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full font-medium ${priorityClass[project.priority] || priorityClass.medium}`}>
                            {PRIORITIES.find((item) => item.value === project.priority)?.label || project.priority}
                          </span>
                        </div>
                        {project.target_date && (
                          <p className={`text-[12px] mt-2 ${late ? 'text-[#FF3B30] font-medium' : 'text-[#AEAEB2]'}`}>
                            {late ? 'Target passed · ' : 'Target '}
                            {formatTarget(project.target_date)}
                          </p>
                        )}
                        {project.notes && (
                          <p className="text-[13px] text-[#6C6C70] mt-2 whitespace-pre-wrap break-words">{project.notes}</p>
                        )}
                        <div className="flex items-center gap-2 mt-3">
                          <select
                            value={project.status}
                            onChange={(e) => setStatus(project, e.target.value)}
                            aria-label={`Status for ${project.title}`}
                            className="flex-1 min-w-0 px-2.5 py-1.5 bg-[#F9F9FB] rounded-lg border border-[#E5E5EA] text-[13px] text-[#1C1C1E] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20"
                          >
                            {STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                          </select>
                          <button
                            type="button"
                            onClick={() => openEdit(project)}
                            className="text-[13px] font-medium text-[#007AFF] px-2 py-1.5 rounded-lg hover:bg-[#EBF5FF]"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(project)}
                            aria-label={`Delete ${project.title}`}
                            className="text-[#C7C7CC] hover:text-[#FF3B30] hover:bg-[#FFF0EF] p-1.5 rounded-lg"
                          >
                            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-3.5 h-3.5">
                              <path d="M5 15L15 5M5 5l10 10" strokeLinecap="round" />
                            </svg>
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
