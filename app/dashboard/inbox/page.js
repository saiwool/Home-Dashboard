'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTimezone } from '@/app/hooks/useTimezone'
import { getTodayStr } from '@/lib/dateUtils'

const supabase = createClient()

const PRESET_EMOJIS = ['💌', '🌸', '🎉', '🌟', '❤️', '🏠', '✨', '🍕', '😊', '🎈']

const inputClass = 'w-full px-3.5 py-2.5 bg-[#F9F9FB] rounded-xl border border-[#E5E5EA] text-[14px] text-[#1C1C1E] placeholder-[#AEAEB2] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF] transition-all'

function fmtTimestamp(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' at ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export default function InboxPage() {
  const tz = useTimezone()
  const today = useMemo(() => getTodayStr(tz), [tz])

  const [tab, setTab] = useState('inbox')
  const [messages, setMessages] = useState([])
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [showCompose, setShowCompose] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    to_user_id: '',
    emoji: '💌',
    subject: '',
    body: '',
    expires_at: '',
  })

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, display_name, first_name, avatar_url')
      setProfiles(profileData || [])
      await fetchMessages(user)
    }
    init()
  }, [])

  async function fetchMessages(u) {
    setLoading(true)
    const currentUser = u || user
    const query = tab === 'inbox'
      ? supabase.from('inbox_messages').select('*').eq('to_user_id', currentUser.id).is('archived_at', null).order('created_at', { ascending: false })
      : supabase.from('inbox_messages').select('*').eq('from_user_id', currentUser.id).order('created_at', { ascending: false })
    const { data } = await query
    setMessages(data || [])
    setLoading(false)
  }

  useEffect(() => {
    if (user) fetchMessages(user)
  }, [tab])

  async function handleSend(e) {
    e.preventDefault()
    if (!user || !form.to_user_id) return
    setSaving(true)
    await supabase.from('inbox_messages').insert({
      from_user_id: user.id,
      to_user_id: form.to_user_id,
      emoji: form.emoji,
      subject: form.subject,
      body: form.body,
      expires_at: form.expires_at ? new Date(form.expires_at + 'T23:59:59').toISOString() : null,
    })
    setForm({ to_user_id: '', emoji: '💌', subject: '', body: '', expires_at: '' })
    setShowCompose(false)
    setSaving(false)
    if (tab === 'sent') fetchMessages(user)
    else setTab('sent')
  }

  async function handleArchive(id) {
    await supabase
      .from('inbox_messages')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', id)
    setMessages((prev) => prev.filter((m) => m.id !== id))
  }

  const profileMap = Object.fromEntries(profiles.map((p) => [p.id, p]))

  function getDisplayName(id) {
    const p = profileMap[id]
    if (!p) return 'Someone'
    return p.display_name || p.first_name || 'Someone'
  }

  const otherProfiles = profiles.filter((p) => p.id !== user?.id)
  const inboxCount = tab === 'inbox' ? messages.length : null

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-[22px] font-bold text-[#1C1C1E] tracking-[-0.01em]">Inbox</h2>
          <p className="text-[14px] text-[#AEAEB2] mt-0.5">Letters from your household</p>
        </div>
        <button
          onClick={() => setShowCompose(!showCompose)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#007AFF] hover:bg-[#0066DD] text-white text-[13.5px] font-semibold rounded-xl transition-colors shrink-0"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-4 h-4">
            <path d="M2.5 5.833A1.667 1.667 0 0 1 4.167 4.167h11.666A1.667 1.667 0 0 1 17.5 5.833v9.167a1.667 1.667 0 0 1-1.667 1.667H4.167A1.667 1.667 0 0 1 2.5 15V5.833Z" />
            <path d="M2.5 6.25l7.5 5 7.5-5" strokeLinecap="round" />
          </svg>
          Write Letter
        </button>
      </div>

      {/* Compose form */}
      {showCompose && (
        <div className="bg-white rounded-2xl p-6 card mb-6">
          <h3 className="text-[15px] font-semibold text-[#1C1C1E] mb-5">New Letter</h3>
          <form onSubmit={handleSend} className="space-y-4">
            <div>
              <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">To</label>
              <select
                value={form.to_user_id}
                onChange={(e) => setForm({ ...form, to_user_id: e.target.value })}
                required
                className={inputClass}
              >
                <option value="">Choose someone…</option>
                {otherProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name || p.first_name || p.id.slice(0, 8)}
                  </option>
                ))}
              </select>
              {otherProfiles.length === 0 && (
                <p className="text-[12px] text-[#AEAEB2] mt-1.5">No other household members yet. Invite someone to sign up!</p>
              )}
            </div>

            {/* Emoji picker */}
            <div>
              <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Sticker</label>
              <div className="flex flex-wrap gap-2">
                {PRESET_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setForm({ ...form, emoji })}
                    className={`w-9 h-9 text-[20px] rounded-xl flex items-center justify-center transition-all ${
                      form.emoji === emoji
                        ? 'bg-[#EBF5FF] ring-2 ring-[#007AFF]'
                        : 'bg-[#F2F2F7] hover:bg-[#E5E5EA]'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Subject</label>
              <input
                type="text"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                required
                placeholder="What's this about?"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Message</label>
              <textarea
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                required
                rows={4}
                placeholder="Write your message…"
                className={`${inputClass} resize-none`}
              />
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">
                Expires <span className="normal-case text-[#AEAEB2] font-normal">(optional)</span>
              </label>
              <input
                type="date"
                value={form.expires_at}
                min={today}
                onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                className={inputClass}
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setShowCompose(false)} className="px-4 py-2 text-[14px] font-medium text-[#6C6C70] hover:bg-[#F2F2F7] rounded-xl transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving || !form.to_user_id} className="px-5 py-2 bg-[#007AFF] hover:bg-[#0066DD] disabled:opacity-50 text-white text-[14px] font-semibold rounded-xl transition-colors">
                {saving ? 'Sending…' : 'Send Letter'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tabs */}
      <div className="flex bg-[#F2F2F7] rounded-xl p-1 gap-1 mb-6 w-fit">
        {['inbox', 'sent'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-[13.5px] font-semibold rounded-lg transition-all duration-150 capitalize ${
              tab === t ? 'bg-white text-[#1C1C1E] shadow-sm' : 'text-[#6C6C70]'
            }`}
          >
            {t}
            {t === 'inbox' && messages.length > 0 && tab === 'inbox' && (
              <span className="ml-1.5 px-1.5 py-0.5 bg-[#007AFF] text-white text-[10px] font-bold rounded-full leading-none">
                {messages.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Message list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-[#007AFF]/30 border-t-[#007AFF] rounded-full animate-spin" />
        </div>
      ) : messages.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 card flex flex-col items-center text-center">
          <div className="text-[40px] mb-4">{tab === 'inbox' ? '💌' : '📬'}</div>
          <p className="text-[16px] font-semibold text-[#1C1C1E] mb-1">
            {tab === 'inbox' ? 'No letters yet' : 'Nothing sent yet'}
          </p>
          <p className="text-[14px] text-[#AEAEB2] max-w-xs">
            {tab === 'inbox'
              ? 'When a household member sends you a letter, it will appear here.'
              : 'Write someone a letter — they\'ll love it.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((msg) => {
            const isExpired = msg.expires_at && new Date(msg.expires_at) < new Date()
            const personId = tab === 'inbox' ? msg.from_user_id : msg.to_user_id
            const personName = getDisplayName(personId)
            const personProfile = profileMap[personId]

            return (
              <div
                key={msg.id}
                className={`rounded-2xl p-5 border transition-opacity ${
                  isExpired
                    ? 'bg-[#F9F9FB] border-[#E5E5EA] opacity-60'
                    : 'bg-[#FFFBF0] border-[#F5E6C8]'
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Emoji sticker */}
                  <div className="w-11 h-11 rounded-2xl bg-white flex items-center justify-center text-[22px] shrink-0 shadow-sm">
                    {msg.emoji || '💌'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 flex-wrap">
                      <p className="text-[15px] font-semibold text-[#1C1C1E]">{msg.subject}</p>
                      {isExpired && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 bg-[#F2F2F7] text-[#AEAEB2] rounded-full">
                          Expired
                        </span>
                      )}
                      {msg.expires_at && !isExpired && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 bg-[#FFF4E5] text-[#E6860A] rounded-full">
                          Expires {new Date(msg.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>
                    <p className="text-[14px] text-[#3A3A3C] mt-2 leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#F0E0C0]">
                  <div className="flex items-center gap-2">
                    {personProfile?.avatar_url ? (
                      <img src={personProfile.avatar_url} alt={personName} className="w-5 h-5 rounded-full object-cover" />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-[#EBF5FF] flex items-center justify-center">
                        <span className="text-[8px] font-semibold text-[#007AFF]">{personName.slice(0, 2).toUpperCase()}</span>
                      </div>
                    )}
                    <span className="text-[12px] text-[#AEAEB2]">
                      {tab === 'inbox' ? 'From' : 'To'} {personName} · {fmtTimestamp(msg.created_at)}
                    </span>
                  </div>
                  {tab === 'inbox' && (
                    <button
                      onClick={() => handleArchive(msg.id)}
                      className="text-[12px] font-medium text-[#AEAEB2] hover:text-[#6C6C70] transition-colors"
                    >
                      Archive
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
