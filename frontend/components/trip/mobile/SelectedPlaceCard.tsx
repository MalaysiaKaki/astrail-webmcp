'use client'

import { useEffect, useRef } from 'react'
import type { Place, TripBundle, TripPlace } from '@/lib/trip/backend-types'
import { stopProvenance } from '@/lib/trip/stop-provenance'
import { buildPopupModel, thumbnailFor } from '@/components/map/popup-model'
import StopCard from './StopCard'

/**
 * The detail of a selected place that is NOT on the active day's list (Codex final-review fix 1).
 *
 * Every located trip place has a pin, but the list shows one day. An undayed place (the base hotel
 * of an older trip) has no day to switch to, so selecting its pin used to highlight it and show
 * nothing: the map popup that once carried its evidence was retired in A6. It now gets this pinned
 * card at the top of the list, built from the SAME StopCard/StopDetail model as a listed stop
 * (evidence, rationale, links, Show in 3D), so nothing about it is a second rendering to drift.
 *
 * Brought into view whenever it appears or the selection changes, like a listed stop's card.
 */
export default function SelectedPlaceCard({
  bundle, tp, trailNumbers, placeIndex, onSelectPlace, onShow3d, showConfidence = false,
  selectedRestaurantPlaceId, onSelectRestaurant,
}: {
  bundle: TripBundle
  tp: TripPlace
  trailNumbers: Map<string, number>
  placeIndex: Map<string, Place>
  onSelectPlace: (placeId: string) => void
  onShow3d?: (placeId: string) => void
  showConfidence?: boolean
  selectedRestaurantPlaceId: string | null
  onSelectRestaurant: (placeId: string) => void
}) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const reduce = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ref.current?.scrollIntoView?.({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
  }, [tp.place_id])
  return (
    <section ref={ref} aria-labelledby="selected-place-heading" className="mb-4 scroll-mt-3">
      <h3 id="selected-place-heading" className="type-label mb-2 text-[length:var(--t-label)] font-semibold uppercase tracking-[0.06em] text-[var(--m-text-muted)]">
        Selected place
      </h3>
      <StopCard
        tp={tp}
        pin={trailNumbers.get(tp.id)}
        total={trailNumbers.size}
        provenance={stopProvenance(tp)}
        thumbnail={thumbnailFor(bundle, tp)}
        selected
        eatCount={0}
        onTap={() => onSelectPlace(tp.place_id)}
        restaurants={[]}
        placeIndex={placeIndex}
        selectedRestaurantPlaceId={selectedRestaurantPlaceId}
        onSelectRestaurant={onSelectRestaurant}
        detail={buildPopupModel(bundle, tp)}
        showConfidence={showConfidence}
        onShow3d={onShow3d ? () => onShow3d(tp.place_id) : undefined}
      />
    </section>
  )
}
