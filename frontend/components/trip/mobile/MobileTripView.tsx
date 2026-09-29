'use client'

import type {
  HotelSuggestion, Place, RestaurantSuggestion, TransportLeg, TripBundle, TripDay, TripPlace,
} from '@/lib/trip/backend-types'
import { tripDateRange, tripTitle } from '@/lib/trip/trip-presenters'
import DayOverview from '../DayOverview'
import HotelPanel from '../HotelPanel'
import TradeoffPanel from '../TradeoffPanel'
import MobileMapControls from './MobileMapControls'
import MobileTripSheet, { type SheetState } from './MobileTripSheet'
import StopTimeline from './StopTimeline'
import type { FeedbackComposer } from '../use-feedback-composer'
import AboutThisTrip from './AboutThisTrip'
import SelectedPlaceCard from './SelectedPlaceCard'
import { useRevealScroll } from './use-reveal-scroll'
import DayHeaderCard from '../panel/DayHeaderCard'
import { dayLabel } from '@/lib/trip/day-labels'
import type { FitTarget } from '@/lib/trip/fit-target'
import type { RevealPlace, TripTab } from '@/lib/trip/reveal'

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
  /** The selected stop's row, or null. Shown as a pinned "Selected place" card when it is not on
   *  the active day's list (an undayed base hotel): fix 1. */
  selectedTripPlace: TripPlace | null
  onSelectPlace: (placeId: string) => void
  /** The last reveal (map pin, show_on_map, Picked for you) to bring into view after mount. */
  revealRequest: { placeId: string; nonce: number } | null
  /** lib/trip/reveal's frozen contract, for surfaces outside the list (For you). */
  onRevealPlace: RevealPlace
  /** The panel tab (desktop); the phone sheet shows the Trip content. */
  tab: TripTab
  onTab: (tab: TripTab) => void
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
  /** What the map's Fit control frames (null hides it), and the press that asks for it. */
  fitTarget: FitTarget | null
  onFit: () => void
  /** The trip camera's 3D mode, owned by TripWorkspace. */
  mode3d: boolean
  onToggle3d: () => void
  /** A stop card's "Show in 3D": turn the mode on and fly to street level at that stop. */
  onShow3d?: (placeId: string) => void
  /** Desktop only: the confidence chip in the selected stop's detail. */
  showConfidence?: boolean
  onToggleSheetHeight: () => void
  onHideSheet: () => void
  onReopenSheet: () => void
  summaryRewriting: boolean
  /** Owned by TripWorkspace so a draft survives the phone/desktop switch. */
  feedback: FeedbackComposer
}

/** The sheet's title block: serif trip name, then the date range and the Sample tag. */
export function SheetHeading({ title, dates, readOnly }: { title: string; dates: string; readOnly: boolean }) {
  return (
    <div data-testid="sheet-heading" className="min-w-0">
      <h2 className="type-display truncate text-[22px] leading-[1.2] text-[var(--m-text)] [@media(max-height:700px)]:text-[20px]">{title}</h2>
      <p className="type-body mt-0.5 flex items-center gap-2 text-[14px] leading-5 text-[var(--m-text-muted)]">
        {dates ? <span className="truncate tabular-nums">{dates}</span> : null}
        {/* Said in the page, not only in the tool layer, so an agent reading it knows before it
            tries that nothing here writes. Short on screen; the full sentence is for AT. */}
        {readOnly ? (
          // White, not the brass wash: brass on the wash over the frosted sheet measured 4.37:1 (fails
          // AA for 12px); on white it is 5.56:1. The hairline ring keeps it reading as a tag.
          <span className="shrink-0 rounded-full bg-[var(--m-card)] px-2 text-[12px] font-semibold leading-5 text-[var(--m-accent)] shadow-[inset_0_0_0_1px_rgba(138,96,35,0.28)]">
            Sample<span className="sr-only"> trail — read-only</span>
          </span>
        ) : null}
      </p>
    </div>
  )
}

/* One strip cell. A date is the one place the page speaks in its display serif at size, so the
   strip reads as a calendar at a glance; the selected day is a filled square in the brass wash
   with ink text, the rest recede to muted. Short screens (≤700px tall) shrink the cells so the
   first stop card still fits in the compact sheet (plan amendment 5). */
const CELL = [
  'flex w-[52px] shrink-0 flex-col items-center justify-center gap-1 rounded-2xl h-[60px] [@media(max-height:700px)]:h-11',
  'transition-[transform,background-color] duration-[var(--m-dur-press)] active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100',
  'focus-visible:outline-none focus-visible:shadow-[var(--m-focus)]',
].join(' ')

function StripCell({ current, onClick, label, big, small }: {
  current: boolean
  onClick: () => void
  label: string
  big: React.ReactNode
  small: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-current={current ? 'true' : undefined}
      className={[CELL, current ? 'bg-[var(--m-accent-wash)] text-[var(--m-text)]' : 'text-[var(--m-text-muted)]'].join(' ')}
    >
      <span aria-hidden className="type-display text-[22px] leading-none [@media(max-height:700px)]:text-[19px]">{big}</span>
      <span aria-hidden className="type-body text-[14px] leading-none font-medium [font-variant-caps:all-small-caps]">{small}</span>
    </button>
  )
}

/* A strip tap opens that day at the top of its list. Done in the handler, not an effect on the
   day: a pin tap also changes the day, and StopTimeline's scroll-to-the-selected-stop runs first
   (child effects before parent), so an effect here would scroll the pin's stop straight back out. */
function toListTop() {
  // The list's scroller: the phone sheet body or the desktop panel body (one is mounted at a time).
  const body = document.querySelector<HTMLElement>('[data-trip-scroll]')
  if (body) body.scrollTop = 0
}

export function DateStrip(p: MobileTripViewProps) {
  return (
    <div role="group" aria-label="Trip days" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [@media(max-height:700px)]:pb-1">
      {p.days.map((d) => {
        const label = dayLabel(d)
        return (
          <StripCell
            key={d.id}
            current={p.listView === 'stops' && d.day_number === p.activeDayNumber}
            onClick={() => { p.onSelectDay(d.day_number); toListTop() }}
            label={label.name}
            big={label.big}
            small={label.small}
          />
        )
      })}
      {p.hotels.length > 0 ? (
        <StripCell
          current={p.listView === 'stay'}
          onClick={() => { p.onStay(); toListTop() }}
          label="Stay"
          small="stay"
          big={(
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
              strokeLinecap="round" strokeLinejoin="round" className="h-[22px] w-[22px]">
              <path d="M3 18V7M3 14h18v4M21 14v-2.5A2.5 2.5 0 0 0 18.5 9H11v5" />
              <circle cx="7" cy="11" r="1.8" />
            </svg>
          )}
        />
      ) : null}
    </div>
  )
}

/** The small "Day 1" capsule beside the date. Not a control: no shadow, no chevron. */
function Capsule({ children }: { children: React.ReactNode }) {
  return (
    <span className="type-body shrink-0 rounded-full bg-[var(--m-subcard)] px-2.5 text-[14px] font-medium leading-7 text-[var(--m-text)]">
      {children}
    </span>
  )
}

/* Scrolls with the list rather than pinning: at 360x640 a pinned sub-header left no room for a
   whole first stop card in the compact sheet. At the top of the list it reads as the heading of
   the day; scrolled, the strip above still says which day this is. */
function DaySubHeader({ day }: { day: TripDay }) {
  const label = dayLabel(day)
  return (
    <div className="flex min-w-0 items-center gap-2 pb-2 pt-1">
      <h3 className="type-display shrink-0 text-[20px] leading-tight text-[var(--m-text)]">
        {label.monthDay ?? `Day ${day.day_number}`}
      </h3>
      {label.monthDay ? <Capsule>Day {day.day_number}</Capsule> : null}
      {day.title ? (
        <span className="type-body min-w-0 truncate text-[15px] text-[var(--m-text-muted)]">{day.title}</span>
      ) : null}
    </div>
  )
}

function StaySubHeader({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-2 pb-2 pt-1">
      <h3 className="type-display text-[20px] leading-tight text-[var(--m-text)]">Where to stay</h3>
      <Capsule>{count} {count === 1 ? 'hotel' : 'hotels'}</Capsule>
    </div>
  )
}

function DayDisclosure({ day, rewriting }: { day: TripDay; rewriting: boolean }) {
  if (!rewriting && !day.summary && !day.weather_summary) return null
  return (
    <details className="group mt-4">
      <summary className="m-card-link list-none [&::-webkit-details-marker]:hidden">
        <span className="type-body min-w-0 truncate text-[15px] font-medium text-[var(--m-text)]">
          Day {day.day_number} overview
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden
          className="m-chevron transition-transform group-open:rotate-180 motion-reduce:transition-none">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </summary>
      <div className={['px-1 pb-1 pt-3', rewriting ? 'opacity-70' : ''].join(' ')}>
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
 * What the list shows under the date strip — the day's stops or the Stay view, then About this
 * trip. Shared by the phone sheet and the desktop floating panel (FloatingTripPanel), so the two
 * widths render one content model.
 */
export function TripPanelBody(p: MobileTripViewProps & {
  /** 'card' (desktop Trip tab): the day header card with its weather. 'sub' (phone): the
   *  compact sub-header, unchanged. */
  dayHeader?: 'sub' | 'card'
}) {
  useRevealScroll(p.revealRequest)
  return (
    <>
      {p.listView === 'stay' ? (
        <div className="flex flex-col gap-3">
          <StaySubHeader count={p.hotels.length} />
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
          {/* Only a place with NO day: it has no list to open. A dayed stop selected before a
              strip switch is not pinned above another day's stops. */}
          {p.selectedTripPlace && p.selectedTripPlace.day_number === null ? (
            <SelectedPlaceCard
              bundle={p.bundle}
              tp={p.selectedTripPlace}
              trailNumbers={p.trailNumbers}
              placeIndex={p.placeIndex}
              onSelectPlace={p.onSelectPlace}
              onShow3d={p.onShow3d}
              showConfidence={p.showConfidence}
              selectedRestaurantPlaceId={p.selectedRestaurantPlaceId}
              onSelectRestaurant={p.onSelectRestaurant}
            />
          ) : null}
          {p.activeDay ? (p.dayHeader === 'card' ? <DayHeaderCard day={p.activeDay} /> : <DaySubHeader day={p.activeDay} />) : null}
          <StopTimeline
            bundle={p.bundle}
            onShow3d={p.onShow3d}
            showConfidence={p.showConfidence}
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
          {/* After the stops, not above them: the first screen of a compact sheet is for the
              route; the day's prose is context. */}
          {p.activeDay ? <DayDisclosure day={p.activeDay} rewriting={p.summaryRewriting} /> : null}
        </>
      )}
      <AboutThisTrip bundle={p.bundle} readOnly={p.readOnly} feedback={p.feedback} />
    </>
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
      <MobileMapControls
        sheetExpanded={p.sheet === 'expanded'}
        fitTarget={p.fitTarget}
        onFit={p.onFit}
        showLayerToggle={p.hotels.length > 0}
        layerMode={p.layerMode}
        canUseHubLayer={p.canUseHubLayer}
        onToggleLayer={() => p.onLayerMode(p.layerMode === 'hub' ? 'route' : 'hub')}
        mode3d={p.mode3d}
        onToggle3d={p.onToggle3d}
      />
      <MobileTripSheet
        state={p.sheet}
        onToggleHeight={p.onToggleSheetHeight}
        onHide={p.onHideSheet}
        onReopen={p.onReopenSheet}
        heading={<SheetHeading title={tripTitle(p.bundle.trip)} dates={tripDateRange(p.bundle.trip)} readOnly={p.readOnly} />}
        header={<DateStrip {...p} />}
      >
        <TripPanelBody {...p} />
      </MobileTripSheet>
    </div>
  )
}
