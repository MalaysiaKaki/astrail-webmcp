'use client'

import Link from 'next/link'
import type { Trip } from '@/lib/trip/backend-types'
import {
  tripTitle,
  tripDateRange,
  tripStatusLabel,
  statusDotClass,
  budgetLabel,
} from '@/lib/trip/trip-presenters'
import { META, TAG } from '@/lib/shell/ui'
import { ChevronRightIcon } from '@/components/dashboard/nav-icons'
import RouteGlyph from './RouteGlyph'

/* One trip card in the inventory (middle pane). The card body is a select control — clicking
   it drives the map on the right, it does NOT navigate. The selected card reveals an explicit
   "Open trip" row into the full workspace, so selection and navigation stay distinct (no nested
   interactives).

   Placify trip card (web revamp C4): a white elevated card with an avatar, a bold title, a status
   tag and 14px meta. The list payload carries no Reel thumbnail and C4 adds no fetches, so the
   avatar is the trip's own route glyph on a tinted tile rather than a photo. The card surface is
   built from the kit tokens, not .m-card: the selected state adds an ink ring to the shadow, and
   the unlayered .m-card box-shadow would win over it. Focus rings are inset because the card
   clips its corners. */

export default function TripRow({
  trip,
  selected,
  onSelect,
}: {
  trip: Trip
  selected: boolean
  onSelect: () => void
}) {
  const title = tripTitle(trip)

  return (
    <li
      className={`overflow-hidden rounded-[var(--m-r-card)] bg-[color:var(--m-card)] transition-shadow duration-[var(--m-dur-press)] motion-reduce:transition-none ${
        selected ? 'shadow-[0_0_0_2px_var(--m-ink),var(--m-shadow-1)]' : 'shadow-[var(--m-shadow-1)]'
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="flex w-full items-center gap-3.5 p-3.5 text-left transition-colors duration-[var(--m-dur-press)] hover:bg-[color:var(--m-subcard)] focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--m-accent)] motion-reduce:transition-none"
      >
        <span className="flex h-16 w-16 flex-none items-center justify-center rounded-[var(--m-r-sub)] bg-[color:var(--m-subcard)] [&_svg]:h-auto [&_svg]:w-[52px]">
          <RouteGlyph tripId={trip.id} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="t-card-title truncate text-[color:var(--m-text)]">{title}</span>
          <span className={META}>{tripDateRange(trip)}</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={TAG}>
              <span aria-hidden className={statusDotClass(trip.status)} />
              {tripStatusLabel(trip.status)}
            </span>
            <span className={META}>
              {budgetLabel(trip.budget_level)}
              {trip.origin_city ? ` · from ${trip.origin_city}` : null}
            </span>
          </span>
        </span>
      </button>

      {selected ? (
        <Link
          href={`/app/trip/${trip.id}`}
          aria-label={`Open ${title} trip`}
          className="flex min-h-12 items-center gap-2 border-t border-[color:var(--line-soft)] px-4 font-[family-name:var(--font-ui)] text-[length:var(--t-body)] font-semibold text-[color:var(--m-ink)] transition-colors duration-[var(--m-dur-press)] hover:bg-[color:var(--m-subcard)] focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--m-accent)] motion-reduce:transition-none"
        >
          Open trip
          <ChevronRightIcon className="m-chevron" />
        </Link>
      ) : null}
    </li>
  )
}
