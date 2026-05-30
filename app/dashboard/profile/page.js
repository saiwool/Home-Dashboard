'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

const inputClass = 'w-full px-3.5 py-2.5 bg-[#F9F9FB] rounded-xl border border-[#E5E5EA] text-[14px] text-[#1C1C1E] placeholder-[#AEAEB2] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF] transition-all'

export default function ProfilePage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [user, setUser] = useState(null)
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    display_name: '',
    avatar_url: '',
  })

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, last_name, display_name, avatar_url')
        .eq('id', user.id)
        .single()
      if (profile) {
        setForm({
          first_name: profile.first_name || '',
          last_name: profile.last_name || '',
          display_name: profile.display_name || '',
          avatar_url: profile.avatar_url || '',
        })
      }
      setLoading(false)
    }
    load()
  }, [])

  async function handleSave(e) {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    await supabase
      .from('profiles')
      .update({
        first_name: form.first_name || null,
        last_name: form.last_name || null,
        display_name: form.display_name || null,
        avatar_url: form.avatar_url || null,
      })
      .eq('id', user.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const initials = form.display_name
    ? form.display_name.slice(0, 2).toUpperCase()
    : form.first_name
    ? (form.first_name[0] + (form.last_name?.[0] || '')).toUpperCase()
    : '??'

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <h2 className="text-[22px] font-bold text-[#1C1C1E] tracking-[-0.01em]">Profile</h2>
        <p className="text-[14px] text-[#AEAEB2] mt-0.5">Your name and avatar shown to household members</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-[#007AFF]/30 border-t-[#007AFF] rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-6 card">
          {/* Avatar preview */}
          <div className="flex items-center gap-5 mb-7 pb-6 border-b border-[#F2F2F7]">
            {form.avatar_url ? (
              <img
                src={form.avatar_url}
                alt={form.display_name || 'Avatar'}
                className="w-16 h-16 rounded-full object-cover shrink-0"
                onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
              />
            ) : null}
            <div
              className="w-16 h-16 rounded-full bg-[#EBF5FF] flex items-center justify-center shrink-0"
              style={{ display: form.avatar_url ? 'none' : 'flex' }}
            >
              <span className="text-[18px] font-semibold text-[#007AFF]">{initials}</span>
            </div>
            <div>
              <p className="text-[15px] font-semibold text-[#1C1C1E]">
                {form.first_name || form.display_name || 'Your Name'}
                {form.last_name ? ` ${form.last_name}` : ''}
              </p>
              <p className="text-[13px] text-[#AEAEB2] mt-0.5">{user?.email}</p>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">First Name</label>
                <input
                  type="text"
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                  placeholder="Jane"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Last Name</label>
                <input
                  type="text"
                  value={form.last_name}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                  placeholder="Smith"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Display Name</label>
              <input
                type="text"
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                placeholder="How others see you (e.g. Jane)"
                className={inputClass}
              />
              <p className="text-[11px] text-[#AEAEB2] mt-1.5">Shown on tasks, events, and messages. Defaults to email prefix.</p>
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Avatar URL</label>
              <input
                type="url"
                value={form.avatar_url}
                onChange={(e) => setForm({ ...form, avatar_url: e.target.value })}
                placeholder="https://example.com/your-photo.jpg"
                className={inputClass}
              />
              <p className="text-[11px] text-[#AEAEB2] mt-1.5">Paste a direct link to any image — your profile photo, avatar, etc.</p>
            </div>

            <div className="flex items-center justify-between pt-2">
              {saved && (
                <span className="text-[13px] text-[#28A745] font-medium">Saved!</span>
              )}
              <div className="ml-auto">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 bg-[#007AFF] hover:bg-[#0066DD] disabled:opacity-50 text-white text-[14px] font-semibold rounded-xl transition-colors"
                >
                  {saving ? 'Saving…' : 'Save Profile'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
