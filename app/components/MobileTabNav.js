'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { name: 'Overview', href: '/dashboard' },
  { name: 'Calendar', href: '/dashboard/calendar' },
  { name: 'Budget', href: '/dashboard/budget' },
  { name: 'Cleaning', href: '/dashboard/cleaning' },
  { name: 'Meals', href: '/dashboard/meals' },
  { name: 'Shopping', href: '/dashboard/shopping' },
  { name: 'Date Nights', href: '/dashboard/date-nights' },
  { name: 'Maintenance', href: '/dashboard/maintenance' },
  { name: 'Projects', href: '/dashboard/projects' },
  { name: 'Agreements', href: '/dashboard/agreements' },
  { name: 'Documents', href: '/dashboard/documents' },
  { name: 'Contacts', href: '/dashboard/home-contacts' },
]

export default function MobileTabNav() {
  const pathname = usePathname()

  return (
    <nav className="flex overflow-x-auto no-scrollbar gap-1 px-4 py-2.5">
      {tabs.map((tab) => {
        const active = tab.href === '/dashboard'
          ? pathname === '/dashboard'
          : pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap transition-all duration-150 ${
              active
                ? 'bg-[#007AFF] text-white'
                : 'text-[#6C6C70] hover:bg-[#E5E5EA] hover:text-[#1C1C1E]'
            }`}
          >
            {tab.name}
          </Link>
        )
      })}
    </nav>
  )
}
