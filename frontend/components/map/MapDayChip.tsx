'use client'

import type { TripDay } from '@/lib/trip/backend-types'
import { dayLabel } from '@/lib/trip/day-labels'
import { usePanelObstruction } from '@/lib/trip/panel-obstruction'

/**
 * "Day 1 · Sep 18", floating top-centre over the desktop map (plan v2, Map and pins), so the map
 * says which day its emphasised route is without reading the panel. Centred in the part of the map
 * the panel leaves visible. A label, not a control: it takes no pointer and no tab stop, and it
 * is not a live region (the panel already announces the day).
 */
export default function MapDayChip({ day }: { day: TripDay }) {
  const panel = usePanelObstruction()
  const { monthDay } = dayLabel(day)
  return (
    <p
      data-testid="map-day-chip"
      className="m-frost type-body pointer-events-none absolute top-4 z-10 inline-flex h-11 -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full px-4 text-[length:var(--t-body)] font-semibold text-[var(--m-text)] shadow-[var(--m-shadow-1)] transition-[left] duration-300 ease-out motion-reduce:transition-none"
      style={{ left: `calc((100% + ${panel}px) / 2)` }}
    >
      <span>Day {day.day_number}</span>
      {monthDay ? (
        <>
          {' '}<span aria-hidden className="text-[var(--m-text-muted)]">·</span>{' '}
          <span className="font-medium text-[var(--m-text-muted)]">{monthDay}</span>
        </>
      ) : null}
    </p>
  )
}
