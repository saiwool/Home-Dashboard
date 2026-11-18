// Per-user appearance. The database is the source of truth. The cookie and
// localStorage only let the root layout paint the right mode before the
// next request, and they are keyed to the signed-in user so one account
// cannot leave its theme behind for the other.

export const THEME_COOKIE = 'hd-theme'
export const THEME_USER_COOKIE = 'hd-theme-user'
export const THEME_RESOLVED_COOKIE = 'hd-resolved'

export const THEMES = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' },
]

export const LANDING_TABS = [
  { id: 'overview', label: 'Overview', href: '/dashboard' },
  { id: 'calendar', label: 'Calendar', href: '/dashboard/calendar' },
  { id: 'meals', label: 'Meals', href: '/dashboard/meals' },
  { id: 'shopping', label: 'Shopping', href: '/dashboard/shopping' },
  { id: 'date-nights', label: 'Date nights', href: '/dashboard/date-nights' },
  { id: 'budget', label: 'Budget', href: '/dashboard/budget' },
  { id: 'cleaning', label: 'Cleaning', href: '/dashboard/cleaning' },
  { id: 'maintenance', label: 'Maintenance', href: '/dashboard/maintenance' },
  { id: 'projects', label: 'Projects', href: '/dashboard/projects' },
  { id: 'agreements', label: 'Agreements', href: '/dashboard/agreements' },
  { id: 'documents', label: 'Documents', href: '/dashboard/documents' },
  { id: 'home-contacts', label: 'Contacts', href: '/dashboard/home-contacts' },
  { id: 'inbox', label: 'Inbox', href: '/dashboard/inbox' },
  { id: 'profile', label: 'Account', href: '/dashboard/profile' },
]

const YEAR = 60 * 60 * 24 * 365

export function isTheme(value) {
  return THEMES.some((theme) => theme.id === value)
}

export function landingHref(id) {
  return LANDING_TABS.find((tab) => tab.id === id)?.href || '/dashboard'
}

export function applyTheme(mode) {
  const theme = isTheme(mode) ? mode : 'system'
  const dark = theme === 'dark' || (
    theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches
  )
  const root = document.documentElement
  root.classList.toggle('dark', dark)
  root.style.colorScheme = dark ? 'dark' : 'light'
  root.setAttribute('data-theme', theme)
  return dark
}

export function persistTheme(mode, userId) {
  const theme = isTheme(mode) ? mode : 'system'
  const dark = applyTheme(theme)
  try {
    localStorage.setItem(THEME_COOKIE, theme)
  } catch {
    // Private mode can block storage. The cookie still covers the next load.
  }
  writeCookie(THEME_COOKIE, theme)
  writeCookie(THEME_RESOLVED_COOKIE, dark ? 'dark' : 'light')
  if (userId) writeCookie(THEME_USER_COOKIE, userId)
}

export function clearThemeCache() {
  try {
    localStorage.removeItem(THEME_COOKIE)
  } catch {
    // Ignore storage failures on the way out.
  }
  writeCookie(THEME_COOKIE, '', 0)
  writeCookie(THEME_USER_COOKIE, '', 0)
  writeCookie(THEME_RESOLVED_COOKIE, '', 0)
}

function writeCookie(name, value, maxAge = YEAR) {
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`
}

// Runs from the root layout before the page paints. Reads the mode the
// server already chose for this response, so a stale value from the other
// account is not applied.
export const themeInitScript = `(function(){try{var root=document.documentElement;var mode=root.getAttribute('data-theme');if(mode!=='light'&&mode!=='dark'&&mode!=='system')mode='system';var dark=mode==='dark'||(mode==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);root.classList.toggle('dark',dark);root.style.colorScheme=dark?'dark':'light';}catch(e){}})();`
