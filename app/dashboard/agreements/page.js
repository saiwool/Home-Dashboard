'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

const STATUS_STYLES = {
  pending: 'bg-amber-50 text-amber-700 border-amber-100',
  approved: 'bg-green-50 text-green-700 border-green-100',
  denied: 'bg-red-50 text-red-600 border-red-100',
}

const STATUS_LABELS = { pending: 'Pending', approved: 'Approved', denied: 'Denied' }

export default function AgreementsPage() {
  const [agreements, setAgreements] = useState([])
  const [profiles, setProfiles] = useState({})
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', content: '' })
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    const [{ data: agData }, { data: profileData }] = await Promise.all([
      supabase.from('agreements').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, display_name'),
    ])
    setAgreements(agData || [])
    setProfiles(Object.fromEntries((profileData || []).map((p) => [p.id, p.display_name])))
    setLoading(false)
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    const { error } = await supabase.from('agreements').insert({
      created_by: user.id,
      title: form.title,
      content: form.content,
    })
    if (!error) {
      setForm({ title: '', content: '' })
      setShowForm(false)
      fetchData()
    }
    setSaving(false)
  }

  async function handleRespond(id, status) {
    if (!user) return
    await supabase.from('agreements').update({ status, responded_by: user.id, updated_at: new Date().toISOString() }).eq('id', id)
    setAgreements((prev) => prev.map((a) => a.id === id ? { ...a, status, responded_by: user.id } : a))
  }

  async function handleDelete(id) {
    await supabase.from('agreements').delete().eq('id', id)
    setAgreements((prev) => prev.filter((a) => a.id !== id))
  }

  const filtered = filter === 'all' ? agreements : agreements.filter((a) => a.status === filter)

  const counts = {
    all: agreements.length,
    pending: agreements.filter((a) => a.status === 'pending').length,
    approved: agreements.filter((a) => a.status === 'approved').length,
    denied: agreements.filter((a) => a.status === 'denied').length,
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Agreements</h2>
          <p className="text-slate-500 text-sm mt-0.5">Propose and approve household decisions</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Proposal
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-semibold text-slate-900 mb-4">New Proposal</h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Title *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
                placeholder="e.g. Get a new plant, reduce dining budget…"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Details *</label>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                required
                rows={4}
                placeholder="Describe your proposal in detail…"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button type="submit" disabled={saving} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-lg">
                {saving ? 'Posting…' : 'Post Proposal'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {['all', 'pending', 'approved', 'denied'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
              filter === f ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {f === 'all' ? 'All' : STATUS_LABELS[f]} {counts[f] > 0 && <span className="ml-1 opacity-70">({counts[f]})</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">No {filter === 'all' ? '' : filter + ' '}proposals yet</div>
      ) : (
        <div className="space-y-4">
          {filtered.map((agreement) => {
            const isOwn = user?.id === agreement.created_by
            const isPending = agreement.status === 'pending'
            return (
              <div key={agreement.id} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="font-semibold text-slate-900">{agreement.title}</h3>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${STATUS_STYLES[agreement.status]}`}>
                        {STATUS_LABELS[agreement.status]}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 mt-2 leading-relaxed">{agreement.content}</p>
                    <div className="mt-3 flex items-center gap-4 text-xs text-slate-400">
                      <span>Proposed by {isOwn ? 'you' : profiles[agreement.created_by] || 'partner'}</span>
                      <span>{new Date(agreement.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      {agreement.responded_by && (
                        <span>
                          {agreement.status === 'approved' ? 'Approved' : 'Denied'} by{' '}
                          {agreement.responded_by === user?.id ? 'you' : profiles[agreement.responded_by] || 'partner'}
                        </span>
                      )}
                    </div>
                  </div>
                  {isOwn && (
                    <button onClick={() => handleDelete(agreement.id)} className="text-slate-300 hover:text-red-400 transition-colors shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>

                {!isOwn && isPending && (
                  <div className="mt-4 pt-4 border-t border-slate-100 flex gap-2">
                    <button
                      onClick={() => handleRespond(agreement.id, 'approved')}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 text-sm font-medium rounded-lg transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      Approve
                    </button>
                    <button
                      onClick={() => handleRespond(agreement.id, 'denied')}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium rounded-lg transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Deny
                    </button>
                  </div>
                )}
                {isOwn && isPending && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <p className="text-xs text-slate-400 italic">Waiting for your partner to respond…</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
