'use client'

import type { Place, RestaurantSuggestion } from '@/lib/trip/backend-types'
import { safeHref } from '@/lib/safe-href'

/**
 * Restaurant suggestions on a phone, as tappable cards: tap to show that place on the map.
 *
 * The phone's own list rather than the shared RestaurantStrip, whose desktop look must not change.
 * Same rules as that strip: only a suggestion with a place behind it becomes a control (a button
 * that cannot move the map promises something it will not do), and an evidence page, when there
 * is one, stays a separate link — a link cannot live inside the button.
 */
export default function EatCardLinks({ restaurants, placeIndex, selectedPlaceId, onSelect }: {
  restaurants: RestaurantSuggestion[]
  placeIndex: Map<string, Place>
  selectedPlaceId: string | null
  onSelect: (placeId: string) => void
}) {
  return (
    <ul className="flex flex-col gap-2">
      {restaurants.map((r) => {
        const place = r.restaurant_place_id ? placeIndex.get(r.restaurant_place_id) : undefined
        const evidence = safeHref(r.source_url)
        const body = (
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="type-body truncate text-[15px] font-semibold text-[var(--m-text)]">
                {place?.name ?? 'Suggested spot'}
              </span>
              {r.cuisine ? (
                <span className="type-body shrink-0 text-[14px] text-[var(--m-text-muted)]">{r.cuisine}</span>
              ) : null}
            </span>
            {r.summary ? (
              <span className="type-body mt-0.5 line-clamp-2 text-[14px] leading-snug text-[var(--m-text-muted)]">{r.summary}</span>
            ) : null}
          </span>
        )
        const chosen = Boolean(place && place.id === selectedPlaceId)
        return (
          <li key={r.id}>
            {/* One card per suggestion: the select button fills it, and the Evidence pill, when
                there is one, is a second row INSIDE the same card — so it reads as belonging to
                this suggestion — but outside the button (no link inside a button). Same surface
                pattern as StopCard. */}
            <div
              data-eat-card
              className={[
                place ? 'm-card' : 'm-subcard',
                'transition-transform duration-[var(--m-dur-press)] motion-reduce:transition-none',
                'has-[>button:active]:scale-[0.985] motion-reduce:has-[>button:active]:scale-100',
                'has-[>button:focus-visible]:outline-2 has-[>button:focus-visible]:outline-offset-2 has-[>button:focus-visible]:outline-solid has-[>button:focus-visible]:outline-[var(--m-accent)]',
                chosen ? 'outline-2 outline-solid outline-[var(--m-ink)]' : '',
              ].join(' ')}
            >
              {place ? (
                <button
                  type="button"
                  onClick={() => onSelect(place.id)}
                  aria-pressed={chosen}
                  aria-label={`Show ${place.name} on the map`}
                  className="flex min-h-14 w-full items-center gap-3 rounded-[var(--m-r-card)] px-4 py-3 text-left focus-visible:outline-none"
                >
                  {body}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25"
                    strokeLinecap="round" strokeLinejoin="round" aria-hidden className="m-chevron">
                    <polyline points="9 6 15 12 9 18" />
                  </svg>
                </button>
              ) : (
                <div className="flex px-4 py-3">{body}</div>
              )}
              {evidence ? (
                <div className="px-4 pb-3">
                  <a href={evidence} target="_blank" rel="noopener noreferrer" className="m-btn-secondary">
                    Evidence<span className="sr-only"> for {place?.name ?? 'this suggestion'} (opens in a new tab)</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                      strokeLinejoin="round" aria-hidden className="h-4 w-4">
                      <path d="M14 5h5v5M19 5l-8 8M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4" />
                    </svg>
                  </a>
                </div>
              ) : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
