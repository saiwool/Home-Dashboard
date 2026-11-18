'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { isMissingRelation } from '@/lib/dbErrors'
import { LANDING_TABS, landingHref } from '@/lib/theme'
import { useTheme } from '@/app/components/ThemeProvider'
import ThemeToggle from '@/app/components/ThemeToggle'

const supabase = createClient()

const inputClass = 'w-full px-3.5 py-2.5 bg-[#F9F9FB] rounded-xl border border-[#E5E5EA] text-[14px] text-[#1C1C1E] placeholder-[#AEAEB2] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF] transition-all'

const MIGRATION = 'supabase/migrations/20261118_account_preferences.sql'

function describeError(error) {
  if (!error) return 'Something went wrong.'
  const message = error.message || 'Something went wrong.'
  if (isMissingRelation(error)) {
    return `The account tables are not ready yet. In the Supabase SQL Editor, run ${MIGRATION}, then try again. Supabase said: ${message}`
  }
  return message
}

function Notice({ message }) {
  if (!message) return null
  const ok = message.type === 'success'
  return (
    <p className={`text-[13px] px-3 py-2 rounded-xl ${ok ? 'bg-[#E8F8ED] text-[#1A7A36]' : 'bg-[#FFF0EF] text-[#FF3B30]'}`}>
      {message.text}
    </p>
  )
}

function memberName(profile) {
  if (!profile) return 'Household member'
  const full = [profile.first_name, profile.last_name].filter(Boolean).join(' ')
  return profile.display_name || full || 'Household member'
}

function initialsFor(profile, email) {
  const name = memberName(profile)
  if (name && name !== 'Household member') return name.slice(0, 2).toUpperCase()
  if (email) return email.slice(0, 2).toUpperCase()
  return '??'
}

export default function ProfilePage() {
  const router = useRouter()
  const { theme } = useTheme()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [user, setUser] = useState(null)
  const [members, setMembers] = useState([])
  const [profileSaving, setProfileSaving] = useState(false)
  const [emailSaving, setEmailSaving] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [prefSaving, setPrefSaving] = useState(false)
  const [profileMessage, setProfileMessage] = useState(null)
  const [emailMessage, setEmailMessage] = useState(null)
  const [passwordMessage, setPasswordMessage] = useState(null)
  const [prefMessage, setPrefMessage] = useState(null)
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    display_name: '',
    avatar_url: '',
  })
  const [nextEmail, setNextEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [defaultTab, setDefaultTab] = useState('overview')

  useEffect(() => {
    let cancelled = false

    async function load() {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (cancelled) return
      if (authError || !authData.user) {
        setLoadError(authError?.message || 'Sign in again to edit your account.')
        setLoading(false)
        return
      }

      const current = authData.user
      setUser(current)
      setNextEmail(current.email || '')

      const profileQuery = await supabase
        .from('profiles')
        .select('id, display_name, first_name, last_name, avatar_url, created_at')
        .order('created_at', { ascending: true })

      let profileRows = profileQuery.data
      let profileError = profileQuery.error
      if (profileError && isMissingRelation(profileError)) {
        const fallback = await supabase
          .from('profiles')
          .select('id, display_name, created_at')
          .order('created_at', { ascending: true })
        if (!fallback.error) {
          profileRows = fallback.data
          profileError = profileQuery.error
        } else {
          profileError = fallback.error
          profileRows = []
        }
      }

      if (cancelled) return
      if (profileError && !profileRows) {
        setLoadError(describeError(profileError))
      } else if (profileError && isMissingRelation(profileError)) {
        setLoadError(describeError(profileError))
      }

      const rows = profileRows || []
      setMembers(rows)
      const mine = rows.find((row) => row.id === current.id)
      if (mine) {
        setForm({
          first_name: mine.first_name || '',
          last_name: mine.last_name || '',
          display_name: mine.display_name || '',
          avatar_url: mine.avatar_url || '',
        })
      }

      const { data: prefs, error: prefsError } = await supabase
        .from('user_preferences')
        .select('theme, default_tab')
        .eq('id', current.id)
        .maybeSingle()

      if (cancelled) return
      if (prefsError) {
        setPrefMessage({ type: 'error', text: describeError(prefsError) })
      } else if (prefs?.default_tab && LANDING_TABS.some((tab) => tab.id === prefs.default_tab)) {
        setDefaultTab(prefs.default_tab)
      }

      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleProfileSave(event) {
    event.preventDefault()
    if (!user) return
    setProfileSaving(true)
    setProfileMessage(null)

    const payload = {
      id: user.id,
      first_name: form.first_name.trim() || null,
      last_name: form.last_name.trim() || null,
      display_name: form.display_name.trim() || null,
      avatar_url: form.avatar_url.trim() || null,
    }
    const { data, error } = await supabase
      .from('profiles')
      .upsert(payload, { onConflict: 'id' })
      .select('id, first_name, last_name, display_name, avatar_url')

    setProfileSaving(false)
    if (error) {
      setProfileMessage({ type: 'error', text: describeError(error) })
      return
    }
    if (!data || data.length === 0) {
      setProfileMessage({ type: 'error', text: 'Nothing was saved. You can only update your own profile.' })
      return
    }

    const saved = data[0]
    setForm({
      first_name: saved.first_name || '',
      last_name: saved.last_name || '',
      display_name: saved.display_name || '',
      avatar_url: saved.avatar_url || '',
    })
    setMembers((current) => {
      if (!current.some((row) => row.id === user.id)) return [...current, saved]
      return current.map((row) => (row.id === user.id ? { ...row, ...saved } : row))
    })
    setProfileMessage({ type: 'success', text: 'Profile saved.' })
    router.refresh()
  }

  async function handleEmailSave(event) {
    event.preventDefault()
    if (!user) return
    setEmailMessage(null)
    const email = nextEmail.trim()
    if (!email) {
      setEmailMessage({ type: 'error', text: 'Enter an email address.' })
      return
    }
    if (email.toLowerCase() === (user.email || '').toLowerCase()) {
      setEmailMessage({ type: 'error', text: 'That is already your login email.' })
      return
    }

    setEmailSaving(true)
    const { data, error } = await supabase.auth.updateUser({ email })
    setEmailSaving(false)
    if (error) {
      setEmailMessage({ type: 'error', text: error.message })
      return
    }

    const updated = data?.user
    if (updated) setUser(updated)
    if (updated?.new_email) {
      setEmailMessage({
        type: 'success',
        text: `Confirmation email sent. Check ${updated.new_email} and ${updated.email}. Your login email stays ${updated.email} until you confirm the change.`,
      })
      return
    }
    if (updated?.email && updated.email.toLowerCase() === email.toLowerCase()) {
      setEmailMessage({ type: 'success', text: 'Email updated.' })
      return
    }
    setEmailMessage({
      type: 'success',
      text: `Confirmation email sent to ${email}. Your login email stays ${user.email} until you confirm the new address.`,
    })
  }

  async function handlePasswordSave(event) {
    event.preventDefault()
    if (!user) return
    setPasswordMessage(null)
    if (password !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'Those passwords do not match.' })
      return
    }

    setPasswordSaving(true)
    const { error } = await supabase.auth.updateUser({ password })
    setPasswordSaving(false)
    if (error) {
      setPasswordMessage({ type: 'error', text: error.message })
      return
    }
    setPassword('')
    setConfirmPassword('')
    setPasswordMessage({ type: 'success', text: 'Password updated.' })
  }

  async function handlePreferencesSave(event) {
    event.preventDefault()
    if (!user) return
    setPrefSaving(true)
    setPrefMessage(null)
    const { data, error } = await supabase
      .from('user_preferences')
      .upsert({
        id: user.id,
        theme,
        default_tab: defaultTab,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })
      .select('theme, default_tab')

    setPrefSaving(false)
    if (error) {
      setPrefMessage({ type: 'error', text: describeError(error) })
      return
    }
    if (!data || data.length === 0) {
      setPrefMessage({ type: 'error', text: 'Nothing was saved. You can only update your own preferences.' })
      return
    }
    setPrefMessage({
      type: 'success',
      text: `Preferences saved. Next time you sign in you will land on ${landingHref(defaultTab)}.`,
    })
  }

  const household = members.length > 0 ? members : (user ? [{ id: user.id, display_name: user.email?.split('@')[0] }] : [])

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <h2 className="text-[22px] font-bold text-[#1C1C1E] tracking-[-0.01em]">Account</h2>
        <p className="text-[14px] text-[#AEAEB2] mt-0.5">Your name, login, and preferences. The other account stays theirs.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-[#007AFF]/30 border-t-[#007AFF] rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {loadError && (
            <div className="bg-[#FFF4E5] rounded-2xl px-4 py-3 text-[13px] text-[#1C1C1E]">
              {loadError}
            </div>
          )}

          <section className="bg-white rounded-2xl p-6 card">
            <h3 className="text-[15px] font-semibold text-[#1C1C1E]">Household</h3>
            <p className="text-[13px] text-[#AEAEB2] mt-1 mb-4">
              Names come from each person&apos;s profile. You can edit yours. The other name is read only.
            </p>
            <ul className="space-y-3">
              {household.map((person) => {
                const isYou = person.id === user?.id
                const name = memberName(person)
                return (
                  <li key={person.id} className="flex items-center gap-3">
                    {person.avatar_url ? (
                      <img src={person.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-[#EBF5FF] flex items-center justify-center shrink-0">
                        <span className="text-[13px] font-semibold text-[#007AFF]">{initialsFor(person, isYou ? user?.email : '')}</span>
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-[#1C1C1E] truncate">{name}</p>
                      <p className="text-[12px] text-[#AEAEB2] truncate">
                        {isYou ? `You · ${user?.email || 'No email'}` : 'Read only'}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>

          <form onSubmit={handleProfileSave} className="bg-white rounded-2xl p-6 card space-y-4">
            <div>
              <h3 className="text-[15px] font-semibold text-[#1C1C1E]">Profile</h3>
              <p className="text-[13px] text-[#AEAEB2] mt-1">Shown on tasks, events, and notes.</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider" htmlFor="first-name">First name</label>
                <input id="first-name" type="text" value={form.first_name} onChange={(event) => setForm({ ...form, first_name: event.target.value })} placeholder="Zac" className={inputClass} />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider" htmlFor="last-name">Last name</label>
                <input id="last-name" type="text" value={form.last_name} onChange={(event) => setForm({ ...form, last_name: event.target.value })} placeholder="Johnson" className={inputClass} />
              </div>
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider" htmlFor="display-name">Display name</label>
              <input id="display-name" type="text" value={form.display_name} onChange={(event) => setForm({ ...form, display_name: event.target.value })} placeholder="How the household sees you" className={inputClass} />
              <p className="text-[11px] text-[#AEAEB2] mt-1.5">Leave this blank to fall back to your first name, then the start of your email.</p>
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider" htmlFor="avatar-url">Avatar URL</label>
              <input id="avatar-url" type="url" value={form.avatar_url} onChange={(event) => setForm({ ...form, avatar_url: event.target.value })} placeholder="https://example.com/photo.jpg" className={inputClass} />
            </div>
            <Notice message={profileMessage} />
            <div className="flex justify-end">
              <button type="submit" disabled={profileSaving || !user} className="px-5 py-2.5 bg-[#007AFF] hover:bg-[#0066DD] disabled:opacity-50 text-white text-[14px] font-semibold rounded-xl transition-colors">
                {profileSaving ? 'Saving…' : 'Save profile'}
              </button>
            </div>
          </form>

          <form onSubmit={handleEmailSave} className="bg-white rounded-2xl p-6 card space-y-4">
            <div>
              <h3 className="text-[15px] font-semibold text-[#1C1C1E]">Email</h3>
              <p className="text-[13px] text-[#AEAEB2] mt-1">
                Saving sends a confirmation email. Supabase also emails your current address when secure email change is on. {user?.email ? `${user.email} stays your login until you confirm the new one.` : 'Your login email does not change until you confirm the new one.'}
              </p>
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider" htmlFor="account-email">New email</label>
              <input id="account-email" type="email" autoComplete="email" required value={nextEmail} onChange={(event) => setNextEmail(event.target.value)} className={inputClass} />
            </div>
            <Notice message={emailMessage} />
            <div className="flex justify-end">
              <button type="submit" disabled={emailSaving || !user} className="px-5 py-2.5 bg-[#007AFF] hover:bg-[#0066DD] disabled:opacity-50 text-white text-[14px] font-semibold rounded-xl transition-colors">
                {emailSaving ? 'Sending…' : 'Update email'}
              </button>
            </div>
          </form>

          <form onSubmit={handlePasswordSave} className="bg-white rounded-2xl p-6 card space-y-4">
            <div>
              <h3 className="text-[15px] font-semibold text-[#1C1C1E]">Password</h3>
              <p className="text-[13px] text-[#AEAEB2] mt-1">You stay signed in on this device. Supabase will say if the password is too short or needs a recent sign-in.</p>
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider" htmlFor="new-password">New password</label>
              <input id="new-password" type="password" autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider" htmlFor="confirm-password">Confirm password</label>
              <input id="confirm-password" type="password" autoComplete="new-password" required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className={inputClass} />
            </div>
            <Notice message={passwordMessage} />
            <div className="flex justify-end">
              <button type="submit" disabled={passwordSaving || !user} className="px-5 py-2.5 bg-[#007AFF] hover:bg-[#0066DD] disabled:opacity-50 text-white text-[14px] font-semibold rounded-xl transition-colors">
                {passwordSaving ? 'Updating…' : 'Update password'}
              </button>
            </div>
          </form>

          <form onSubmit={handlePreferencesSave} className="bg-white rounded-2xl p-6 card space-y-4">
            <div>
              <h3 className="text-[15px] font-semibold text-[#1C1C1E]">Preferences</h3>
              <p className="text-[13px] text-[#AEAEB2] mt-1">Stored on your account only. Choosing dark here does not change the other person&apos;s screens.</p>
            </div>
            <div>
              <p className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Theme</p>
              <ThemeToggle />
              <p className="text-[11px] text-[#AEAEB2] mt-1.5">Light, dark, or match this device. Applied as soon as you pick one.</p>
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider" htmlFor="default-tab">Default landing tab</label>
              <select id="default-tab" value={defaultTab} onChange={(event) => setDefaultTab(event.target.value)} className={inputClass}>
                {LANDING_TABS.map((tab) => (
                  <option key={tab.id} value={tab.id}>{tab.label}</option>
                ))}
              </select>
              <p className="text-[11px] text-[#AEAEB2] mt-1.5">Where you go after you sign in. The other account keeps its own tab.</p>
            </div>
            <Notice message={prefMessage} />
            <div className="flex justify-end">
              <button type="submit" disabled={prefSaving || !user} className="px-5 py-2.5 bg-[#007AFF] hover:bg-[#0066DD] disabled:opacity-50 text-white text-[14px] font-semibold rounded-xl transition-colors">
                {prefSaving ? 'Saving…' : 'Save preferences'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
