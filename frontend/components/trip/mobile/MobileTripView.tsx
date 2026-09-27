'use client'

import type {
  HotelSuggestion, Place, RestaurantSuggestion, TransportLeg, TripBundle, TripDay, TripPlace,
} from '@/lib/trip/backend-types'
import { tripDateRange, tripTitle } from '@/lib/trip/trip-presenters'
import DayOverview from '../DayOverview'
import HotelPanel from '../HotelPanel'
import TradeoffPanel from '../TradeoffPanel'
import MobileTopBar from './MobileTopBar'
import MobileTripSheet, { type SheetState } from './MobileTripSheet'
import StopTimeline from './StopTimeline'
import AboutThisTrip from './AboutThisTrip'

export type MobileListView = 'stops' | 'stay'

export type MobileTripViewProps = {
  bundle: TripBundle
  readOnly: boolean
  days: TripDay[]
  activeDay: TripDay | null
  activeDayNumber: number
  onSelectDay: (dayNumber: number) => void
  dayPlaces: TripPlace[]
  dayLegs: TransportLeg[]
  dayRestaurants: RestaurantSuggestion[]
  placeIndex: Map<string, Place>
  trailNumbers: Map<string, number>
  selectedPlaceId: string | null
  onSelectPlace: (placeId: string) => void
  selectedRestaurantPlaceId: string | null
  onSelectRestaurant: (placeId: string) => void
  hotels: HotelSuggestion[]
  selectedHotelId: string | null
  onSelectHotel: (id: string) => void
  layerMode: 'route' | 'hub'
  onLayerMode: (mode: 'route' | 'hub') => void
  canUseHubLayer: boolean
  listView: MobileListView
  onStay: () => void
  sheet: SheetState
  onToggleSheetHeight: () => void
  onHideSheet: () => void
  onReopenSheet: () => void
  summaryRewriting: boolean
}

function shortDate(iso: string | null): string {
  if (!iso) return ''
  // Pinned locale: see DaySelector — an unpinned one is a hydration mismatch.
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function Chip({ active, onClick, children, label }: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  label?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      onClick={onClick}
      className={[
        'type-label flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-[14px] transition-colors',
        active
          ? 'border-[var(--brass)] bg-[var(--brass-soft)] text-[var(--brass-bright)]'
          : 'border-[var(--line)] text-[var(--muted)]',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function SheetHeader(p: MobileTripViewProps) {
  const { bundle } = p
  const hasHotels = p.hotels.length > 0
  return (
    <div className="pb-2">
      <div role="group" aria-label="Trip days" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {p.days.map((d) => (
          <Chip
            key={d.id}
            active={p.listView === 'stops' && d.day_number === p.activeDayNumber}
            onClick={() => p.onSelectDay(d.day_number)}
          >
            <span className="font-semibold">Day {d.day_number}</span>
            {d.day_date ? <span className="text-[12px] opacity-80">{shortDate(d.day_date)}</span> : null}
          </Chip>
        ))}
        {hasHotels ? (
          <Chip active={p.listView === 'stay'} onClick={p.onStay}>Stay</Chip>
        ) : null}
      </div>
      <p className="type-body mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[var(--muted)]">
        <span className="tabular-nums">
          {bundle.places.length} places · {bundle.days.length} days · {bundle.transport_legs.length} legs
        </span>
        {bundle.trip.status === 'saved_with_gaps' ? (
          <span className="rounded-full bg-[var(--brass-soft)] px-2 py-0.5 text-[var(--brass-bright)]">Saved with gaps</span>
        ) : null}
      </p>
    </div>
  )
}

function DayDisclosure({ day, rewriting }: { day: TripDay; rewriting: boolean }) {
  if (!rewriting && !day.title && !day.summary && !day.weather_summary) return null
  return (
    <details className="group mt-4 rounded-2xl bg-[var(--chip-bg)] px-3">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
        <span className="type-body min-w-0 truncate text-[14px] text-[var(--starlight)]">
          {day.title ?? `Day ${day.day_number} overview`}
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden
          className="h-4 w-4 shrink-0 text-[var(--muted)] transition-transform group-open:rotate-180 motion-reduce:transition-none">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </summary>
      <div className={['pb-3', rewriting ? 'opacity-70' : ''].join(' ')}>
        {rewriting ? (
          <p role="status" data-testid="summary-rewriting" className="type-label mb-1 text-[12px] text-[var(--brass-bright)]">
            Updating this day&apos;s summary
          </p>
        ) : null}
        <DayOverview day={day} />
      </div>
    </details>
  )
}

/**
 * The phone trip view: map above, a stop sheet below, a floating top bar. Owns no state — every
 * selection, day, layer and sheet value belongs to TripWorkspace, which also keeps the map driver
 * and the agent tools mounted outside this branch.
 */
export default function MobileTripView(p: MobileTripViewProps) {
  return (
    <div className="paper-scope mobile-trip pointer-events-none absolute inset-0">
      <MobileTopBar
        title={tripTitle(p.bundle.trip)}
        dates={tripDateRange(p.bundle.trip)}
        readOnly={p.readOnly}
        showLayerToggle={p.hotels.length > 0}
        layerMode={p.layerMode}
        canUseHubLayer={p.canUseHubLayer}
        onLayerMode={p.onLayerMode}
      />
      <MobileTripSheet
        state={p.sheet}
        onToggleHeight={p.onToggleSheetHeight}
        onHide={p.onHideSheet}
        onReopen={p.onReopenSheet}
        header={<SheetHeader {...p} />}
      >
        {p.listView === 'stay' ? (
          <div className="flex flex-col gap-3">
            <TradeoffPanel tradeoffs={p.bundle.trip.tradeoffs} variant="comparisons" />
            <HotelPanel
              hotels={p.hotels}
              selectedHotelId={p.selectedHotelId}
              onSelectHotel={p.onSelectHotel}
              layerMode={p.layerMode}
            />
          </div>
        ) : (
          <>
            <StopTimeline
              bundle={p.bundle}
              places={p.dayPlaces}
              legs={p.dayLegs}
              restaurants={p.dayRestaurants}
              placeIndex={p.placeIndex}
              trailNumbers={p.trailNumbers}
              selectedPlaceId={p.selectedPlaceId}
              onSelectPlace={p.onSelectPlace}
              selectedRestaurantPlaceId={p.selectedRestaurantPlaceId}
              onSelectRestaurant={p.onSelectRestaurant}
            />
            {/* After the stops, not above them: the first screen of a compact sheet has room for
                the chips and two stops, and the day's prose is context, not the route. */}
            {p.activeDay ? <DayDisclosure day={p.activeDay} rewriting={p.summaryRewriting} /> : null}
          </>
        )}
        <AboutThisTrip bundle={p.bundle} readOnly={p.readOnly} />
      </MobileTripSheet>
    </div>
  )
}
