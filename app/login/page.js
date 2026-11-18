'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { isTheme, landingHref, persistTheme } from '@/lib/theme'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState('login')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setError('Check your email to confirm your account.')
        setLoading(false)
        return
      }
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      if (!data.user) throw new Error('Sign in did not return an account.')
      const { data: prefs } = await supabase
        .from('user_preferences')
        .select('theme, default_tab')
        .eq('id', data.user.id)
        .maybeSingle()
      const themeMode = isTheme(prefs?.theme) ? prefs.theme : 'system'
      persistTheme(themeMode, data.user.id)
      router.push(landingHref(prefs?.default_tab))
      router.refresh()
    } catch (err) {
      setError(err.message || 'Something went wrong')
      setLoading(false)
    }
  }

  const inputClass = 'w-full px-4 py-3 rounded-xl border border-[#E5E5EA] text-[15px] text-[#1C1C1E] bg-white placeholder-[#AEAEB2] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF] transition-all'

  return (
    <div className="min-h-screen bg-[#F2F2F7] flex flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">

        {/* Logo mark */}
        <div className="text-center mb-10">
          <div className="w-[68px] h-[68px] bg-[#007AFF] rounded-[20px] flex items-center justify-center mx-auto mb-5" style={{ boxShadow: '0 8px 24px rgba(0,122,255,0.35)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" className="w-8 h-8">
              <path d="M3 9.5L12 3l9 6.5V21H15.5V15H8.5v6H3V9.5Z" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-[28px] font-bold text-[#1C1C1E] tracking-[-0.02em]">Home</h1>
          <p className="text-[15px] text-[#AEAEB2] mt-1.5">Your household, organized.</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl p-8 card">

          {/* Segmented control */}
          <div className="flex bg-[#F2F2F7] rounded-xl p-1 gap-1 mb-6">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`flex-1 py-2 text-[14px] font-semibold rounded-lg transition-all duration-150 ${
                mode === 'login' ? 'bg-white text-[#1C1C1E] shadow-sm' : 'text-[#6C6C70]'
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setMode('signup')}
              className={`flex-1 py-2 text-[14px] font-semibold rounded-lg transition-all duration-150 ${
                mode === 'signup' ? 'bg-white text-[#1C1C1E] shadow-sm' : 'text-[#6C6C70]'
              }`}
            >
              Create account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[13px] font-semibold text-[#1C1C1E] mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                autoComplete="email"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#1C1C1E] mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                className={inputClass}
              />
            </div>

            {error && (
              <div className={`text-[13px] px-4 py-3 rounded-xl ${
                error.includes('Check your email')
                  ? 'bg-[#E8F8ED] text-[#1A7A36]'
                  : 'bg-[#FFF0EF] text-[#FF3B30]'
              }`}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-[#007AFF] hover:bg-[#0066DD] disabled:opacity-50 text-white text-[15px] font-bold rounded-xl transition-colors mt-2"
              style={{ marginTop: '20px' }}
            >
              {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
