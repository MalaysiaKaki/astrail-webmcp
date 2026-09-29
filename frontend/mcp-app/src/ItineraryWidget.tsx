/**
 * The itinerary card (PLAN §6), as a pure component: it takes the validated tool data and plain
 * callbacks, so it renders and tests without an MCP host. main.tsx owns the bridge.
 *
 * The trip components are the app's own, UNCHANGED, fed the real McpTripBundle (assignable to
 * TripBundle — proven in lib/mcp/contract.ts), so there is no cast anywhere on this path.
 */
import { useMemo, useState } from 'react'
import DayOverview from '@/components/trip/DayOverview'
import DaySelector from '@/components/trip/DaySelector'
import ItineraryCards from '@/components/trip/ItineraryCards'
import RestaurantStrip from '@/components/trip/RestaurantStrip'
import TransportStrip from '@/components/trip/TransportStrip'
import { buildPlaceIndex, buildTrailNumbers, orderedDays } from '@/lib/trip/selectors'
import HotelSummary from './HotelSummary'
import {
  availableDayNumbers, daySlice, initialDayNumber, unscheduledPlaces, type WidgetDayState,
} from './day-view'
import { GENERIC_ERROR, type WidgetData, type WidgetPhase } from './tool-result'

export type ItineraryWidgetProps = {
  data: WidgetData
  /** The host-restored selection, if any; honoured only for this trip and a day it carries. */
  restored: WidgetDayState | null
  onDayChange?: (state: WidgetDayState) => void
  canFullscreen?: boolean
  onRequestFullscreen?: () => void
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="type-label mb-2 text-[10px] uppercase tracking-wide text-[var(--faint)]">{children}</h3>
  )
}

function StatusCard({ title, body }: { title: string; body?: string }) {
  return (
    <div className="widget-frame" role="status">
      <div className="surface rounded-xl p-4">
        <p className="type-display text-base text-[var(--starlight)]">{title}</p>
        {body ? <p className="type-body mt-1 whitespace-pre-line text-sm text-[var(--muted)]">{body}</p> : null}
      </div>
    </div>
  )
}

function LoadingCard() {
  return (
    <div className="widget-frame" role="status" aria-label="Loading itinerary">
      <div className="flex flex-col gap-2" aria-hidden>
        <div className="widget-skeleton h-5 w-2/3 rounded" />
        <div className="widget-skeleton h-11 w-full rounded-lg" />
        <div className="widget-skeleton h-20 w-full rounded-xl" />
        <div className="widget-skeleton h-20 w-full rounded-xl" />
      </div>
    </div>
  )
}

/** Every non-ready phase has an explicit state — the widget never shows a blank frame. */
export function WidgetView({ phase, ...rest }: Omit<ItineraryWidgetProps, 'data'> & { phase: WidgetPhase }) {
  switch (phase.kind) {
    case 'waiting':
    case 'loading':
      return <LoadingCard />
    case 'cancelled':
      return <StatusCard title="Itinerary request cancelled" />
    case 'error':
      return <StatusCard title={GENERIC_ERROR} body={phase.message === GENERIC_ERROR ? undefined : phase.message} />
    case 'malformed':
      return <StatusCard title="Couldn't display this itinerary" body="Open the trip in Astrail to see it." />
    case 'ready':
      return <ItineraryWidget data={phase.data} {...rest} />
  }
}

function dateRange(start: string | null, end: string | null): string | null {
  if (!start) return null
  return end && end !== start ? `${start} – ${end}` : start
}

export default function ItineraryWidget({
  data, restored, onDayChange, canFullscreen = false, onRequestFullscreen,
}: ItineraryWidgetProps) {
  const { bundle, truncated, saved_day_numbers: savedDays } = data
  const tripId = bundle.trip.id
  const days = useMemo(() => orderedDays(bundle), [bundle])
  const available = useMemo(() => availableDayNumbers(bundle), [bundle])
  const trailNumbers = useMemo(() => buildTrailNumbers(bundle), [bundle])
  const placeIndex = useMemo(() => buildPlaceIndex(bundle), [bundle])
  const unscheduled = useMemo(() => unscheduledPlaces(bundle), [bundle])

  const [dayNumber, setDayNumber] = useState<number | null>(() =>
    initialDayNumber({ available, focusDay: data.focusDay, tripId, restored }))
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null)

  const slice = dayNumber === null ? null : daySlice(bundle, dayNumber)
  const partial = Object.values(truncated).some(Boolean)
  const stopsIncomplete = truncated.stops
  const title = bundle.trip.title ?? bundle.trip.inferred_destination ?? bundle.trip.destination_hint ?? 'Your trip'
  const subtitle = [
    bundle.trip.inferred_destination ?? bundle.trip.destination_hint,
    dateRange(bundle.trip.start_date, bundle.trip.end_date),
  ].filter(Boolean).join(' · ')

  const selectDay = (next: number) => {
    setDayNumber(next)
    setSelectedPlaceId(null)
    onDayChange?.({ trip_id: tripId, day: next })
  }

  return (
    <div className="widget-frame flex flex-col gap-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="type-display text-xl leading-tight text-[var(--starlight)]">{title}</h2>
          {subtitle ? <p className="type-body mt-0.5 text-xs text-[var(--muted)]">{subtitle}</p> : null}
        </div>
        {canFullscreen && onRequestFullscreen ? (
          <button
            type="button"
            onClick={onRequestFullscreen}
            className="type-label min-h-11 shrink-0 rounded-lg border border-[var(--line)] px-3 text-[11px] uppercase tracking-wide text-[var(--muted)] hover:text-[var(--starlight)]"
          >
            Expand
          </button>
        ) : null}
      </header>

      {partial ? (
        <p role="note" className="type-body rounded-lg border border-dashed border-[var(--brass)] px-3 py-2 text-xs text-[var(--starlight)]">
          Showing part of this trip ({days.length} of {Math.max(savedDays.length, days.length)} days).
          Open it in Astrail for everything.
        </p>
      ) : null}

      {slice ? (
        <>
          <DaySelector days={days} activeDayNumber={slice.day.day_number} onSelect={selectDay} />
          <section className="flex flex-col gap-3" aria-label={`Day ${slice.day.day_number}`}>
            <DayOverview day={slice.day} />
            {slice.places.length === 0 && stopsIncomplete ? (
              // The shared cards would say "No stops planned for this day" — false when the stops
              // were cut from this bounded view rather than never planned (Codex code review D1).
              <p role="note" className="type-body rounded-[var(--radius-card)] border border-dashed border-[var(--line)] p-3 text-sm text-[var(--muted)]">
                No stops included in this partial view. Ask for Day {slice.day.day_number} on its own, or open the trip in Astrail.
              </p>
            ) : slice.places.length === 0 && slice.legs.length > 0 ? (
              <TransportStrip legs={slice.legs} placeIndex={placeIndex} />
            ) : (
              <ItineraryCards
                places={slice.places}
                trailNumbers={trailNumbers}
                legs={slice.legs}
                placeIndex={placeIndex}
                bundle={bundle}
                selectedPlaceId={selectedPlaceId}
                onSelectPlace={(id) => setSelectedPlaceId((cur) => (cur === id ? null : id))}
              />
            )}
          </section>
          {slice.restaurants.length > 0 ? (
            <section>
              <SectionTitle>Where to eat</SectionTitle>
              <RestaurantStrip restaurants={slice.restaurants} placeIndex={placeIndex} />
            </section>
          ) : null}
        </>
      ) : (
        <p className="type-body rounded-[var(--radius-card)] border border-dashed border-[var(--line)] p-3 text-sm text-[var(--muted)]">
          This trip has no scheduled days yet.
        </p>
      )}

      {unscheduled.length > 0 ? (
        <section>
          <SectionTitle>Not on a day yet</SectionTitle>
          <ul className="flex flex-wrap gap-1.5">
            {unscheduled.map((tp) => (
              <li
                key={tp.id}
                className="type-body rounded-[var(--radius-chip)] bg-[var(--chip-bg)] px-2 py-1 text-xs text-[var(--starlight)]"
              >
                {tp.place.name}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {bundle.hotels.length > 0 ? (
        <section>
          <SectionTitle>Where to stay</SectionTitle>
          <HotelSummary hotels={bundle.hotels} />
        </section>
      ) : null}
    </div>
  )
}
