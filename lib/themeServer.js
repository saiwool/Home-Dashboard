import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { isTheme, THEME_COOKIE, THEME_RESOLVED_COOKIE, THEME_USER_COOKIE } from '@/lib/theme'

// Resolve the theme for the document that is about to be sent.
// A signed-in user's row wins. The cookie is only a stand-in when that
// read fails, and only when it was written for this same user.
export async function loadAccountTheme() {
  const cookieStore = await cookies()
  const cookieUser = cookieStore.get(THEME_USER_COOKIE)?.value || ''
  const cookieTheme = cookieStore.get(THEME_COOKIE)?.value || ''
  const resolved = cookieStore.get(THEME_RESOLVED_COOKIE)?.value || ''

  let userId = null
  let mode = 'system'
  let preferenceError = false

  try {
    const supabase = await createClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (!authError && authData.user) {
      userId = authData.user.id
      const { data, error } = await supabase
        .from('user_preferences')
        .select('theme')
        .eq('id', userId)
        .maybeSingle()
      if (error) preferenceError = true
      else if (isTheme(data?.theme)) mode = data.theme
    }
  } catch {
    preferenceError = true
  }

  if (preferenceError && userId && cookieUser === userId && isTheme(cookieTheme)) {
    mode = cookieTheme
  }

  let dark = mode === 'dark'
  if (mode === 'system' && userId && cookieUser === userId && (resolved === 'dark' || resolved === 'light')) {
    dark = resolved === 'dark'
  }

  return { mode, dark, userId }
}
