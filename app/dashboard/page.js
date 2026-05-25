import { createClient } from '@/lib/supabase/server'

function StatCard({ label, value, sub, color = 'indigo' }) {
  const colors = {
    indigo: 'bg-indigo-50 text-indigo-700',
    green: 'bg-green-50 text-green-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
  }
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
      <p className="text-sm text-slate-500 font-medium">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${colors[color].split(' ')[1]}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  )
}

export default async function OverviewPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const today = new Date().toISOString().split('T')[0]
  const monthStart = today.slice(0, 7) + '-01'

  const [
    { data: upcomingEvents },
    { data: budgetItems },
    { data: pendingAgreements },
    { data: cleaningTasks },
    { data: profiles },
  ] = await Promise.all([
    supabase
      .from('calendar_events')
      .select('*')
      .gte('start_date', today)
      .order('start_date', { ascending: true })
      .limit(5),
    supabase
      .from('budget_items')
      .select('amount, type')
      .gte('item_date', monthStart),
    supabase
      .from('agreements')
      .select('*, profiles(display_name)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    supabase
      .from('cleaning_tasks')
      .select('*')
      .order('next_due', { ascending: true })
      .limit(5),
    supabase.from('profiles').select('id, display_name'),
  ])

  const profileMap = Object.fromEntries((profiles || []).map((p) => [p.id, p.display_name]))

  const income = (budgetItems || []).filter((i) => i.type === 'income').reduce((s, i) => s + Number(i.amount), 0)
  const expenses = (budgetItems || []).filter((i) => i.type === 'expense').reduce((s, i) => s + Number(i.amount), 0)

  const fmt = (n) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

  const fmtDate = (d) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Good {getGreeting()}, household!</h2>
        <p className="text-slate-500 mt-1">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Upcoming Events" value={upcomingEvents?.length ?? 0} color="indigo" sub="next 30 days" />
        <StatCard label="Monthly Income" value={fmt(income)} color="green" sub="this month" />
        <StatCard label="Monthly Expenses" value={fmt(expenses)} color="red" sub="this month" />
        <StatCard label="Pending Agreements" value={pendingAgreements?.length ?? 0} color="amber" sub="awaiting response" />
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-semibold text-slate-900 mb-4">Upcoming Events</h3>
          {upcomingEvents?.length ? (
            <ul className="space-y-3">
              {upcomingEvents.map((evt) => (
                <li key={evt.id} className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-slate-800">{evt.title}</p>
                    <p className="text-xs text-slate-400">{fmtDate(evt.start_date)}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">No upcoming events</p>
          )}
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-semibold text-slate-900 mb-4">Pending Agreements</h3>
          {pendingAgreements?.length ? (
            <ul className="space-y-3">
              {pendingAgreements.map((a) => (
                <li key={a.id} className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-slate-800">{a.title}</p>
                    <p className="text-xs text-slate-400">from {profileMap[a.created_by] || 'unknown'}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">No pending agreements</p>
          )}
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-semibold text-slate-900 mb-4">Cleaning Schedule</h3>
          {cleaningTasks?.length ? (
            <ul className="space-y-3">
              {cleaningTasks.map((task) => {
                const isOverdue = task.next_due && task.next_due < today
                return (
                  <li key={task.id} className="flex items-start gap-3">
                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${isOverdue ? 'bg-red-400' : 'bg-green-400'}`} />
                    <div>
                      <p className="text-sm font-medium text-slate-800">{task.name}</p>
                      <p className="text-xs text-slate-400">
                        {task.next_due
                          ? (isOverdue ? 'Overdue · ' : 'Due ') + fmtDate(task.next_due)
                          : task.frequency}
                        {task.assigned_to && ` · ${profileMap[task.assigned_to] || ''}`}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">No cleaning tasks yet</p>
          )}
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-semibold text-slate-900 mb-4">Budget Summary</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600">Income</span>
              <span className="text-sm font-semibold text-green-600">{fmt(income)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600">Expenses</span>
              <span className="text-sm font-semibold text-red-500">{fmt(expenses)}</span>
            </div>
            <div className="border-t border-slate-100 pt-3 flex justify-between items-center">
              <span className="text-sm font-medium text-slate-700">Net</span>
              <span className={`text-sm font-bold ${income - expenses >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {fmt(income - expenses)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
