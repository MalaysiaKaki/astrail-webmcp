'use client'

import { useEffect, useRef } from 'react'
import type {
  Place, RestaurantSuggestion, TransportLeg, TripBundle, TripPlace,
} from '@/lib/trip/backend-types'
import { hasRealCoords } from '@/lib/trip/selectors'
import { buildRouteLinks, type RouteLink } from '@/lib/trip/route-links'
import { stopProvenance, type StopProvenance } from '@/lib/trip/stop-provenance'
import EvidenceChip from '../EvidenceChip'
import RestaurantStrip from '../RestaurantStrip'
import { fmtDuration } from '../TransportStrip'

/**
 * The phone itinerary: a stop-by-stop route, the way a ride app pairs its map with the trip.
 *
 * Built from the same data as the desktop ItineraryCards — the same `buildRouteLinks` fold, the
 * same global trail numbers the pins paint — but shaped for a thumb: one row per stop, the leg
 * that brings you there sitting on the rail above it, and the evidence line always visible.
 *
 * No clock times. The trip holds no schedule (see ItineraryCards' estimated-times note), so the
 * row's second line is the stop's category and where it came from, never an invented "9:00".
 */

/* The rail: one continuous line from the first stop's dot to the last, with each transport leg
   sitting ON it between the two stops it joins — the way a ride app draws a multi-stop route.
   Every row (leg, gap, stop, expanded detail) carries the same fixed-width rail column, so its
   segments line up into one unbroken line. `data-rail` names each segment for the tests. */
function RailCol({ children }: { children: React.ReactNode }) {
  return (
    <span aria-hidden className="ml-1 flex w-7 shrink-0 flex-col items-center self-stretch">{children}</span>
  )
}

function Seg({ line, className = '' }: { line: boolean; className?: string }) {
  return (
    <span
      data-rail={line ? 'line' : 'cap'}
      className={['w-[2px] shrink-0 rounded-full', line ? 'bg-[var(--paper-line-2)]' : '', className].join(' ')}
    />
  )
}

function humanize(s: string): string {
  const t = s.replace(/_/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function LegRow({ link }: { link: RouteLink }) {
  const { leg, from } = link
  const routed = leg.status === 'ok'
  const timing = routed
    ? [
        fmtDuration(leg.duration_seconds),
        leg.distance_meters != null ? `${(leg.distance_meters / 1000).toFixed(1)} km` : '',
      ].filter(Boolean).join(', ')
    : ''
  return (
    <div className="flex gap-3">
      <RailCol><Seg line className="flex-1" /></RailCol>
      <p className="type-body min-w-0 flex-1 py-2.5 text-[13px] leading-snug text-[var(--muted)]">
        {from ? <span>from {from}, </span> : null}
        <span className="text-[var(--starlight)]">{humanize(leg.transport_mode)}</span>
        {timing ? <span className="tabular-nums text-[var(--brass-bright)]"> {timing}</span> : null}
        {!routed ? (
          <span className="mt-0.5 block text-[var(--muted)]">
            No route. {leg.warning ?? 'Routing unavailable for this leg.'}
          </span>
        ) : null}
      </p>
    </div>
  )
}

function ProvenanceLine({ p, full }: { p: StopProvenance; full: boolean }) {
  if (!p.text) return null
  const clamp = full ? '' : 'line-clamp-1'
  return p.kind === 'reel' || p.kind === 'requested' ? (
    <p className={`type-body mt-1 text-[14px] italic leading-snug text-[var(--muted)] ${clamp}`}>
      “{p.text}”
    </p>
  ) : (
    <p className={`type-body mt-1 text-[14px] leading-snug text-[var(--muted)] ${clamp}`}>{p.text}</p>
  )
}

function StopDetail({ tp, restaurants, placeIndex, selectedRestaurantPlaceId, onSelectRestaurant, railBelow }: {
  tp: TripPlace
  /** Whether the rail continues past this stop (it is not the last thing on the list). */
  railBelow: boolean
  restaurants: RestaurantSuggestion[]
  placeIndex: Map<string, Place>
  selectedRestaurantPlaceId: string | null
  onSelectRestaurant: (placeId: string) => void
}) {
  const { place, evidence_json: ev } = tp
  const located = hasRealCoords(place.lng, place.lat)
  const extraQuotes = ev.quotes.filter((q) => q.trim() && q !== ev.quote)
  const where = [place.area, place.city, place.country].filter(Boolean).join(', ')
  return (
    <div className="flex gap-3">
    <RailCol>{railBelow ? <Seg line className="flex-1" /> : null}</RailCol>
    <div className="min-w-0 flex-1 pb-3 pr-1">
      {extraQuotes.map((q) => (
        <p key={q} className="type-body mt-1 text-[14px] italic leading-snug text-[var(--muted)]">“{q}”</p>
      ))}
      <p className="type-body mt-2 text-[14px] text-[var(--muted)]">
        {located ? where || 'On the map' : 'Location unavailable — this stop could not be placed on the map.'}
      </p>
      <div className="mt-2">
        <EvidenceChip evidence={ev} />
      </div>
      {restaurants.length > 0 ? (
        <div className="mt-3">
          <p className="type-label mb-1.5 text-[12px] text-[var(--faint)]">Places to eat nearby</p>
          <RestaurantStrip
            restaurants={restaurants}
            placeIndex={placeIndex}
            selectedPlaceId={selectedRestaurantPlaceId}
            onSelect={onSelectRestaurant}
          />
        </div>
      ) : null}
    </div>
    </div>
  )
}

export default function StopTimeline({
  places, legs, restaurants, placeIndex, trailNumbers, selectedPlaceId, onSelectPlace,
  selectedRestaurantPlaceId, onSelectRestaurant,
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
  onSelectRestaurant: (placeId: string) => void
}) {
  const listRef = useRef<HTMLOListElement>(null)
  // A selection can arrive from outside this list — a map pin, or the agent's show_on_map — and
  // on a long day its row may be off-screen in the sheet. Bring the whole stop (row plus its
  // expanded detail) into view, as the desktop ItineraryCards does. 'nearest', so a tap on a row
  // already on screen does not jolt the list.
  useEffect(() => {
    if (!selectedPlaceId) return
    const row = listRef.current?.querySelector(`[data-place-id="${CSS.escape(selectedPlaceId)}"]`)
    const reduce = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    row?.closest('li')?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' })
  }, [selectedPlaceId])

  if (places.length === 0) {
    return <p className="type-body py-4 text-[14px] text-[var(--muted)]">No stops planned for this day.</p>
  }
  const { above, trailing } = buildRouteLinks(places, legs, placeIndex)
  const onList = new Set(places.map((tp) => tp.place_id))
  const anchoredTo = (placeId: string) => restaurants.filter((r) => r.near_place_id === placeId)
  const eatCount = (placeId: string) => anchoredTo(placeId).length
  // Suggestions not tied to a stop on this list still belong to the day; they must stay reachable.
  const unanchored = restaurants.filter((r) => !r.near_place_id || !onList.has(r.near_place_id))

  return (
    <>
      <ol ref={listRef} aria-label="Stops" className="flex flex-col">
        {places.map((tp, i) => {
          const selected = tp.place_id === selectedPlaceId
          const pin = trailNumbers.get(tp.id)
          const p = stopProvenance(tp)
          const link = above[i]
          // The line runs on past this dot unless it is the last thing on the rail.
          const railBelow = i < places.length - 1 || trailing.length > 0
          return (
            <li key={tp.id}>
              {link ? <LegRow link={link} /> : i > 0 ? (
                <div className="flex h-3"><RailCol><Seg line className="flex-1" /></RailCol></div>
              ) : null}
              <button
                type="button"
                data-place-id={tp.place_id}
                aria-expanded={selected}
                aria-current={selected ? 'true' : undefined}
                onClick={() => onSelectPlace(tp.place_id)}
                className={[
                  'flex min-h-11 w-full items-stretch gap-3 rounded-2xl pr-1 text-left transition-colors',
                  selected ? 'bg-[var(--brass-soft)]' : 'active:bg-[var(--chip-bg)]',
                ].join(' ')}
              >
                <RailCol>
                <Seg line={i > 0 || link !== null} className="h-2.5" />
                <span
                  data-rail="dot"
                  className={[
                    'type-label flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] tabular-nums',
                    pin != null
                      ? 'bg-[var(--brass)] text-[var(--ink-900,#1C1710)]'
                      : 'border-2 border-dashed border-[var(--line)]',
                  ].join(' ')}
                >
                  {pin != null ? pin : ''}
                </span>
                <Seg line={railBelow} className="flex-1" />
                </RailCol>
                <span className="sr-only">
                  {pin != null ? `Stop ${pin} of ${trailNumbers.size}` : 'Unnumbered stop'}
                </span>
                <span className="min-w-0 flex-1 py-2">
                  <span className="type-display block truncate text-[17px] leading-tight text-[var(--starlight)]">
                    {tp.place.name}
                  </span>
                  <span className="type-label mt-0.5 block text-[12px] text-[var(--faint)]">
                    {humanize(tp.place.place_type)}
                    <span aria-hidden> / </span>
                    <span className={p.kind === 'none' ? '' : 'text-[var(--brass-bright)]'}>{p.label}</span>
                  </span>
                  <ProvenanceLine p={p} full={selected} />
                  {!selected && eatCount(tp.place_id) > 0 ? (
                    <span className="type-label mt-1 block text-[12px] text-[var(--faint)]">
                      {eatCount(tp.place_id)} {eatCount(tp.place_id) === 1 ? 'place' : 'places'} to eat nearby
                    </span>
                  ) : null}
                </span>
              </button>
              {selected ? (
                <StopDetail
                  tp={tp}
                  restaurants={anchoredTo(tp.place_id)}
                  placeIndex={placeIndex}
                  selectedRestaurantPlaceId={selectedRestaurantPlaceId}
                  onSelectRestaurant={onSelectRestaurant}
                  railBelow={railBelow}
                />
              ) : null}
            </li>
          )
        })}
      </ol>
      {trailing.map((t) => <LegRow key={t.leg.id} link={t} />)}
      {unanchored.length > 0 ? (
        <section className="mt-5">
          <h3 className="type-display mb-2 text-[16px] text-[var(--starlight)]">Where to eat</h3>
          <RestaurantStrip
            restaurants={unanchored}
            placeIndex={placeIndex}
            selectedPlaceId={selectedRestaurantPlaceId}
            onSelect={onSelectRestaurant}
          />
        </section>
      ) : null}
    </>
  )
}
