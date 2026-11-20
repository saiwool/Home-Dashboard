'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()
const EMOJIS = ['💌', '🌸', '🎉', '🌟', '❤️', '🏠', '✨', '🍕', '😊', '🎈']

function fmtTime(ts) {
  if (!ts) return ''
  const diff = (Date.now() - new Date(ts).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const inputClass = 'w-full px-3.5 py-2.5 bg-[#F9F9FB] rounded-xl border border-[#E5E5EA] text-[14px] text-[#1C1C1E] placeholder-[#AEAEB2] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF] transition-all'

export default function InboxWidget() {
  const [open, setOpen] = useState(false)
  const [composing, setComposing] = useState(false)
  const [messages, setMessages] = useState([])
  const [profiles, setProfiles] = useState([])
  const [currentUserId, setCurrentUserId] = useState(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [poofing, setPoofing] = useState(new Set())
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ to_user_id: '', emoji: '💌', body: '' })

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setCurrentUserId(user.id)

      // Auto-create profile if missing (handles users created before trigger was set up)
      await supabase.from('profiles')
        .upsert({ id: user.id, display_name: user.email?.split('@')[0] }, { onConflict: 'id', ignoreDuplicates: true })

      const [{ data: profileData }, { count }] = await Promise.all([
        supabase.from('profiles').select('id, display_name, first_name'),
        supabase.from('inbox_messages')
          .select('*', { count: 'exact', head: true })
          .eq('to_user_id', user.id)
          .is('archived_at', null),
      ])
      setProfiles(profileData || [])
      setUnreadCount(count || 0)
    }
    init()
  }, [])

  useEffect(() => {
    if (!open || !currentUserId) return
    let cancelled = false
    supabase
      .from('inbox_messages')
      .select('*')
      .eq('to_user_id', currentUserId)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return
        setMessages(data || [])
        setUnreadCount(data?.length || 0)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, currentUserId])

  function handlePoof(msgId) {
    setPoofing((prev) => new Set([...prev, msgId]))
    setTimeout(async () => {
      await supabase.from('inbox_messages')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', msgId)
      setMessages((prev) => {
        const next = prev.filter((m) => m.id !== msgId)
        setUnreadCount(next.length)
        return next
      })
      setPoofing((prev) => { const n = new Set(prev); n.delete(msgId); return n })
    }, 460)
  }

  async function handleSend(e) {
    e.preventDefault()
    if (!currentUserId || !form.to_user_id) return
    setSaving(true)
    await supabase.from('inbox_messages').insert({
      from_user_id: currentUserId,
      to_user_id: form.to_user_id,
      emoji: form.emoji,
      subject: 'Note',
      body: form.body,
    })
    setForm({ to_user_id: '', emoji: '💌', body: '' })
    setComposing(false)
    setSaving(false)
  }

  const otherProfiles = profiles.filter((p) => p.id !== currentUserId)

  function getName(id) {
    const p = profiles.find((p) => p.id === id)
    return p?.display_name || p?.first_name || 'Someone'
  }

  function close() {
    setOpen(false)
    setComposing(false)
  }

  return (
    <>
      {/* Trigger */}
      <button
        onClick={() => {
          setLoading(true)
          setOpen(true)
        }}
        className="relative p-2.5 bg-white rounded-2xl card hover:bg-[#F9F9FB] transition-colors shrink-0"
        title="Notes"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="#1C1C1E" strokeWidth="1.5" className="w-5 h-5">
          <path d="M2.5 5.833A1.667 1.667 0 0 1 4.167 4.167h11.666A1.667 1.667 0 0 1 17.5 5.833v9.167a1.667 1.667 0 0 1-1.667 1.667H4.167A1.667 1.667 0 0 1 2.5 15V5.833Z" />
          <path d="M2.5 6.25l7.5 5 7.5-5" strokeLinecap="round" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-[#FF3B30] rounded-full text-white text-[10px] font-bold flex items-center justify-center px-1 leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/25 backdrop-blur-[2px]"
            onClick={close}
          />

          {/* Panel */}
          <div
            className="relative w-full max-w-sm bg-white rounded-3xl overflow-hidden"
            style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.22)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[#F2F2F7]">
              <h3 className="text-[17px] font-bold text-[#1C1C1E]">
                {composing ? 'Write a Note' : 'Notes'}
              </h3>
              <div className="flex items-center gap-2">
                {!composing && (
                  <button
                    onClick={() => setComposing(true)}
                    className="px-3 py-1.5 bg-[#007AFF] text-white text-[12.5px] font-semibold rounded-lg transition-colors hover:bg-[#0066DD]"
                  >
                    Write
                  </button>
                )}
                <button
                  onClick={composing ? () => setComposing(false) : close}
                  className="w-7 h-7 rounded-full bg-[#F2F2F7] flex items-center justify-center text-[#6C6C70] hover:bg-[#E5E5EA] transition-colors"
                >
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-3.5 h-3.5">
                    <path d="M5 15L15 5M5 5l10 10" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="overflow-y-auto" style={{ maxHeight: '58vh' }}>
              {composing ? (
                <form onSubmit={handleSend} className="p-5 space-y-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">To</label>
                    <select
                      value={form.to_user_id}
                      onChange={(e) => setForm({ ...form, to_user_id: e.target.value })}
                      required
                      className={inputClass}
                    >
                      <option value="">Choose someone…</option>
                      {otherProfiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.display_name || p.first_name || 'Someone'}
                        </option>
                      ))}
                    </select>
                    {otherProfiles.length === 0 && (
                      <p className="text-[11px] text-[#AEAEB2] mt-1.5">
                        No other members yet — have your partner sign in once to appear here.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Sticker</label>
                    <div className="flex flex-wrap gap-2">
                      {EMOJIS.map((e) => (
                        <button
                          key={e}
                          type="button"
                          onClick={() => setForm({ ...form, emoji: e })}
                          className={`w-9 h-9 text-[18px] rounded-xl flex items-center justify-center transition-all ${
                            form.emoji === e
                              ? 'bg-[#EBF5FF] ring-2 ring-[#007AFF]'
                              : 'bg-[#F2F2F7] hover:bg-[#E5E5EA]'
                          }`}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Message</label>
                    <textarea
                      value={form.body}
                      onChange={(e) => setForm({ ...form, body: e.target.value })}
                      required
                      rows={3}
                      placeholder="Write something nice…"
                      className={`${inputClass} resize-none`}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={saving || !form.to_user_id}
                    className="w-full py-3 bg-[#007AFF] hover:bg-[#0066DD] disabled:opacity-50 text-white text-[14px] font-semibold rounded-xl transition-colors"
                  >
                    {saving ? 'Sending…' : 'Send Note 💌'}
                  </button>
                </form>
              ) : loading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-5 h-5 border-2 border-[#007AFF]/30 border-t-[#007AFF] rounded-full animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center py-16 px-8 text-center">
                  <div className="text-[44px] mb-3">💌</div>
                  <p className="text-[15px] font-semibold text-[#1C1C1E] mb-1">No notes yet</p>
                  <p className="text-[13px] text-[#AEAEB2]">Write a note to your partner and it will appear here.</p>
                </div>
              ) : (
                <div className="p-4 space-y-3">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`rounded-2xl p-4 border border-[#F5E6C8] bg-[#FFFBF0] ${poofing.has(msg.id) ? 'animate-poof' : ''}`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-[28px] leading-none shrink-0 mt-0.5">{msg.emoji || '💌'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] text-[#3A3A3C] leading-relaxed">{msg.body}</p>
                          <p className="text-[11px] text-[#AEAEB2] mt-2">
                            From {getName(msg.from_user_id)} · {fmtTime(msg.created_at)}
                          </p>
                        </div>
                        <button
                          onClick={() => handlePoof(msg.id)}
                          title="Poof it away ✓"
                          className="shrink-0 w-7 h-7 rounded-full bg-white hover:bg-[#E8F8ED] border border-[#E5E5EA] flex items-center justify-center text-[#AEAEB2] hover:text-[#28A745] transition-all mt-0.5"
                        >
                          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-3 h-3">
                            <path d="M4 10l4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
