import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import SidebarNav from '@/app/components/SidebarNav'
import MobileTabNav from '@/app/components/MobileTabNav'
import LogoutButton from '@/app/components/LogoutButton'
import ThemeToggle from '@/app/components/ThemeToggle'

export default async function DashboardLayout({ children }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, first_name, avatar_url')
    .eq('id', user.id)
    .single()

  const displayName = profile?.display_name || profile?.first_name || user.email?.split('@')[0] || 'You'
  const initials = displayName.slice(0, 2).toUpperCase()
  const avatarUrl = profile?.avatar_url

  return (
    <div className="flex min-h-screen bg-[#F2F2F7]">

      {/* ── Desktop sidebar ───────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-64 fixed inset-y-0 left-0 bg-white border-r border-[#E5E5EA] z-20">
        {/* Logo */}
        <div className="flex items-center gap-3 h-16 px-5 border-b border-[#E5E5EA] shrink-0">
          <div className="w-8 h-8 bg-[#007AFF] rounded-xl flex items-center justify-center shrink-0">
            <svg viewBox="0 0 20 20" fill="none" stroke="white" strokeWidth="1.75" className="w-[15px] h-[15px]">
              <path d="M2.5 8.333L10 2.5l7.5 5.833V17.5H13.333V12.5H6.667V17.5H2.5V8.333Z" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="text-[14px] font-semibold text-[#1C1C1E] tracking-[-0.01em]">Home</span>
        </div>

        {/* Nav */}
        <SidebarNav />

        {/* User footer */}
        <div className="p-4 border-t border-[#E5E5EA] shrink-0 space-y-3">
          <ThemeToggle />
          <div className="flex items-center gap-3">
            <Link href="/dashboard/profile" className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity">
              {avatarUrl ? (
                <img src={avatarUrl} alt={displayName} className="w-8 h-8 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[#EBF5FF] flex items-center justify-center shrink-0">
                  <span className="text-[11px] font-semibold text-[#007AFF]">{initials}</span>
                </div>
              )}
              <span className="text-[13px] font-medium text-[#1C1C1E] truncate">{displayName}</span>
            </Link>
            <LogoutButton />
          </div>
        </div>
      </aside>

      {/* ── Content area ──────────────────────────────── */}
      <div className="flex-1 lg:ml-64 min-w-0 flex flex-col">

        {/* Mobile header */}
        <header className="lg:hidden bg-white border-b border-[#E5E5EA] h-14 flex items-center justify-between px-5 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-[#007AFF] rounded-[9px] flex items-center justify-center">
              <svg viewBox="0 0 20 20" fill="none" stroke="white" strokeWidth="1.75" className="w-3.5 h-3.5">
                <path d="M2.5 8.333L10 2.5l7.5 5.833V17.5H13.333V12.5H6.667V17.5H2.5V8.333Z" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-[14px] font-semibold text-[#1C1C1E]">Home</span>
          </div>
          <div className="flex items-center gap-1.5">
            <ThemeToggle compact />
            <Link href="/dashboard/profile">
              {avatarUrl ? (
                <img src={avatarUrl} alt={displayName} className="w-7 h-7 rounded-full object-cover" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-[#EBF5FF] flex items-center justify-center">
                  <span className="text-[10px] font-semibold text-[#007AFF]">{initials}</span>
                </div>
              )}
            </Link>
            <LogoutButton />
          </div>
        </header>

        {/* Mobile tab nav */}
        <div className="lg:hidden bg-white border-b border-[#E5E5EA] shrink-0">
          <MobileTabNav />
        </div>

        {/* Page */}
        <main className="flex-1 p-5 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
