'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

const STATUS = {
  pending: { label: 'Pending', bg: 'bg-[#FFF4E5]', text: 'text-[#E6860A]' },
  approved: { label: 'Approved', bg: 'bg-[#E8F8ED]', text: 'text-[#1A7A36]' },
  denied: { label: 'Denied', bg: 'bg-[#FFF0EF]', text: 'text-[#FF3B30]' },
}

const inputClass = 'w-full px-3.5 py-2.5 bg-[#F9F9FB] rounded-xl border border-[#E5E5EA] text-[14px] text-[#1C1C1E] placeholder-[#AEAEB2] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF] transition-all'

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

  const counts = {
    all: agreements.length,
    pending: agreements.filter((a) => a.status === 'pending').length,
    approved: agreements.filter((a) => a.status === 'approved').length,
    denied: agreements.filter((a) => a.status === 'denied').length,
  }
  const filtered = filter === 'all' ? agreements : agreements.filter((a) => a.status === filter)

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-[22px] font-bold text-[#1C1C1E] tracking-[-0.01em]">Agreements</h2>
          <p className="text-[14px] text-[#AEAEB2] mt-0.5">Propose and approve household decisions</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#007AFF] hover:bg-[#0066DD] text-white text-[13.5px] font-semibold rounded-xl transition-colors shrink-0"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <path d="M10 4v12M4 10h12" strokeLinecap="round" />
          </svg>
          New Proposal
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl p-6 card mb-6">
          <h3 className="text-[15px] font-semibold text-[#1C1C1E] mb-5">New Proposal</h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Title *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
                placeholder="e.g. Get a new plant, reduce dining budget…"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Details *</label>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                required
                rows={4}
                placeholder="Describe your proposal…"
                className={`${inputClass} resize-none`}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-[14px] font-medium text-[#6C6C70] hover:bg-[#F2F2F7] rounded-xl transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="px-5 py-2 bg-[#007AFF] hover:bg-[#0066DD] disabled:opacity-50 text-white text-[14px] font-semibold rounded-xl transition-colors">
                {saving ? 'Posting…' : 'Post Proposal'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter pills */}
      <div className="flex gap-2 flex-wrap mb-5">
        {['all', 'pending', 'approved', 'denied'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-all duration-150 capitalize ${
              filter === f
                ? 'bg-[#1C1C1E] text-white'
                : 'bg-white text-[#6C6C70] border border-[#E5E5EA] hover:border-[#1C1C1E] hover:text-[#1C1C1E]'
            }`}
          >
            {f === 'all' ? 'All' : STATUS[f].label}
            {counts[f] > 0 && <span className="ml-1.5 opacity-60">{counts[f]}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-[#007AFF]/30 border-t-[#007AFF] rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 card text-center">
          <p className="text-[15px] font-semibold text-[#1C1C1E] mb-1">No proposals yet</p>
          <p className="text-[14px] text-[#AEAEB2]">Propose a household decision to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((agreement) => {
            const isOwn = user?.id === agreement.created_by
            const isPending = agreement.status === 'pending'
            const st = STATUS[agreement.status] ?? STATUS.pending
            return (
              <div key={agreement.id} className="bg-white rounded-2xl p-6 card">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap mb-2">
                      <h3 className="text-[15px] font-semibold text-[#1C1C1E]">{agreement.title}</h3>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${st.bg} ${st.text}`}>
                        {st.label}
                      </span>
                    </div>
                    <p className="text-[14px] text-[#6C6C70] leading-relaxed">{agreement.content}</p>
                    <div className="mt-3 flex items-center gap-3 flex-wrap text-[12px] text-[#AEAEB2]">
                      <span>by {isOwn ? 'you' : profiles[agreement.created_by] || 'partner'}</span>
                      <span>·</span>
                      <span>{new Date(agreement.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      {agreement.responded_by && (
                        <>
                          <span>·</span>
                          <span>
                            {agreement.status === 'approved' ? 'approved' : 'denied'} by{' '}
                            {agreement.responded_by === user?.id ? 'you' : profiles[agreement.responded_by] || 'partner'}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  {isOwn && (
                    <button
                      onClick={() => handleDelete(agreement.id)}
                      className="text-[#C7C7CC] hover:text-[#FF3B30] hover:bg-[#FFF0EF] p-1.5 rounded-lg transition-all duration-150 shrink-0"
                    >
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-3.5 h-3.5">
                        <path d="M5 15L15 5M5 5l10 10" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}
                </div>

                {!isOwn && isPending && (
                  <div className="mt-4 pt-4 border-t border-[#F2F2F7] flex gap-2">
                    <button
                      onClick={() => handleRespond(agreement.id, 'approved')}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-[#E8F8ED] hover:bg-[#D3F4DC] text-[#1A7A36] text-[13px] font-semibold rounded-xl transition-colors"
                    >
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                        <path d="M4 10l4.5 4.5 7.5-9" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Approve
                    </button>
                    <button
                      onClick={() => handleRespond(agreement.id, 'denied')}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-[#FFF0EF] hover:bg-[#FFE4E2] text-[#FF3B30] text-[13px] font-semibold rounded-xl transition-colors"
                    >
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                        <path d="M5 15L15 5M5 5l10 10" strokeLinecap="round" />
                      </svg>
                      Deny
                    </button>
                  </div>
                )}
                {isOwn && isPending && (
                  <div className="mt-4 pt-4 border-t border-[#F2F2F7]">
                    <p className="text-[12px] text-[#AEAEB2] italic">Waiting for your partner to respond…</p>
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
