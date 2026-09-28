'use client'

import type { Place, RestaurantSuggestion } from '@/lib/trip/backend-types'
import { safeHref } from '@/lib/safe-href'

/**
 * Restaurant suggestions on a phone, as card links: tap to show that place on the map.
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
        return (
          <li key={r.id} className="flex flex-col gap-1.5">
            {place ? (
              <button
                type="button"
                onClick={() => onSelect(place.id)}
                aria-pressed={place.id === selectedPlaceId}
                aria-label={`Show ${place.name} on the map`}
                className={[
                  'm-card-link',
                  place.id === selectedPlaceId ? 'outline-2 outline-solid outline-[var(--m-ink)]' : '',
                ].join(' ')}
              >
                {body}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25"
                  strokeLinecap="round" strokeLinejoin="round" aria-hidden className="m-chevron">
                  <polyline points="9 6 15 12 9 18" />
                </svg>
              </button>
            ) : (
              <div className="m-subcard flex px-4 py-3">{body}</div>
            )}
            {evidence ? (
              <a href={evidence} target="_blank" rel="noopener noreferrer" className="m-btn-secondary self-start">
                Evidence<span className="sr-only"> for {place?.name ?? 'this suggestion'} (opens in a new tab)</span>
              </a>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
