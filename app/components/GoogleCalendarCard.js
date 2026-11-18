'use client'

import { PRODUCTION_ORIGIN } from '@/lib/google/messages'

const MIGRATION_FILE = 'supabase/migrations/20261118_google_calendar.sql'

function Shell({ children }) {
  return (
    <div className="bg-white rounded-2xl p-5 card mb-6">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-[#EBF5FF] rounded-xl flex items-center justify-center shrink-0">
          <svg viewBox="0 0 20 20" fill="none" stroke="#007AFF" strokeWidth="1.5" className="w-5 h-5">
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
    <a
      href={href}
      className="inline-flex items-center px-4 py-2.5 bg-[#007AFF] hover:bg-[#0066DD] text-white text-[13.5px] font-semibold rounded-xl transition-colors"
    >
      {children}
    </a>
  )
}

function QuietButton({ onClick, disabled, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center px-4 py-2.5 text-[13.5px] font-semibold text-[#FF3B30] hover:bg-[#FFF0EF] disabled:opacity-50 rounded-xl transition-colors"
    >
      {children}
    </button>
  )
}

export default function GoogleCalendarCard({
  status,
  unlinkedCount,
  importing,
  disconnecting,
  importResult,
  onImport,
  onDisconnect,
}) {
  const label = status.calendarLabel || 'with Baby'
  const busy = importing || disconnecting

  if (!status.connected) {
    return (
      <Shell>
        <h3 className="text-[15px] font-semibold text-[#1C1C1E]">Connect Google Calendar</h3>
        {status.statusError ? (
          <p className="text-[14px] text-[#6C6C70] mt-1 leading-snug">{status.statusError} Dashboard events still show below.</p>
        ) : !status.configured ? (
          <>
            <p className="text-[14px] text-[#6C6C70] mt-1 leading-snug">
              Google Calendar is not turned on for this server yet. Events below stay in the dashboard.
            </p>
            {status.missing?.length > 0 && (
              <p className="text-[13px] text-[#AEAEB2] mt-2 leading-snug break-words">
                Missing server settings: {status.missing.join(', ')}.
              </p>
            )}
            {status.needsMigration && (
              <p className="text-[13px] text-[#6C6C70] mt-2 leading-snug">
                Also run <code className="text-[12px] bg-[#F2F2F7] px-1.5 py-0.5 rounded-md">{MIGRATION_FILE}</code> in the Supabase SQL Editor.
              </p>
            )}
          </>
        ) : status.needsMigration ? (
          <p className="text-[14px] text-[#6C6C70] mt-1 leading-snug">
            One database update is still needed before connecting. In the Supabase SQL Editor, run <code className="text-[12px] bg-[#F2F2F7] px-1.5 py-0.5 rounded-md">{MIGRATION_FILE}</code>, then refresh. Until then, events stay in the dashboard.
          </p>
        ) : status.canConnect ? (
          <>
            <p className="text-[14px] text-[#6C6C70] mt-1 leading-snug">
              Connect a Google account that can edit the shared {label} calendar. Events you add, change, or delete here are written there. Events already in the dashboard stay here until you import them.
            </p>
            <div className="mt-4">
              <PrimaryLink href="/api/google/connect">Connect Google Calendar</PrimaryLink>
            </div>
          </>
        ) : (
          <>
            <p className="text-[14px] text-[#6C6C70] mt-1 leading-snug">
              Connect Google Calendar from the main site. This page will use that connection after you do.
            </p>
            <div className="mt-4">
              <PrimaryLink href={`${PRODUCTION_ORIGIN}/dashboard/calendar`}>Open the main site</PrimaryLink>
            </div>
          </>
        )}
      </Shell>
    )
  }

  const noun = unlinkedCount === 1 ? 'event is' : 'events are'

  function confirmImport() {
    const countLabel = unlinkedCount === 1 ? '1 dashboard event' : `${unlinkedCount} dashboard events`
    const ok = window.confirm(`Add ${countLabel} to ${label} on Google Calendar? Events already on Google are left as they are.`)
    if (ok) onImport()
  }

  function confirmDisconnect() {
    const ok = window.confirm('Disconnect Google Calendar? Events stay in the dashboard. Changes you make while disconnected are not written to Google.')
    if (ok) onDisconnect()
  }

  return (
    <Shell>
      <h3 className="text-[15px] font-semibold text-[#1C1C1E]">{label}</h3>
      <p className="text-[14px] text-[#6C6C70] mt-1 leading-snug">
        {status.email ? `Connected as ${status.email}. ` : 'Connected. '}
        Changes here are saved to this Google calendar. Changes made on Google show up when you open Calendar or Overview.
      </p>
      {status.needsReconnect && (
        <p className="text-[14px] text-[#E6860A] mt-2 leading-snug">
          Access expired. Google testing mode lasts 7 days until the app is published. Reconnect to keep writing events.
        </p>
      )}
      {status.needsMigration && (
        <p className="text-[13px] text-[#6C6C70] mt-2 leading-snug">
          Run <code className="text-[12px] bg-[#F2F2F7] px-1.5 py-0.5 rounded-md">{MIGRATION_FILE}</code> in the Supabase SQL Editor, then refresh.
        </p>
      )}
      {!status.needsReconnect && unlinkedCount > 0 && (
        <p className="text-[13px] text-[#AEAEB2] mt-2">
          {unlinkedCount} dashboard {noun} not on Google yet.
        </p>
      )}
      {importResult && (
        <div className="mt-3 text-[13px] text-[#6C6C70] leading-snug">
          <p>
            Imported {importResult.imported}.
            {importResult.failedCount > 0 ? ` ${importResult.failedCount} could not be imported.` : ''}
            {importResult.capped ? ' More than 500 were waiting. Run the import again for the rest.' : ''}
          </p>
          {importResult.failed?.map((item, index) => (
            <p key={`${item.title}-${index}`} className="text-[#FF3B30] mt-1">{item.title}: {item.message}</p>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 mt-4">
        {status.needsReconnect && status.canConnect && (
          <PrimaryLink href="/api/google/connect">Reconnect Google Calendar</PrimaryLink>
        )}
        {status.needsReconnect && !status.canConnect && (
          <PrimaryLink href={`${PRODUCTION_ORIGIN}/dashboard/calendar`}>Reconnect on the main site</PrimaryLink>
        )}
        {!status.needsReconnect && unlinkedCount > 0 && (
          <button
            type="button"
            onClick={confirmImport}
            disabled={busy}
            className="inline-flex items-center px-4 py-2.5 bg-[#007AFF] hover:bg-[#0066DD] disabled:opacity-50 text-white text-[13.5px] font-semibold rounded-xl transition-colors"
          >
            {importing ? 'Importing…' : 'Import existing dashboard events to Google'}
          </button>
        )}
        <QuietButton onClick={confirmDisconnect} disabled={busy}>
          {disconnecting ? 'Disconnecting…' : 'Disconnect'}
        </QuietButton>
      </div>
    </Shell>
  )
}
