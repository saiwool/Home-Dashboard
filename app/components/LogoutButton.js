'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/app/components/ThemeProvider'

export default function LogoutButton() {
  const router = useRouter()
  const supabase = createClient()
  const { resetTheme } = useTheme()

  async function handleLogout() {
    await supabase.auth.signOut()
    resetTheme()
    router.push('/login')
    router.refresh()
  }

  return (
    <button
      onClick={handleLogout}
      title="Sign out"
      className="flex items-center justify-center w-8 h-8 rounded-xl text-[#AEAEB2] hover:text-[#FF3B30] hover:bg-[#FFF0EF] transition-all duration-150"
    >
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
        <path d="M7.5 17.5H4.167A1.667 1.667 0 0 1 2.5 15.833V4.167A1.667 1.667 0 0 1 4.167 2.5H7.5" strokeLinecap="round" />
        <path d="M13.333 14.167 17.5 10l-4.167-4.167" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M17.5 10H7.5" strokeLinecap="round" />
      </svg>
    </button>
  )
}
