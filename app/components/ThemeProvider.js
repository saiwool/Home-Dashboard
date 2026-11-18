'use client'

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { applyTheme, clearThemeCache, isTheme, persistTheme } from '@/lib/theme'

const ThemeContext = createContext(null)

export function useTheme() {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used inside ThemeProvider')
  return value
}

export default function ThemeProvider({ initialTheme = 'system', userId = null, children }) {
  const startingTheme = isTheme(initialTheme) ? initialTheme : 'system'
  const [theme, setThemeState] = useState(startingTheme)
  const [saveError, setSaveError] = useState('')
  const [synced, setSynced] = useState({ initialTheme: startingTheme, userId })

  if (synced.initialTheme !== startingTheme || synced.userId !== userId) {
    setSynced({ initialTheme: startingTheme, userId })
    setThemeState(startingTheme)
    setSaveError('')
  }

  useLayoutEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    if (theme !== 'system') return undefined
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      applyTheme('system')
      if (userId) persistTheme('system', userId)
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [theme, userId])

  const setTheme = useCallback(async (next) => {
    if (!isTheme(next)) return { error: null }
    setThemeState(next)
    applyTheme(next)
    setSaveError('')
    if (!userId) return { error: null }

    persistTheme(next, userId)
    const supabase = createClient()
    const { error } = await supabase
      .from('user_preferences')
      .upsert({ id: userId, theme: next, updated_at: new Date().toISOString() }, { onConflict: 'id' })

    if (error) {
      setSaveError(error.message)
      return { error }
    }
    return { error: null }
  }, [userId])

  const resetTheme = useCallback(() => {
    clearThemeCache()
    setThemeState('system')
    setSaveError('')
    applyTheme('system')
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, saveError, resetTheme, userId }}>
      {children}
    </ThemeContext.Provider>
  )
}
