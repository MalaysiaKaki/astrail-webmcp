/**
 * The itinerary card (PLAN §6), as a pure component: it takes the validated tool data and plain
 * callbacks, so it renders and tests without an MCP host. main.tsx owns the bridge.
 *
 * v2 is Astrail's phone trip page without the map, composed the way mobile/MobileTripView does it:
 * the trip hero, the date strip (days, then Stay), and for the chosen day DayHeaderCard over the
 * StopTimeline's Placify stop cards. The timeline, day header, leg connectors and eat cards are
 * the app's own, UNCHANGED, fed the real McpTripBundle (assignable to TripBundle — proven in
 * lib/mcp/contract.ts), so there is no cast anywhere on this path. Pieces whose modules reach the
 * map, WebMCP, Supabase or the feedback composer are mirrored locally (WidgetHero, DayStrip,
 * HotelSummary); each says why.
 */
import { useMemo, useState } from 'react'
import DayHeaderCard from '@/components/trip/panel/DayHeaderCard'
import StopTimeline from '@/components/trip/mobile/StopTimeline'
import EatCardLinks from '@/components/trip/mobile/EatCardLinks'
import { LegConnector } from '@/components/trip/mobile/LegConnector'
import type { Place, TransportLeg, TripDay, RestaurantSuggestion } from '@/lib/trip/backend-types'
import { buildRouteLinks } from '@/lib/trip/route-links'
import { buildPlaceIndex, buildTrailNumbers, orderedDays } from '@/lib/trip/selectors'
import DayStrip, { type ListView } from './DayStrip'
import HotelSummary from './HotelSummary'
import WidgetHero from './WidgetHero'
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

function StatusCard({ title, body }: { title: string; body?: string }) {
  return (
    <div className="widget-frame" role="status">
      <div className="m-card px-4 py-4">
        <p className="type-display text-[length:var(--t-title)] leading-tight text-[var(--m-text)]">{title}</p>
        {body ? <p className="type-body mt-1 whitespace-pre-line text-[15px] text-[var(--m-text-muted)]">{body}</p> : null}
      </div>
    </div>
  )
}

function LoadingCard() {
  return (
    <div className="widget-frame" role="status" aria-label="Loading itinerary">
      <div className="flex flex-col gap-3 motion-safe:animate-pulse" aria-hidden>
        <div className="h-14 w-2/3 rounded-[var(--m-r-sub)] bg-[var(--m-subcard)]" />
        <div className="h-[60px] w-full rounded-2xl bg-[var(--m-subcard)]" />
        <div className="m-card h-24 w-full" />
        <div className="m-card h-24 w-full" />
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

/** MobileTripView's "Day 1" capsule, beside a sub-header. Not a control. */
function Capsule({ children }: { children: React.ReactNode }) {
  return (
    <span className="type-body shrink-0 rounded-full bg-[var(--m-subcard)] px-2.5 text-[14px] font-medium leading-7 text-[var(--m-text)]">
      {children}
    </span>
  )
}

/** MobileTripView's section heading ("Where to stay", "Where to eat"). */
function SectionHeading({ children, capsule }: { children: React.ReactNode; capsule?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pb-2 pt-1">
      <h3 className="type-display text-[20px] leading-tight text-[var(--m-text)]">{children}</h3>
      {capsule ? <Capsule>{capsule}</Capsule> : null}
    </div>
  )
}

/**
 * A day whose stops were CUT from this bounded view (truncated.stops) and none survived. The
 * shared StopTimeline would say "No stops planned for this day" — false here (Codex review D1) —
 * so this renders the honest note, then what the view does carry for the day: its legs and its
 * places to eat, with the same connectors and eat cards the timeline uses.
 */
function PartialDay({ day, legs, restaurants, placeIndex }: {
  day: TripDay
  legs: TransportLeg[]
  restaurants: RestaurantSuggestion[]
  placeIndex: Map<string, Place>
}) {
  const { trailing } = buildRouteLinks([], legs, placeIndex)
  return (
    <>
      <p role="note" className="type-body m-subcard px-4 py-4 text-[15px] text-[var(--m-text-muted)]">
        No stops included in this partial view. Ask for Day {day.day_number} on its own, or open the trip in Astrail.
      </p>
      {trailing.map((t) => <LegConnector key={t.leg.id} link={t} />)}
      {restaurants.length > 0 ? (
        <section className="mt-6">
          <SectionHeading>Where to eat</SectionHeading>
          <EatCardLinks restaurants={restaurants} placeIndex={placeIndex} selectedPlaceId={null} />
        </section>
      ) : null}
    </>
  )
}

const ExpandIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
    strokeLinejoin="round" aria-hidden>
    <path d="M15 4h5v5M9 20H4v-5M20 4l-6 6M4 20l6-6" />
  </svg>
)

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
  const [view, setView] = useState<ListView>('stops')
  // Local only: there is no map to frame, so a tap opens the stop card's detail and a second tap
  // closes it, as the phone's cards do. Places to eat get no selection at all — on the phone a tap
  // shows one on the map, and a control here would promise that and do nothing (Codex F1).
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null)

  const slice = dayNumber === null ? null : daySlice(bundle, dayNumber)
  const partial = Object.values(truncated).some(Boolean)
  const hasHotels = bundle.hotels.length > 0

  const selectDay = (next: number) => {
    setDayNumber(next)
    setView('stops')
    setSelectedPlaceId(null)
    onDayChange?.({ trip_id: tripId, day: next })
  }
  const toggleStop = (id: string) => setSelectedPlaceId((cur) => (cur === id ? null : id))

  const stay = (
    <section className="flex flex-col gap-3" aria-label="Where to stay">
      <SectionHeading capsule={`${bundle.hotels.length} ${bundle.hotels.length === 1 ? 'hotel' : 'hotels'}`}>
        Where to stay
      </SectionHeading>
      <HotelSummary hotels={bundle.hotels} />
    </section>
  )

  return (
    <div className="widget-frame paper-scope flex flex-col gap-4">
      <WidgetHero
        bundle={bundle}
        omitted={{ inspiration: truncated.inspiration, quotes: truncated.quotes }}
        action={canFullscreen && onRequestFullscreen ? (
          <button type="button" onClick={onRequestFullscreen} aria-label="Expand" className="m-btn-icon self-start">
            {ExpandIcon}
          </button>
        ) : null}
      />

      {partial ? (
        <p role="note" className="type-body m-subcard px-4 py-3 text-[14px] leading-snug text-[var(--m-text)]">
          Showing part of this trip ({days.length} of {Math.max(savedDays.length, days.length)} days).
          Open it in Astrail for everything.
        </p>
      ) : null}

      {slice ? (
        <div>
          <DayStrip
            days={days}
            activeDayNumber={slice.day.day_number}
            listView={view}
            showStay={hasHotels}
            onSelectDay={selectDay}
            onStay={() => setView('stay')}
          />
          {view === 'stay' && hasHotels ? <div className="pt-2">{stay}</div> : (
            <section className="pt-2" aria-label={`Day ${slice.day.day_number}`}>
              <DayHeaderCard day={slice.day} />
              {slice.places.length === 0 && truncated.stops ? (
                <PartialDay day={slice.day} legs={slice.legs} restaurants={slice.restaurants} placeIndex={placeIndex} />
              ) : (
                <StopTimeline
                  bundle={bundle}
                  places={slice.places}
                  legs={slice.legs}
                  restaurants={slice.restaurants}
                  placeIndex={placeIndex}
                  trailNumbers={trailNumbers}
                  selectedPlaceId={selectedPlaceId}
                  onSelectPlace={toggleStop}
                  selectedRestaurantPlaceId={null}
                  variant="cards"
                  captionsOmitted={truncated.quotes}
                />
              )}
            </section>
          )}
        </div>
      ) : (
        <>
          <p className="type-body m-subcard px-4 py-4 text-[15px] text-[var(--m-text-muted)]">
            This trip has no scheduled days yet.
          </p>
          {hasHotels ? stay : null}
        </>
      )}

      {unscheduled.length > 0 && view === 'stops' ? (
        <section aria-label="Not on a day yet">
          <SectionHeading>Not on a day yet</SectionHeading>
          <ul className="flex flex-wrap gap-2">
            {unscheduled.map((tp) => (
              <li
                key={tp.id}
                className="type-body inline-flex min-h-8 max-w-full items-center rounded-full bg-[var(--m-subcard)] px-3 py-1 text-[14px] text-[var(--m-text)] [overflow-wrap:anywhere]"
              >
                {tp.place.name}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
