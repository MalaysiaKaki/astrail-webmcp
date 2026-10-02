/**
 * The Trip Library: a one-column list of trips (the website's TripRow card, one tap to open) and,
 * once a trip is opened, the shared itinerary view under a back bar. Mobile first; the entrypoints
 * are already fullscreen.
 */
import { WidgetView } from '../src/ItineraryWidget'
import type { WidgetDayState } from '../src/day-view'
import { ChevronRightIcon } from '@/components/dashboard/nav-icons'
import RouteGlyph from '@/components/trips/RouteGlyph'
import { META, TAG } from '@/lib/shell/ui'
import { statusDotClass, tripDateRange, tripStatusLabel } from '@/lib/trip/trip-presenters'
import type { LibraryState, TripSummary } from './state'

const PAGE = 'mx-auto max-w-[640px] px-4 pt-[calc(var(--safe-top,0px)+16px)] pb-[calc(var(--safe-bottom,0px)+16px)]'
// Card classes copied from components/trips/TripRow.tsx (that file imports next/link).
const CARD = 'overflow-hidden rounded-[var(--m-r-card)] bg-[color:var(--m-card)] shadow-[var(--m-shadow-1)]'
const ROW = 'flex min-h-12 w-full cursor-pointer items-center gap-3.5 p-3.5 text-left focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--m-accent)]'

function TripCard({ trip, onOpen }: { trip: TripSummary; onOpen: () => void }) {
  const title = trip.title ?? trip.destination ?? 'Untitled trip'
  return (
    <li className={CARD}>
      <button type="button" onClick={onOpen} aria-label={`Open ${title}`} className={ROW}>
        <span className="flex h-16 w-16 flex-none items-center justify-center rounded-[var(--m-r-sub)] bg-[color:var(--m-subcard)] [&_svg]:h-auto [&_svg]:w-[52px]">
          <RouteGlyph tripId={trip.trip_id} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="t-card-title truncate text-[color:var(--m-text)]">{title}</span>
          <span className={META}>{tripDateRange(trip)}</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={TAG}>
              <span aria-hidden className={statusDotClass(trip.status)} />
              {tripStatusLabel(trip.status)}
            </span>
            <span className={META}>{trip.day_count === 1 ? '1 day' : `${trip.day_count} days`}</span>
          </span>
        </span>
        <ChevronRightIcon className="m-chevron" />
      </button>
    </li>
  )
}

function List({ state, onOpenTrip }: { state: LibraryState; onOpenTrip: (tripId: string) => void }) {
  const { list, trips } = state
  return (
    <main data-library className={PAGE}>
      <h1 className="type-display mb-4 text-[length:var(--t-title)] leading-tight text-[color:var(--m-text)]">Your trips</h1>
      {list.kind === 'loading' ? (
        <div role="status" aria-label="Loading trips" className="flex flex-col gap-3 motion-safe:animate-pulse">
          <div className={`${CARD} h-24`} />
          <div className={`${CARD} h-24`} />
          <div className={`${CARD} h-24`} />
        </div>
      ) : list.kind === 'error' ? (
        <p role="alert" className={`${CARD} p-4 text-[color:var(--m-text)]`}>{list.message}</p>
      ) : trips.length === 0 ? (
        <p className={`${CARD} p-4 text-[color:var(--m-text)]`}>No trips yet</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {trips.map((t) => <TripCard key={t.trip_id} trip={t} onOpen={() => onOpenTrip(t.trip_id)} />)}
        </ul>
      )}
      {list.kind === 'ready' && state.hasMore ? (
        <p className={`${META} mt-4`}>Showing your 50 most recent trips. Ask ChatGPT about older ones.</p>
      ) : null}
    </main>
  )
}

export default function TripLibrary({ state, onOpenTrip, onBack, onDayChange }: {
  state: LibraryState
  onOpenTrip: (tripId: string) => void
  onBack: () => void
  onDayChange: (state: WidgetDayState) => void
}) {
  const { detail } = state
  if (!detail) return <List state={state} onOpenTrip={onOpenTrip} />
  return (
    <div data-library data-library-detail>
      <div className="sticky top-0 z-10 bg-[color:var(--m-page)] pt-[var(--safe-top,0px)]">
        <button type="button" onClick={onBack} aria-label="Back to all trips"
          className="flex min-h-12 min-w-12 cursor-pointer items-center px-4 focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--m-accent)] font-[family-name:var(--font-ui)] text-[length:var(--t-body)] font-semibold text-[color:var(--m-ink)]">
          <span aria-hidden>‹</span>&nbsp;All trips
        </button>
      </div>
      <WidgetView key={detail.seq} phase={detail.phase} restored={null} onDayChange={onDayChange} />
    </div>
  )
}
