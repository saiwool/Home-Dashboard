'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { addDays } from '@/lib/dateUtils'
import {
  HOUR_HEIGHT,
  HOURS,
  WEEKDAY_LABELS,
  allDayOnDate,
  dateHeading,
  dayNumber,
  dayTimedBlocks,
  eventCalendarName,
  eventColor,
  eventInterval,
  eventsOnDate,
  foregroundFor,
  formatHourLabel,
  hexToRgba,
  monthKey,
  monthMatrix,
  nowMinutes,
  scheduleGroups,
  shiftAnchor,
  shortTime,
  slotFromOffset,
  viewHeading,
  visibleChips,
  weekDates,
  weekdayName,
} from '@/lib/calendarGrid'

function MonthChip({ event, date, tz, onOpen }) {
  const interval = eventInterval(event, tz)
  const color = eventColor(event)
  const open = (click) => {
    click.stopPropagation()
    onOpen(event, click.currentTarget.getBoundingClientRect())
  }
  if (interval.allDay) {
    return (
      <button
        type="button"
        data-event="true"
        title={event.title}
        onClick={open}
        className="pointer-events-auto w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium leading-4"
        style={{ backgroundColor: color, color: foregroundFor(color) }}
      >
        {event.title}
      </button>
    )
  }
  const time = interval.startDate === date ? shortTime(interval.start, tz) : ''
  return (
    <button
      type="button"
      data-event="true"
      title={event.title}
      onClick={open}
      className="pointer-events-auto flex w-full min-w-0 items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] leading-4 text-[#1C1C1E] hover:bg-[#F2F2F7]"
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      {time && <span className="shrink-0 text-[#6C6C70]">{time}</span>}
      <span className="truncate font-medium">{event.title}</span>
    </button>
  )
}

export function MonthView({ anchor, today, events, tz, onCreateDay, onOpenEvent, onOpenMore }) {
  const weeks = monthMatrix(anchor)
  const currentMonth = monthKey(anchor)
  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="grid shrink-0 grid-cols-7 border-b border-[#E5E5EA] bg-white">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="px-1 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.04em] text-[#6C6C70]">
            <span className="sm:hidden">{label.slice(0, 1)}</span>
            <span className="hidden sm:inline">{label}</span>
          </div>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <div
          className="grid h-full grid-cols-7"
          style={{ gridTemplateRows: 'repeat(6, minmax(5.75rem, 1fr))', minHeight: '34.5rem' }}
          role="grid"
          aria-label={viewHeading('month', anchor)}
        >
          {weeks.flat().map((date) => {
            const items = eventsOnDate(events, date, tz)
            const { visible, more } = visibleChips(items, 3)
            const outside = monthKey(date) !== currentMonth
            const isToday = date === today
            return (
              <div
                key={date}
                role="gridcell"
                className={`relative min-w-0 overflow-hidden border-b border-r border-[#E5E5EA] ${outside ? 'bg-[#F9F9FB]' : 'bg-white'}`}
              >
                <button
                  type="button"
                  className="absolute inset-0 z-0"
                  aria-label={`Add event on ${dateHeading(date)}`}
                  onClick={() => onCreateDay(date)}
                />
                <div className="pointer-events-none relative z-10 flex h-full flex-col gap-0.5 p-1">
                  <div className="mb-0.5 flex justify-center sm:justify-end sm:pr-0.5">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold ${isToday ? 'bg-[#007AFF] text-white' : outside ? 'text-[#AEAEB2]' : 'text-[#1C1C1E]'}`}>
                      {dayNumber(date)}
                    </span>
                  </div>
                  {visible.map((event) => (
                    <MonthChip key={event.id} event={event} date={date} tz={tz} onOpen={onOpenEvent} />
                  ))}
                  {more > 0 && (
                    <button
                      type="button"
                      className="pointer-events-auto truncate px-1 text-left text-[11px] font-semibold text-[#6C6C70] hover:text-[#007AFF]"
                      onClick={(click) => {
                        click.stopPropagation()
                        onOpenMore(date, items, click.currentTarget.getBoundingClientRect())
                      }}
                    >
                      +{more} more
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function TimedBlock({ block, tz, detailed, onOpen }) {
  const event = block.event
  const color = eventColor(event)
  const interval = eventInterval(event, tz)
  const height = Math.max(((block.endMin - block.startMin) / 60) * HOUR_HEIGHT - 3, 18)
  const timeLabel = `${shortTime(interval.start, tz)} – ${shortTime(interval.end, tz)}`
  return (
    <button
      type="button"
      data-event="true"
      title={`${event.title}, ${timeLabel}`}
      onClick={(click) => {
        click.stopPropagation()
        onOpen(event, click.currentTarget.getBoundingClientRect())
      }}
      className="absolute z-10 overflow-hidden rounded-md px-1.5 py-0.5 text-left text-[#1C1C1E]"
      style={{
        top: (block.startMin / 60) * HOUR_HEIGHT + 1,
        height,
        left: `calc(${(block.column / block.columns) * 100}% + 2px)`,
        width: `calc(${100 / block.columns}% - 4px)`,
        backgroundColor: hexToRgba(color, 0.18),
        borderLeft: `3px solid ${color}`,
      }}
    >
      <span className="block truncate text-[12px] font-semibold leading-4">{event.title}</span>
      {height >= 34 && <span className="block truncate text-[11px] leading-4 text-[#6C6C70]">{timeLabel}</span>}
      {detailed && height >= 52 && (
        <span className="block truncate text-[11px] leading-4 text-[#6C6C70]">{event.calendar_name || 'Household'}</span>
      )}
    </button>
  )
}

export function TimeGrid({ dates, events, tz, today, onCreateSlot, onOpenEvent, onOpenMore, onFocusDay }) {
  const scrollerRef = useRef(null)
  const [now, setNow] = useState(() => new Date())
  const dateKey = dates.join('|')
  const detailed = dates.length === 1
  const template = `3.25rem repeat(${dates.length}, minmax(0, 1fr))`
  const todayIndex = dates.indexOf(today)
  const minutes = nowMinutes(now, tz)

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(timer)
  }, [])

  useLayoutEffect(() => {
    const node = scrollerRef.current
    if (!node) return
    node.scrollTop = Math.max(0, 7 * HOUR_HEIGHT - 12)
  }, [dateKey])

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="grid shrink-0 border-b border-[#E5E5EA]" style={{ gridTemplateColumns: template }}>
        <div />
        {dates.map((date) => {
          const isToday = date === today
          return (
            <button
              key={date}
              type="button"
              onClick={() => onFocusDay(date)}
              className="flex min-w-0 flex-col items-center border-l border-[#E5E5EA] py-2 hover:bg-[#F9F9FB]"
            >
              <span className={`text-[11px] font-semibold uppercase tracking-wide ${isToday ? 'text-[#007AFF]' : 'text-[#6C6C70]'}`}>
                <span className="sm:hidden">{weekdayName(date, 'narrow')}</span>
                <span className="hidden sm:inline">{weekdayName(date)}</span>
              </span>
              <span className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-[18px] ${isToday ? 'bg-[#007AFF] font-semibold text-white' : 'text-[#1C1C1E]'}`}>
                {dayNumber(date)}
              </span>
            </button>
          )
        })}
      </div>
      <div className="grid max-h-32 shrink-0 overflow-y-auto border-b border-[#E5E5EA]" style={{ gridTemplateColumns: template }}>
        <div className="px-1 py-1 text-right text-[10px] font-medium uppercase leading-tight text-[#AEAEB2]">All day</div>
        {dates.map((date) => {
          const items = allDayOnDate(events, date, tz)
          const { visible, more } = visibleChips(items, dates.length === 1 ? 6 : 3)
          return (
            <div key={date} className={`relative min-h-8 min-w-0 border-l border-[#E5E5EA] p-0.5 ${date === today ? 'bg-[#007AFF]/[0.04]' : ''}`}>
              <button
                type="button"
                className="absolute inset-0 z-0"
                aria-label={`Add all-day event on ${dateHeading(date)}`}
                onClick={() => onCreateSlot({ date, allDay: true })}
              />
              <div className="pointer-events-none relative z-10 space-y-0.5">
                {visible.map((event) => (
                  <MonthChip key={event.id} event={event} date={date} tz={tz} onOpen={onOpenEvent} />
                ))}
                {more > 0 && (
                  <button
                    type="button"
                    className="pointer-events-auto px-1 text-left text-[11px] font-semibold text-[#6C6C70] hover:text-[#007AFF]"
                    onClick={(click) => {
                      click.stopPropagation()
                      onOpenMore(date, eventsOnDate(events, date, tz), click.currentTarget.getBoundingClientRect())
                    }}
                  >
                    +{more} more
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="relative" style={{ height: HOURS.length * HOUR_HEIGHT }}>
          <div className="grid h-full" style={{ gridTemplateColumns: template }}>
            <div className="relative">
              {HOURS.map((hour) => (
                <div key={hour} className="relative border-t border-[#E5E5EA]" style={{ height: HOUR_HEIGHT }}>
                  {hour > 0 && (
                    <span className="absolute -top-2 right-1 text-[10px] font-medium text-[#AEAEB2]">
                      {formatHourLabel(hour)}
                    </span>
                  )}
                </div>
              ))}
            </div>
            {dates.map((date) => {
              const blocks = dayTimedBlocks(events, date, tz)
              return (
                <div
                  key={date}
                  className={`relative min-w-0 border-l border-[#E5E5EA] ${date === today ? 'bg-[#007AFF]/[0.04]' : ''}`}
                >
                  {HOURS.map((hour) => (
                    <button
                      key={hour}
                      type="button"
                      tabIndex={-1}
                      aria-label={`Add event on ${dateHeading(date)} at ${formatHourLabel(hour)}`}
                      className="absolute inset-x-0 z-0 border-t border-[#E5E5EA] hover:bg-[#007AFF]/[0.06]"
                      style={{ top: hour * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                      onClick={(click) => {
                        const bounds = click.currentTarget.getBoundingClientRect()
                        const offset = hour * HOUR_HEIGHT + (click.clientY - bounds.top)
                        onCreateSlot({ date, allDay: false, ...slotFromOffset(offset) })
                      }}
                    />
                  ))}
                  {blocks.map((block) => (
                    <TimedBlock key={block.id} block={block} tz={tz} detailed={detailed} onOpen={onOpenEvent} />
                  ))}
                </div>
              )
            })}
          </div>
          {todayIndex >= 0 && (
            <div
              className="pointer-events-none absolute inset-x-0 z-20"
              style={{ top: (minutes / 60) * HOUR_HEIGHT }}
            >
              <div className="absolute left-0 right-0 border-t-2 border-[#FF3B30]" />
              <span className="absolute top-0 w-[3.25rem] -translate-y-1/2 pr-1 text-right text-[10px] font-semibold text-[#FF3B30]">
                <span className="bg-white px-0.5">{shortTime(now, tz)}</span>
              </span>
              <span
                className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#FF3B30]"
                style={{ left: `calc(3.25rem + (100% - 3.25rem) * ${todayIndex} / ${dates.length})` }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function ScheduleView({ anchor, today, events, tz, names, onOpenEvent, onCreateDay }) {
  const groups = scheduleGroups(events, anchor, tz, 21)
  const end = addDays(anchor, 20)
  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[#E5E5EA] bg-white px-4 py-2">
        <p className="text-[12px] font-medium text-[#6C6C70]">{dateHeading(anchor)} – {dateHeading(end)}</p>
        <button type="button" onClick={() => onCreateDay(anchor)} className="shrink-0 text-[12px] font-semibold text-[#007AFF]">
          Add event
        </button>
      </div>
      {groups.length === 0 ? (
        <div className="px-6 py-16 text-center">
          <p className="text-[15px] font-semibold text-[#1C1C1E]">Nothing scheduled</p>
          <p className="mt-1 text-[13px] text-[#AEAEB2]">This range is clear. Add an event or move to another week.</p>
        </div>
      ) : (
        <ul>
          {groups.map((group) => {
            const isToday = group.date === today
            return (
              <li key={group.date} className="grid grid-cols-[4.25rem_minmax(0,1fr)] gap-2 border-b border-[#F2F2F7] px-3 py-3 sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:px-4">
                <div className="pt-1 text-center">
                  <p className={`text-[11px] font-semibold uppercase ${isToday ? 'text-[#007AFF]' : 'text-[#6C6C70]'}`}>
                    {weekdayName(group.date)}
                  </p>
                  <p className={`mx-auto mt-0.5 flex h-9 w-9 items-center justify-center rounded-full text-[18px] font-semibold ${isToday ? 'bg-[#007AFF] text-white' : 'text-[#1C1C1E]'}`}>
                    {dayNumber(group.date)}
                  </p>
                </div>
                <ul className="min-w-0 space-y-1">
                  {group.events.map((event) => {
                    const color = eventColor(event)
                    const interval = eventInterval(event, tz)
                    const when = interval.allDay ? 'All day' : shortTime(interval.start, tz)
                    return (
                      <li key={event.id}>
                        <button
                          type="button"
                          onClick={(click) => onOpenEvent(event, click.currentTarget.getBoundingClientRect())}
                          className="flex w-full min-w-0 items-start gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-[#F2F2F7]"
                        >
                          <span className="w-16 shrink-0 pt-0.5 text-[12px] text-[#6C6C70]">{when}</span>
                          <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                          <span className="min-w-0">
                            <span className="block truncate text-[14px] font-medium text-[#1C1C1E]">{event.title}</span>
                            <span className="block truncate text-[12px] text-[#6C6C70]">{eventCalendarName(event, names)}</span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function MiniMonth({ anchor, today, view, onSelect }) {
  const [cursor, setCursor] = useState(anchor)
  const weeks = monthMatrix(cursor)
  const [year, month] = cursor.split('-').map(Number)
  const label = new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const range = view === 'week' || view === 'schedule' ? new Set(weekDates(anchor)) : new Set([anchor])

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="truncate text-[13px] font-semibold text-[#1C1C1E]">{label}</p>
        <div className="flex items-center">
          <button type="button" aria-label="Previous month" onClick={() => setCursor(shiftAnchor('month', cursor, -1))} className="flex h-7 w-7 items-center justify-center rounded-full text-[#6C6C70] hover:bg-[#E5E5EA]">
            <Chevron direction="left" />
          </button>
          <button type="button" aria-label="Next month" onClick={() => setCursor(shiftAnchor('month', cursor, 1))} className="flex h-7 w-7 items-center justify-center rounded-full text-[#6C6C70] hover:bg-[#E5E5EA]">
            <Chevron direction="right" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center">
        {WEEKDAY_LABELS.map((day) => (
          <span key={day} className="py-1 text-[10px] font-semibold uppercase text-[#AEAEB2]">{day.slice(0, 1)}</span>
        ))}
        {weeks.flat().map((date) => {
          const outside = monthKey(date) !== monthKey(cursor)
          const isToday = date === today
          const inRange = range.has(date)
          let tone = 'text-[#1C1C1E] hover:bg-[#E5E5EA]'
          if (outside && !isToday) tone = 'text-[#AEAEB2] hover:bg-[#E5E5EA]'
          if (inRange && !isToday) tone = 'bg-[#EBF5FF] text-[#007AFF]'
          if (isToday) tone = 'bg-[#007AFF] text-white'
          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelect(date)}
              className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-medium ${tone}`}
              aria-current={isToday ? 'date' : undefined}
              aria-pressed={date === anchor}
            >
              {dayNumber(date)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function Chevron({ direction }) {
  const left = direction === 'left'
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4" aria-hidden="true">
      <path d={left ? 'M12.5 4.5 7 10l5.5 5.5' : 'M7.5 4.5 13 10l-5.5 5.5'} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
