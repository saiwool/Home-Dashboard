'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const groups = [
  {
    items: [
      { name: 'Overview', href: '/dashboard', icon: 'overview' },
    ],
  },
  {
    label: 'Life',
    items: [
      { name: 'Calendar', href: '/dashboard/calendar', icon: 'calendar' },
      { name: 'Meals', href: '/dashboard/meals', icon: 'meals' },
      { name: 'Date Nights', href: '/dashboard/date-nights', icon: 'hearts' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { name: 'Budget', href: '/dashboard/budget', icon: 'budget' },
    ],
  },
  {
    label: 'House',
    items: [
      { name: 'Cleaning', href: '/dashboard/cleaning', icon: 'cleaning' },
      { name: 'Maintenance', href: '/dashboard/maintenance', icon: 'maintenance' },
      { name: 'Agreements', href: '/dashboard/agreements', icon: 'agreements' },
    ],
  },
  {
    label: 'Records',
    items: [
      { name: 'Documents', href: '/dashboard/documents', icon: 'documents' },
      { name: 'Contacts', href: '/dashboard/home-contacts', icon: 'contacts' },
    ],
  },
]

const Icon = ({ name, active }) => {
  const cls = `w-[17px] h-[17px] transition-colors ${active ? 'text-[#007AFF]' : 'text-[#8E8E93]'}`
  const s = { viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: '1.5', className: cls }

  switch (name) {
    case 'overview':
      return <svg {...s}><path d="M2.5 8.333L10 2.5l7.5 5.833V17.5H13.333V12.5H6.667V17.5H2.5V8.333Z" strokeLinejoin="round" /></svg>
    case 'calendar':
      return <svg {...s}><rect x="2.5" y="3.75" width="15" height="13.75" rx="1.5" /><path d="M2.5 7.917h15M6.667 2.5v2.5M13.333 2.5v2.5" strokeLinecap="round" /></svg>
    case 'meals':
      return <svg {...s}><path d="M6.667 2.5v6.25a2.5 2.5 0 0 0 2.5 2.5v6.25M5.833 2.5v3.333M7.5 2.5v3.333M13.333 2.5s1.25 1.667 1.25 3.333-1.25 2.5-1.25 4.167v7.5" strokeLinecap="round" /></svg>
    case 'hearts':
      return <svg {...s}><path d="M10 16.25S2.5 11.875 2.5 7.083c0-1.958 1.667-3.333 3.542-3.333C7.5 3.75 8.75 4.583 10 5.833c1.25-1.25 2.5-2.083 3.958-2.083 1.875 0 3.542 1.375 3.542 3.333C17.5 11.875 10 16.25 10 16.25Z" strokeLinejoin="round" /></svg>
    case 'budget':
      return <svg {...s}><circle cx="10" cy="10" r="7.5" /><path d="M10 6.25v.833M10 12.917v.833M12.083 8.333S11.25 7.083 10 7.083c-1.667 0-2.5.834-2.5 1.667 0 2.083 5 1.25 5 3.333 0 .834-.833 1.667-2.5 1.667-1.25 0-2.083-.833-2.083-.833" strokeLinecap="round" /></svg>
    case 'cleaning':
      return <svg {...s}><path d="M10 2.5l.833 2.5H13.333l-2.083 1.458.833 2.709L10 7.708l-2.083 1.459.833-2.709L6.667 5H9.167L10 2.5Z" strokeLinejoin="round" /><path d="M5 13.75l2.5-2.5M4.167 15.833C3.333 15.833 2.5 15 2.5 14.167S3.333 12.5 4.167 12.5L7.5 15.833s-1.667 1.667-3.333 0Z" strokeLinejoin="round" /></svg>
    case 'maintenance':
      return <svg {...s}><path d="M12.5 4.167c1.25-1.25 3.333-1.25 4.583 0s1.25 3.333 0 4.583L15 6.667 13.333 8.333l2.5 2.5c-1.25 1.25-3.333 1.25-4.583 0L7.5 14.583c-.834.834-2.083.834-2.917 0-.833-.833-.833-2.083 0-2.916L8.333 7.917C7.083 6.667 7.083 4.583 8.333 3.333" strokeLinecap="round" strokeLinejoin="round" /></svg>
    case 'agreements':
      return <svg {...s}><path d="M6.667 16.25 2.5 12.5 5 10l2.5 2.5M13.333 16.25 17.5 12.5 15 10l-2.5 2.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M2.5 10.833S4.167 12.5 5 12.5c.833 0 2.917-4.167 4.167-4.167S10 10 11.25 10s2.5-1.667 3.75-1.667" strokeLinecap="round" /></svg>
    case 'documents':
      return <svg {...s}><path d="M5.833 2.5h5.834L15.833 6.667V17.5H5.833V2.5Z" strokeLinejoin="round" /><path d="M11.667 2.5v4.167h4.166M8.333 10.833h3.334M8.333 13.333h3.334" strokeLinecap="round" /></svg>
    case 'contacts':
      return <svg {...s}><circle cx="10" cy="6.667" r="3.333" /><path d="M3.333 17.5c0-3.333 2.917-6.25 6.667-6.25s6.667 2.917 6.667 6.25" strokeLinecap="round" /></svg>
    default:
      return null
  }
}

export default function SidebarNav() {
  const pathname = usePathname()

  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
      {groups.map((group, gi) => (
        <div key={gi} className={gi > 0 ? 'pt-5' : ''}>
          {group.label && (
            <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-[#8E8E93] px-3 pb-1">
              {group.label}
            </p>
          )}
          {group.items.map((item) => {
            const active = item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl text-[13.5px] font-medium transition-all duration-150 ${
                  active
                    ? 'bg-[#EBF5FF] text-[#007AFF]'
                    : 'text-[#3A3A3C] hover:bg-[#F2F2F7]'
                }`}
              >
                <Icon name={item.icon} active={active} />
                {item.name}
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
