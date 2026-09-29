'use client'

import { useEffect, useRef } from 'react'
import type {
  Place, RestaurantSuggestion, TransportLeg, TripBundle, TripPlace,
} from '@/lib/trip/backend-types'
import { buildRouteLinks } from '@/lib/trip/route-links'
import { stopProvenance } from '@/lib/trip/stop-provenance'
import { buildPopupModel, thumbnailFor } from '@/components/map/popup-model'
import EatCardLinks from './EatCardLinks'
import { Connector, LegConnector } from './LegConnector'
import StopCard from './StopCard'
import CompactStopRow from './CompactStopRow'

/**
 * The phone itinerary: numbered stop cards joined by the legs between them (Placify pattern).
 *
 * Built from the same data as the desktop ItineraryCards — the same `buildRouteLinks` fold, the
 * same global trail numbers the pins paint — but shaped for a thumb: one card per stop, the leg
 * that brings you there on a dotted connector above it, and the evidence always visible.
 *
 * No clock times. The trip holds no schedule (see ItineraryCards' estimated-times note), so a
 * card's second line is the stop's category and where it came from, never an invented "9:00".
 */

export default function StopTimeline({
  bundle, places, legs, restaurants, placeIndex, trailNumbers, selectedPlaceId, onSelectPlace,
  selectedRestaurantPlaceId, onSelectRestaurant, onShow3d, showConfidence = false,
  variant = 'cards', detailPlaceId = null, detailFooter = null, captionsOmitted = false,
}: {
  bundle: TripBundle
  places: TripPlace[]
  legs: TransportLeg[]
  restaurants: RestaurantSuggestion[]
  placeIndex: Map<string, Place>
  /** `buildTrailNumbers` — the numbering the pins paint and the agent's tools resolve. */
  trailNumbers: Map<string, number>
  selectedPlaceId: string | null
  /** Called on every tap, including a re-tap of the selected row (which re-frames the map). */
  onSelectPlace: (placeId: string) => void
  selectedRestaurantPlaceId: string | null
  /** Show a place to eat on the map. Omitted where there is no map (the ChatGPT widget): the eat
   *  cards are then plain content that keeps its Evidence link (EatCardLinks). */
  onSelectRestaurant?: (placeId: string) => void
  /** "Show in 3D" in the selected stop's detail; omitted, the button is not offered. */
  onShow3d?: (placeId: string) => void
  /** Desktop: the confidence chip in the selected stop's detail (the phone keeps it out). */
  showConfidence?: boolean
  /** 'cards' (phone): the Placify stop cards, the selected one expanded. 'rows' (desktop, A10):
   *  compact rows that open the place card on the map; only `detailPlaceId` expands, when its
   *  detail lives in the sidebar instead. Every suggestion of the day is listed after the stops. */
  variant?: 'cards' | 'rows'
  detailPlaceId?: string | null
  /** Under the sidebar detail: the way back to the map card. */
  detailFooter?: React.ReactNode
  /** The bounded view dropped caption quotes (the widget's truncated.quotes): a quote-less Reel stop
   *  says the caption is not included here rather than "No caption evidence". */
  captionsOmitted?: boolean
}) {
  const listRef = useRef<HTMLOListElement>(null)
  // The last row the user tapped HERE. A selection echoing that tap keeps 'nearest' (the row is
  // already under their finger); any other selection — a map pin, show_on_map — is brought to
  // the top of the list.
  const tappedRef = useRef<string | null>(null)
  // A selection can arrive from outside this list — a map pin, or the agent's show_on_map — and
  // on a long day its row may be off-screen in the sheet. Bring the whole stop (row plus its
  // expanded detail) into view, as the desktop ItineraryCards does. 'nearest', so a tap on a row
  // already on screen does not jolt the list.
  useEffect(() => {
    if (!selectedPlaceId) return
    const row = listRef.current?.querySelector(`[data-place-id="${CSS.escape(selectedPlaceId)}"]`)
    const reduce = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const fromTap = tappedRef.current === selectedPlaceId
    tappedRef.current = null
    // 'start' + the li's scroll-margin aligns an external selection just below the top edge of
    // the sheet's scroller, instead of 'nearest' leaving the previous stop half-cut above it.
    row?.closest('li')?.scrollIntoView({ block: fromTap ? 'nearest' : 'start', behavior: reduce ? 'auto' : 'smooth' })
  }, [selectedPlaceId])

  const { above, trailing } = buildRouteLinks(places, legs, placeIndex)
  const onList = new Set(places.map((tp) => tp.place_id))
  const anchoredTo = (placeId: string) => restaurants.filter((r) => r.near_place_id === placeId)
  // Suggestions not tied to a stop on this list still belong to the day; they must stay reachable.
  const unanchored = restaurants.filter((r) => !r.near_place_id || !onList.has(r.near_place_id))
  const rows = variant === 'rows'

  return (
    <>
      {/* No early return for an empty day: its restaurant suggestions (all unanchored then) still
          render in "Where to eat" below, as they do in the desktop rail's separate strip. */}
      {places.length === 0 ? (
        <p className="type-body m-subcard px-4 py-4 text-[15px] text-[var(--m-text-muted)]">No stops planned for this day.</p>
      ) : (
      <ol ref={listRef} aria-label="Stops" className="flex flex-col pb-1">
        {places.map((tp, i) => {
          const link = above[i]
          return (
            <li key={tp.id} className="scroll-mt-3">
              {link ? <LegConnector link={link} /> : i > 0 ? <Connector /> : null}
              {rows && tp.place_id !== detailPlaceId ? (
                <CompactStopRow
                  tp={tp}
                  pin={trailNumbers.get(tp.id)}
                  total={trailNumbers.size}
                  provenance={stopProvenance(tp)}
                  thumbnail={thumbnailFor(bundle, tp)}
                  selected={tp.place_id === selectedPlaceId}
                  onTap={() => { tappedRef.current = tp.place_id; onSelectPlace(tp.place_id) }}
                  captionOmitted={captionsOmitted}
                />
              ) : (
              <>
              <StopCard
                tp={tp}
                pin={trailNumbers.get(tp.id)}
                total={trailNumbers.size}
                provenance={stopProvenance(tp)}
                thumbnail={thumbnailFor(bundle, tp)}
                selected={rows || tp.place_id === selectedPlaceId}
                eatCount={anchoredTo(tp.place_id).length}
                onTap={() => { tappedRef.current = tp.place_id; onSelectPlace(tp.place_id) }}
                restaurants={anchoredTo(tp.place_id)}
                placeIndex={placeIndex}
                selectedRestaurantPlaceId={selectedRestaurantPlaceId}
                onSelectRestaurant={onSelectRestaurant}
                // The trip-relative detail (the Reel link, the local-script name, confidence) is
                // derived for the open card only — the same model the map's cards are built from.
                detail={rows || tp.place_id === selectedPlaceId ? buildPopupModel(bundle, tp) : null}
                showConfidence={showConfidence}
                onShow3d={onShow3d ? () => onShow3d(tp.place_id) : undefined}
                captionOmitted={captionsOmitted}
              />
              {rows ? detailFooter : null}
              </>
              )}
            </li>
          )
        })}
      </ol>
      )}
      {trailing.map((t) => <LegConnector key={t.leg.id} link={t} />)}
      {(rows ? restaurants : unanchored).length > 0 ? (
        <section className="mt-6 scroll-mt-3" data-day-eats={rows ? '' : undefined}>
          <h3 tabIndex={rows ? -1 : undefined} className="type-display mb-3 text-[20px] leading-tight text-[var(--m-text)] focus-visible:outline-none">Where to eat</h3>
          <EatCardLinks
            restaurants={rows ? restaurants : unanchored}
            placeIndex={placeIndex}
            selectedPlaceId={selectedRestaurantPlaceId}
            onSelect={onSelectRestaurant}
          />
        </section>
      ) : null}
    </>
  )
}
