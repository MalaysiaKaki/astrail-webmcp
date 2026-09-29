'use client'

import { useState } from 'react'
import type { TripDay } from '@/lib/trip/backend-types'
import { dayLabel } from '@/lib/trip/day-labels'
import { weatherChip, type WeatherIcon } from '@/lib/trip/weather-chip'

/**
 * The desktop Trip tab's day header (plan v2 §3): serif date, a "Day N" capsule, the day's title,
 * and a weather chip. The chip's icon comes from the stored weather code only (lib/trip/
 * weather-chip); without a code the chip is text alone, and without any weather there is none.
 * A heading block, not a control.
 */
/** A summary longer than this gets the two-line clamp and its More/Less control. */
const SUMMARY_MORE_CHARS = 110

export default function DayHeaderCard({ day, rewriting = false }: {
  day: TripDay
  /** A summary rewrite is running for this trip: the prose below describes it BEFORE the edit. */
  rewriting?: boolean
}) {
  const label = dayLabel(day)
  const weather = weatherChip(day)
  const [more, setMore] = useState(false)
  const summary = day.summary?.trim() || null
  // Clamped ONLY when "More" is offered. Character count does not predict rendered lines (an 80-
  // character CJK summary can run to four), so a clamp without its control can hide text for good.
  const expandable = summary !== null && summary.length > SUMMARY_MORE_CHARS
  return (
    <div data-testid="day-header-card" className="m-card mb-3 flex flex-col gap-2 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <h3 className="type-display shrink-0 text-[length:var(--t-title)] leading-tight text-[var(--m-text)]">
          {label.monthDay ?? `Day ${day.day_number}`}
        </h3>
        {label.monthDay ? (
          <span className="type-body shrink-0 rounded-full bg-[var(--m-subcard)] px-2.5 text-[length:var(--t-meta)] font-medium leading-7 text-[var(--m-text)]">
            Day {day.day_number}
          </span>
        ) : null}
        {weather ? (
          <span
            data-testid="weather-chip"
            data-icon={weather.icon ?? 'none'}
            title={weather.label}
            className="type-body ml-auto inline-flex min-w-0 shrink items-center gap-1.5 rounded-full bg-[var(--m-subcard)] px-2.5 text-[length:var(--t-meta)] leading-7 text-[var(--m-text)]"
          >
            {weather.icon ? <WeatherGlyph icon={weather.icon} /> : null}
            <span className="truncate tabular-nums">{weather.text}</span>
            {weather.label !== weather.text ? <span className="sr-only">: {weather.label}</span> : null}
          </span>
        ) : null}
      </div>
      {day.title ? (
        <p className="type-body text-[length:var(--t-body)] leading-snug text-[var(--m-text-muted)] [overflow-wrap:anywhere]">{day.title}</p>
      ) : null}
      {/* The day's story in two lines (A10), with "More" for the rest. While a rewrite runs the
          old prose stays, marked, and dimmed: true text about an itinerary that just changed. */}
      {rewriting ? (
        <p role="status" data-testid="day-header-rewriting" className="t-label text-[var(--m-accent)]">
          Updating this day&apos;s summary
        </p>
      ) : null}
      {summary ? (
        <div className={['flex flex-col items-start', rewriting ? 'opacity-70' : ''].join(' ')}>
          <p data-day-summary className={['t-body leading-snug text-[var(--m-text)] [overflow-wrap:anywhere]', expandable && !more ? 'line-clamp-2' : ''].join(' ')}>{summary}</p>
          {expandable ? (
            <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more}
              className="t-meta -ml-2 min-h-11 rounded-full px-2 font-semibold text-[var(--m-accent)] focus-visible:outline-none focus-visible:shadow-[var(--m-focus)]">
              {more ? 'Less' : 'More'}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

const PATHS: Record<WeatherIcon, string> = {
  clear: 'M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  cloud: 'M7 18h10a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.6 1.5A3.3 3.3 0 0 0 7 18Z',
  fog: 'M4 10h16M6 14h12M8 18h8M7 6h10',
  drizzle: 'M7 14h10a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.6 1.5A3.3 3.3 0 0 0 7 14ZM9 18v1M13 18v1M17 18v1',
  rain: 'M7 14h10a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.6 1.5A3.3 3.3 0 0 0 7 14ZM9 17l-1 3M13 17l-1 3M17 17l-1 3',
  snow: 'M7 14h10a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.6 1.5A3.3 3.3 0 0 0 7 14ZM9 18h.01M13 20h.01M17 18h.01',
  showers: 'M7 13h10a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.6 1.5A3.3 3.3 0 0 0 7 13ZM8 16l-1 2M12 16l-1 2M16 16l-1 2M10 20l-.5 1M14 20l-.5 1',
  storm: 'M7 13h10a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.6 1.5A3.3 3.3 0 0 0 7 13ZM12 14l-2 4h3l-2 4',
}

function WeatherGlyph({ icon }: { icon: WeatherIcon }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden className="h-4 w-4 shrink-0 text-[var(--m-accent)]">
      <path d={PATHS[icon]} />
    </svg>
  )
}
