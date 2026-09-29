'use client'

import type { TripDay } from '@/lib/trip/backend-types'
import { dayLabel } from '@/lib/trip/day-labels'
import { weatherChip, type WeatherIcon } from '@/lib/trip/weather-chip'

/**
 * The desktop Trip tab's day header (plan v2 §3): serif date, a "Day N" capsule, the day's title,
 * and a weather chip. The chip's icon comes from the stored weather code only (lib/trip/
 * weather-chip); without a code the chip is text alone, and without any weather there is none.
 * A heading block, not a control.
 */
export default function DayHeaderCard({ day }: { day: TripDay }) {
  const label = dayLabel(day)
  const weather = weatherChip(day)
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
        <p className="type-body text-[length:var(--t-body)] leading-snug text-[var(--m-text-muted)]">{day.title}</p>
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
