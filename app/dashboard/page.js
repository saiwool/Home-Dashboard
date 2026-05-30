import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { getTodayStr, addDays, getGreetingWord, DEFAULT_TZ } from '@/lib/dateUtils'
import InboxWidget from '@/app/components/InboxWidget'

function StatCard({ label, value, sub, color }) {
  const colors = {
    blue: 'text-[#007AFF]',
    green: 'text-[#28A745]',
    red: 'text-[#FF3B30]',
    orange: 'text-[#E6860A]',
    muted: 'text-[#AEAEB2]',
  }
  return (
    <div className="bg-white rounded-2xl p-5 card">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#AEAEB2] mb-2">{label}</p>
      <p className={`text-[28px] font-bold leading-none tracking-tight ${colors[color] ?? colors.blue}`}>{value}</p>
      {sub && <p className="text-[12px] text-[#AEAEB2] mt-2 leading-snug">{sub}</p>}
    </div>
  )
}

function QuickAction({ href, label, children }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 px-4 py-3 bg-white rounded-2xl text-[13.5px] font-medium text-[#1C1C1E] hover:bg-[#F9F9FB] active:scale-[0.98] transition-all duration-150 shrink-0 card"
    >
      <span className="text-[#007AFF] shrink-0">{children}</span>
      {label}
    </Link>
  )
}

export default async function OverviewPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const today = getTodayStr(DEFAULT_TZ)
  const monthStart = today.slice(0, 7) + '-01'
  const weekEndStr = addDays(today, 7)

  const [
    { data: upcomingEvents },
    { data: budgetItems },
    { data: pendingAgreements },
    { data: cleaningTasks },
    { data: profiles },
    { data: currentProfile },
  ] = await Promise.all([
    supabase.from('calendar_events').select('*').gte('start_date', today).order('start_date', { ascending: true }).limit(5),
    supabase.from('budget_items').select('amount, type').gte('item_date', monthStart),
    supabase.from('agreements').select('id, title, created_by').eq('status', 'pending').order('created_at', { ascending: false }),
    supabase.from('cleaning_tasks').select('*').order('next_due', { ascending: true }).limit(5),
    supabase.from('profiles').select('id, display_name'),
    supabase.from('profiles').select('display_name').eq('id', user.id).single(),
  ])

  const profileMap = Object.fromEntries((profiles || []).map((p) => [p.id, p.display_name]))
  const displayName = currentProfile?.display_name || user.email?.split('@')[0] || 'there'

  const income = (budgetItems || []).filter((i) => i.type === 'income').reduce((s, i) => s + Number(i.amount), 0)
  const expenses = (budgetItems || []).filter((i) => i.type === 'expense').reduce((s, i) => s + Number(i.amount), 0)
  const net = income - expenses
  const overdueTasks = (cleaningTasks || []).filter((t) => t.next_due && t.next_due < today)
  const weekEvents = (upcomingEvents || []).filter((e) => e.start_date <= weekEndStr)

  const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

  const greeting = getGreetingWord(DEFAULT_TZ)
  const dateStr = new Intl.DateTimeFormat('en-US', {
    timeZone: DEFAULT_TZ,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date())

  return (
    <div className="max-w-3xl">

      {/* Greeting */}
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[32px] font-bold text-[#1C1C1E] tracking-[-0.02em] leading-tight">
              Good {greeting}, {displayName}.
            </h1>
            <p className="text-[15px] text-[#AEAEB2] mt-1">{dateStr}</p>
          </div>
          <InboxWidget />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatCard
          label="This week"
          value={weekEvents.length}
          sub="events coming up"
          color="blue"
        />
        <StatCard
          label="Month net"
          value={fmt(net)}
          sub="income – expenses"
          color={net >= 0 ? 'green' : 'red'}
        />
        <StatCard
          label="Overdue tasks"
          value={overdueTasks.length}
          sub={overdueTasks.length === 0 ? 'all caught up' : 'need attention'}
          color={overdueTasks.length > 0 ? 'red' : 'green'}
        />
        <StatCard
          label="Proposals"
          value={pendingAgreements?.length ?? 0}
          sub="pending response"
          color={(pendingAgreements?.length ?? 0) > 0 ? 'orange' : 'muted'}
        />
      </div>

      {/* Quick actions */}
      <div className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[#AEAEB2] mb-3">Quick Add</p>
        <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
          <QuickAction href="/dashboard/calendar" label="Add Event">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
              <rect x="2.5" y="3.75" width="15" height="13.75" rx="1.5" />
              <path d="M2.5 7.917h15M6.667 2.5v2.5M13.333 2.5v2.5M10 10.833v3.334M8.333 12.5h3.334" strokeLinecap="round" />
            </svg>
          </QuickAction>
          <QuickAction href="/dashboard/budget" label="Add Expense">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
              <circle cx="10" cy="10" r="7.5" />
              <path d="M10 6.25v.833M10 12.917v.833M12.083 8.333S11.25 7.083 10 7.083c-1.667 0-2.5.834-2.5 1.667 0 2.083 5 1.25 5 3.333 0 .834-.833 1.667-2.5 1.667-1.25 0-2.083-.833-2.083-.833" strokeLinecap="round" />
            </svg>
          </QuickAction>
          <QuickAction href="/dashboard/cleaning" label="Add Task">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
              <circle cx="10" cy="10" r="7.5" />
              <path d="M10 7.5v5M7.5 10h5" strokeLinecap="round" />
            </svg>
          </QuickAction>
          <QuickAction href="/dashboard/agreements" label="New Proposal">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
              <path d="M7.5 10 10 12.5l7.5-8.333" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M17.5 10v6.667a.833.833 0 0 1-.833.833H3.333A.833.833 0 0 1 2.5 16.667V3.333A.833.833 0 0 1 3.333 2.5H12.5" strokeLinecap="round" />
            </svg>
          </QuickAction>
        </div>
      </div>

      {/* Content cards */}
      <div className="grid sm:grid-cols-2 gap-4">

        {/* Upcoming Events */}
        <div className="bg-white rounded-2xl p-6 card">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-[15px] font-semibold text-[#1C1C1E]">Upcoming Events</h3>
            <Link href="/dashboard/calendar" className="text-[13px] font-medium text-[#007AFF]">See all</Link>
          </div>
          {upcomingEvents?.length ? (
            <div className="space-y-4">
              {upcomingEvents.map((evt) => {
                const d = new Date(evt.start_date + 'T00:00:00')
                return (
                  <div key={evt.id} className="flex items-start gap-4">
                    <div className="shrink-0 w-10 text-center">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#AEAEB2] leading-none">
                        {d.toLocaleDateString('en-US', { month: 'short' })}
                      </p>
                      <p className="text-[22px] font-bold text-[#1C1C1E] leading-tight">{d.getDate()}</p>
                    </div>
                    <div className="pt-0.5 min-w-0">
                      <p className="text-[14px] font-medium text-[#1C1C1E] truncate">{evt.title}</p>
                      {evt.description && (
                        <p className="text-[12px] text-[#AEAEB2] mt-0.5 truncate">{evt.description}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-[14px] text-[#AEAEB2]">No upcoming events.</p>
          )}
        </div>

        {/* Budget */}
        <div className="bg-white rounded-2xl p-6 card">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-[15px] font-semibold text-[#1C1C1E]">Budget</h3>
            <Link href="/dashboard/budget" className="text-[13px] font-medium text-[#007AFF]">Details</Link>
          </div>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-baseline mb-2">
                <span className="text-[13px] text-[#6C6C70]">Income</span>
                <span className="text-[13px] font-semibold text-[#28A745]">{fmt(income)}</span>
              </div>
              <div className="h-1.5 bg-[#F2F2F7] rounded-full">
                <div className="h-full bg-[#34C759] rounded-full w-full" />
              </div>
            </div>
            <div>
              <div className="flex justify-between items-baseline mb-2">
                <span className="text-[13px] text-[#6C6C70]">Expenses</span>
                <span className="text-[13px] font-semibold text-[#FF3B30]">{fmt(expenses)}</span>
              </div>
              <div className="h-1.5 bg-[#F2F2F7] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#FF3B30] rounded-full transition-all duration-700"
                  style={{ width: income > 0 ? `${Math.min((expenses / income) * 100, 100)}%` : '0%' }}
                />
              </div>
            </div>
            <div className="pt-3 border-t border-[#F2F2F7] flex justify-between items-center">
              <span className="text-[14px] font-medium text-[#1C1C1E]">Net this month</span>
              <span className={`text-[20px] font-bold tracking-tight ${net >= 0 ? 'text-[#28A745]' : 'text-[#FF3B30]'}`}>
                {fmt(net)}
              </span>
            </div>
          </div>
        </div>

        {/* Cleaning */}
        <div className="bg-white rounded-2xl p-6 card">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-[15px] font-semibold text-[#1C1C1E]">Cleaning</h3>
            <Link href="/dashboard/cleaning" className="text-[13px] font-medium text-[#007AFF]">Manage</Link>
          </div>
          {cleaningTasks?.length ? (
            <div className="space-y-3.5">
              {cleaningTasks.map((task) => {
                const isOverdue = task.next_due && task.next_due < today
                return (
                  <div key={task.id} className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${isOverdue ? 'bg-[#FF3B30]' : 'bg-[#34C759]'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium text-[#1C1C1E] truncate">{task.name}</p>
                      <p className={`text-[12px] mt-0.5 ${isOverdue ? 'text-[#FF3B30] font-medium' : 'text-[#AEAEB2]'}`}>
                        {isOverdue ? 'Overdue · ' : 'Due '}
                        {task.next_due
                          ? new Date(task.next_due + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                          : task.frequency}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-[14px] text-[#AEAEB2]">No cleaning tasks yet.</p>
          )}
        </div>

        {/* Proposals */}
        <div className="bg-white rounded-2xl p-6 card">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-[15px] font-semibold text-[#1C1C1E]">Proposals</h3>
            <Link href="/dashboard/agreements" className="text-[13px] font-medium text-[#007AFF]">View all</Link>
          </div>
          {pendingAgreements?.length ? (
            <div className="space-y-3.5">
              {pendingAgreements.map((a) => (
                <div key={a.id} className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-[#FF9500] shrink-0 mt-1.5" />
                  <div>
                    <p className="text-[14px] font-medium text-[#1C1C1E]">{a.title}</p>
                    <p className="text-[12px] text-[#AEAEB2] mt-0.5">
                      from {profileMap[a.created_by] || 'partner'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[14px] text-[#AEAEB2]">No pending proposals.</p>
          )}
        </div>
      </div>
    </div>
  )
}
