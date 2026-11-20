'use client'

import { useCallback, useEffect, useState } from 'react'
import { GOOGLE_MIGRATION_FILE, PRODUCTION_ORIGIN, nextPath } from '@/lib/google/constants'
import { GOOGLE_CONNECTED_MESSAGE, googleErrorMessage } from '@/lib/google/messages'

function swatch(color) {
  return /^#[0-9a-fA-F]{6}$/.test(color || '') ? color : '#007AFF'
}

function syncedLabel(iso) {
  if (!iso) return 'Not synced yet'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'Synced'
  const minutes = Math.round((Date.now() - then) / 60000)
  if (minutes < 1) return 'Synced just now'
  if (minutes < 60) return `Synced ${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 36) return `Synced ${hours} hr ago`
  return `Synced ${new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

function Shell({ children, plain }) {
  if (plain) return <div className="px-1 pb-2">{children}</div>
  return (
    <div className="bg-white rounded-2xl p-5 card mb-6">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-[#EBF5FF] rounded-xl flex items-center justify-center shrink-0">
          <svg viewBox="0 0 20 20" fill="none" stroke="#007AFF" strokeWidth="1.5" className="w-5 h-5" aria-hidden="true">
            <rect x="2.5" y="3.75" width="15" height="13.75" rx="1.5" />
            <path d="M2.5 7.917h15M6.667 2.5v2.5M13.333 2.5v2.5" strokeLinecap="round" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  )
}

function PrimaryLink({ href, children }) {
  return (
    <a href={href} className="inline-flex items-center px-4 py-2.5 bg-[#007AFF] hover:bg-[#0066DD] text-white text-[13.5px] font-semibold rounded-xl transition-colors">
      {children}
    </a>
  )
}

function PrimaryButton({ onClick, disabled, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center px-4 py-2.5 bg-[#007AFF] hover:bg-[#0066DD] disabled:opacity-50 text-white text-[13.5px] font-semibold rounded-xl transition-colors"
    >
      {children}
    </button>
  )
}

function QuietButton({ onClick, disabled, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center px-4 py-2.5 text-[13.5px] font-semibold text-[#6C6C70] hover:bg-[#F2F2F7] disabled:opacity-50 rounded-xl transition-colors"
    >
      {children}
    </button>
  )
}

function Banner({ banner }) {
  if (!banner) return null
  const ok = banner.type === 'success'
  return (
    <p className={`text-[13px] px-3 py-2 rounded-xl mb-4 ${ok ? 'bg-[#E8F8ED] text-[#1A7A36]' : 'bg-[#FFF0EF] text-[#FF3B30]'}`} role="status">
      {banner.text}
    </p>
  )
}

export default function GoogleCalendarPanel({
  returnTo = 'calendar',
  localEventCount = 0,
  onStatus,
  onEventsChanged,
  plain = false,
}) {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [banner, setBanner] = useState(null)
  const [actionError, setActionError] = useState('')
  const [actionNote, setActionNote] = useState('')
  const [busy, setBusy] = useState('')
  const [chosenImportId, setChosenImportId] = useState('')
  const writableTargets = (status?.calendars || []).filter((calendar) => calendar.selected && calendar.writable)
  const preferredImport = writableTargets.find((calendar) => calendar.withBaby)
    || writableTargets.find((calendar) => calendar.primary)
    || writableTargets[0]
  const importCalendarId = writableTargets.some((calendar) => calendar.googleCalendarId === chosenImportId)
    ? chosenImportId
    : (preferredImport?.googleCalendarId || '')

  const reload = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const res = await fetch('/api/google/status', { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setLoadError(body.error || 'Could not check Google Calendar. Events in Home still work.')
        setStatus(null)
        return
      }
      setStatus(body)
      onStatus?.(body)
    } catch {
      setLoadError('Could not check Google Calendar. Events in Home still work.')
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [onStatus])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const params = new URLSearchParams(window.location.search)
      const flag = params.get('google')
      if (flag) {
        const url = new URL(window.location.href)
        url.searchParams.delete('google')
        url.searchParams.delete('reason')
        const search = url.searchParams.toString()
        window.history.replaceState(null, '', `${url.pathname}${search ? `?${search}` : ''}`)
        if (!cancelled && flag === 'connected') setBanner({ type: 'success', text: GOOGLE_CONNECTED_MESSAGE })
        if (!cancelled && flag === 'error') setBanner({ type: 'error', text: googleErrorMessage(params.get('reason')) })
      }
      if (!cancelled) await reload()
    }
    load()
    return () => {
      cancelled = true
    }
  }, [reload])

  const connectHref = status?.canConnect
    ? `/api/google/connect?next=${returnTo === 'profile' ? 'profile' : 'calendar'}`
    : `${PRODUCTION_ORIGIN}${nextPath(returnTo)}`

  async function runAction(name, work) {
    setBusy(name)
    setActionError('')
    setActionNote('')
    try {
      await work()
    } catch {
      setActionError('Could not update Google Calendar. Try again.')
    } finally {
      setBusy('')
    }
  }

  async function toggleCalendar(calendar) {
    await runAction(calendar.googleCalendarId, async () => {
      const res = await fetch('/api/google/calendars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'select',
          googleCalendarId: calendar.googleCalendarId,
          selected: !calendar.selected,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setActionError(body.error || 'Could not update that calendar.')
        return
      }
      await reload()
      onEventsChanged?.()
    })
  }

  async function syncNow() {
    await runAction('sync', async () => {
      const res = await fetch('/api/google/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setActionError(body.error || 'Could not sync Google Calendar.')
        return
      }
      if (body.skipped === 'needs_reconnect') {
        setActionError('Google needs you to connect again before Home can refresh events.')
      } else if (body.calendarErrors?.length) {
        setActionError(body.calendarErrors.map((item) => `${item.name}: ${item.message}`).join(' '))
      } else {
        setActionNote('Calendars updated.')
      }
      await reload()
      onEventsChanged?.()
    })
  }

  async function refreshList() {
    await runAction('refresh', async () => {
      const res = await fetch('/api/google/calendars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refresh' }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setActionError(body.error || 'Could not refresh the calendar list.')
        return
      }
      setActionNote('Calendar list updated.')
      await reload()
    })
  }

  async function disconnect() {
    const ok = window.confirm('Disconnect your Google account? Events added in Home stay. Events that came from your Google calendars leave this shared view unless the other person still syncs them.')
    if (!ok) return
    await runAction('disconnect', async () => {
      const res = await fetch('/api/google/disconnect', { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setActionError(body.error || 'Could not disconnect Google.')
        return
      }
      setActionNote('Google disconnected for this login.')
      await reload()
      onEventsChanged?.()
    })
  }

  async function importEvents() {
    if (!importCalendarId) return
    const countLabel = localEventCount === 1 ? '1 Home event' : `${localEventCount} Home events`
    const ok = window.confirm(`Copy ${countLabel} onto the Google calendar you picked? Events already on Google stay as they are.`)
    if (!ok) return
    await runAction('import', async () => {
      const res = await fetch('/api/google/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ googleCalendarId: importCalendarId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setActionError(body.error || 'Could not copy those events.')
        return
      }
      const failed = body.failedCount ? ` ${body.failedCount} could not be copied.` : ''
      const more = body.capped ? ' Run it again for the rest.' : ''
      setActionNote(`Copied ${body.imported}.${failed}${more}`)
      await reload()
      onEventsChanged?.()
    })
  }

  if (loading && !status) {
    return (
      <Shell plain={plain}>
        <h3 className="text-[15px] font-semibold text-[#1C1C1E]">Google Calendar</h3>
        <p className="text-[14px] text-[#AEAEB2] mt-1">Checking your Google connection…</p>
      </Shell>
    )
  }

  if (loadError && !status) {
    return (
      <Shell plain={plain}>
        <Banner banner={banner} />
        <h3 className="text-[15px] font-semibold text-[#1C1C1E]">Google Calendar</h3>
        <p className="text-[14px] text-[#6C6C70] mt-1 leading-snug">{loadError}</p>
      </Shell>
    )
  }

  if (status?.statusError) {
    return (
      <Shell plain={plain}>
        <Banner banner={banner} />
        <h3 className="text-[15px] font-semibold text-[#1C1C1E]">Google Calendar</h3>
        <p className="text-[14px] text-[#6C6C70] mt-1 leading-snug">{status.statusError}</p>
      </Shell>
    )
  }

  if (!status?.configured) {
    return (
      <Shell plain={plain}>
        <Banner banner={banner} />
        <h3 className="text-[15px] font-semibold text-[#1C1C1E]">Google Calendar</h3>
        <p className="text-[14px] text-[#6C6C70] mt-1 leading-snug">
          Google Calendar is not turned on for Home yet. You can still add and view household events here. Once it is turned on, each of you can connect your own Google account.
        </p>
        {status?.needsMigration && (
          <p className="text-[13px] text-[#6C6C70] mt-2 leading-snug">
            The household database also needs a one-time update. In the Supabase SQL Editor, run <code className="text-[12px] bg-[#F2F2F7] px-1.5 py-0.5 rounded-md">{GOOGLE_MIGRATION_FILE}</code>.
          </p>
        )}
      </Shell>
    )
  }

  if (status.needsMigration) {
    return (
      <Shell plain={plain}>
        <Banner banner={banner} />
        <h3 className="text-[15px] font-semibold text-[#1C1C1E]">Google Calendar</h3>
        <p className="text-[14px] text-[#6C6C70] mt-1 leading-snug">
          Before connecting, the household database needs a one-time update. In Supabase, open the SQL Editor and run <code className="text-[12px] bg-[#F2F2F7] px-1.5 py-0.5 rounded-md">{GOOGLE_MIGRATION_FILE}</code>. Until then, events you add here stay in Home.
        </p>
      </Shell>
    )
  }

  const others = (status.household || []).filter((person) => !person.you)
  const writable = (status.calendars || []).filter((calendar) => calendar.selected && calendar.writable)
  const working = Boolean(busy)

  if (!status.connected) {
    return (
      <Shell plain={plain}>
        <Banner banner={banner} />
        <h3 className="text-[15px] font-semibold text-[#1C1C1E]">Connect your Google Calendar</h3>
        <p className="text-[14px] text-[#6C6C70] mt-1 leading-snug">
          This connects the Google account for your login only. The other person connects theirs separately. If you both turn on the same shared calendar, its events show once.
        </p>
        {status.canConnect ? (
          <div className="mt-4">
            <PrimaryLink href={connectHref}>Connect Google Calendar</PrimaryLink>
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-[13px] text-[#AEAEB2] mb-3 leading-snug">Connect from the home site. This page will use that connection after you do.</p>
            <PrimaryLink href={connectHref}>Open the home site</PrimaryLink>
          </div>
        )}
        {others.length > 0 && <Household others={others} />}
      </Shell>
    )
  }

  return (
    <Shell plain={plain}>
      <Banner banner={banner} />
      <h3 className="text-[15px] font-semibold text-[#1C1C1E]">Your Google Calendar</h3>
      <p className="text-[14px] text-[#6C6C70] mt-1 leading-snug">
        {status.email ? `Connected as ${status.email}. ` : 'Connected. '}
        Turn on the calendars that should show for the household. {syncedLabel(status.lastSyncedAt)}.
      </p>
      {status.needsReconnect && (
        <p className="text-[14px] text-[#E6860A] mt-2 leading-snug">
          Google needs you to connect again. Access can expire after 7 days while the Google app is still in testing. Household events already here stay put.
        </p>
      )}
      {actionError && <p className="text-[13px] text-[#FF3B30] bg-[#FFF0EF] px-3 py-2 rounded-xl mt-3">{actionError}</p>}
      {actionNote && <p className="text-[13px] text-[#1A7A36] bg-[#E8F8ED] px-3 py-2 rounded-xl mt-3">{actionNote}</p>}

      <ul className="mt-4 max-h-72 overflow-y-auto space-y-1.5 pr-1">
        {status.calendars.map((calendar) => (
          <li key={calendar.googleCalendarId}>
            <label className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-[#F9F9FB]">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#007AFF]"
                checked={calendar.selected}
                disabled={working}
                onChange={() => toggleCalendar(calendar)}
              />
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: swatch(calendar.color) }} />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium text-[#1C1C1E] truncate">{calendar.name}</span>
                <span className="block text-[12px] text-[#AEAEB2] truncate">
                  {calendar.withBaby ? 'Shared household calendar' : calendar.primary ? 'Primary' : 'Calendar'}
                  {calendar.writable ? '' : ' · view only'}
                </span>
              </span>
            </label>
          </li>
        ))}
        {!status.calendars.length && (
          <li className="text-[13px] text-[#AEAEB2] px-2 py-2">No calendars yet. Refresh the list after connecting.</li>
        )}
      </ul>

      <div className="flex flex-wrap items-center gap-2 mt-4">
        {status.needsReconnect ? (
          status.canConnect ? <PrimaryLink href={connectHref}>Reconnect Google</PrimaryLink> : <PrimaryLink href={connectHref}>Reconnect on the home site</PrimaryLink>
        ) : (
          <PrimaryButton onClick={syncNow} disabled={working}>{busy === 'sync' ? 'Syncing…' : 'Sync now'}</PrimaryButton>
        )}
        {!status.needsReconnect && (
          <QuietButton onClick={refreshList} disabled={working}>{busy === 'refresh' ? 'Refreshing…' : 'Refresh list'}</QuietButton>
        )}
        <button
          type="button"
          onClick={disconnect}
          disabled={working}
          className="inline-flex items-center px-4 py-2.5 text-[13.5px] font-semibold text-[#FF3B30] hover:bg-[#FFF0EF] disabled:opacity-50 rounded-xl transition-colors"
        >
          {busy === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}
        </button>
      </div>

      {!status.needsReconnect && localEventCount > 0 && writable.length > 0 && (
        <div className="mt-4 pt-4 border-t border-[#F2F2F7]">
          <p className="text-[13px] text-[#6C6C70] leading-snug">
            {localEventCount === 1 ? '1 event is only in Home.' : `${localEventCount} events are only in Home.`} Copy them onto one of your Google calendars when you want them there too.
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <select
              value={importCalendarId}
              onChange={(event) => setChosenImportId(event.target.value)}
              className="px-3 py-2.5 bg-[#F9F9FB] rounded-xl border border-[#E5E5EA] text-[14px] text-[#1C1C1E]"
              aria-label="Calendar to copy Home events to"
            >
              {writable.map((calendar) => (
                <option key={calendar.googleCalendarId} value={calendar.googleCalendarId}>{calendar.name}</option>
              ))}
            </select>
            <PrimaryButton onClick={importEvents} disabled={working || !importCalendarId}>
              {busy === 'import' ? 'Copying…' : 'Copy Home events to Google'}
            </PrimaryButton>
          </div>
        </div>
      )}

      {others.length > 0 && <Household others={others} />}
    </Shell>
  )
}

function Household({ others }) {
  return (
    <div className="mt-4 pt-4 border-t border-[#F2F2F7] space-y-2">
      {others.map((person) => (
        <p key={person.userId} className="text-[13px] text-[#6C6C70] leading-snug">
          <span className="font-semibold text-[#1C1C1E]">{person.name}</span>
          {person.connected
            ? person.needsReconnect
              ? ' needs to reconnect Google.'
              : ` is connected${person.calendars?.length ? ` · ${person.calendars.map((calendar) => calendar.name).join(', ')}` : ''}.`
            : ' has not connected Google yet.'}
        </p>
      ))}
    </div>
  )
}
