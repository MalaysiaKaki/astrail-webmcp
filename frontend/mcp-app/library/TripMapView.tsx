/**
 * The Trip Library's live-map trip view: the website's phone trip page as a VIEWER of one trip.
 *
 * A minimal mirror of TripWorkspace (components/trip/TripWorkspace.tsx): its viewer state
 * (105-133), derivations (207-232) and reveal / list / day handlers and view props (276-444).
 * Dropped: tabs, feedback, the WebMCP registry, generation, the desktop place cards and the URL.
 *
 * It composes MobileTripSheet + SheetHeading / DateStrip / TripPanelBody itself, never
 * MobileTripView or MobileMapControls: those render a Next <Link href="/app/trips">, which in the
 * sandboxed iframe would navigate the widget away. The control strip below is widget-local.
 *
 * The map is the library root's one shared MapProvider (useSharedMap via TripMap); this view only
 * drives it, so opening trip after trip reuses one Mapbox map.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import TripMap from '@/components/map/TripMap'
import MapControlStack from '@/components/map/MapControlStack'
import MobileTripSheet, { type SheetState } from '@/components/trip/mobile/MobileTripSheet'
import {
  DateStrip, SheetHeading, TripPanelBody, type MobileListView, type MobileTripViewProps,
} from '@/components/trip/mobile/MobileTripView'
import {
  buildPlaceIndex, buildTrailNumbers, findTripPlace, legsForDay, orderedDays, placesForDay,
  recommendedHotelId, restaurantsForDay, tripHotels,
} from '@/lib/trip/selectors'
import { fitLabel, fitTarget } from '@/lib/trip/fit-target'
import { planReveal } from '@/lib/trip/reveal'
import { useReportControls } from '@/lib/trip/control-obstruction'
import { tripDateRange, tripTitle } from '@/lib/trip/trip-presenters'
import { availableDayNumbers, initialDayNumber, type WidgetDayState } from '../src/day-view'
import type { WidgetData } from '../src/tool-result'

/* Above the sheet (z-10), below the host's top inset. `--safe-top` is the host's inset (the
   iframe's own env() reads 0); the website's equivalent is MobileMapControls' EDGE. */
const EDGE = 'absolute z-20 top-[max(12px,var(--safe-top,0px))]'

export default function TripMapView({ data, onBack, onDayChange }: {
  data: WidgetData
  onBack: () => void
  onDayChange: (state: WidgetDayState) => void
}) {
  const { bundle, truncated, saved_day_numbers: savedDays } = data
  const tripId = bundle.trip.id

  // TripWorkspace.tsx:105-133. A zero-day trip never reaches this view (it falls back to WidgetView).
  const [activeDayNumber, setActiveDayNumber] = useState(() => initialDayNumber({
    available: availableDayNumbers(bundle), focusDay: data.focusDay, tripId, restored: null,
  }) ?? 1)
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null)
  const [selectedHotelId, setSelectedHotelId] = useState<string | null>(() => recommendedHotelId(bundle))
  const [layerMode, setLayerMode] = useState<'route' | 'hub'>('route')
  const [expanded, setExpanded] = useState(false)
  const [panelOpen, setPanelOpen] = useState(true)
  const [selectedRestaurantPlaceId, setSelectedRestaurantPlaceId] = useState<string | null>(null)
  const [mobileList, setMobileList] = useState<MobileListView>('stops')
  const [focusNonce, setFocusNonce] = useState(0)
  const [fitNonce, setFitNonce] = useState(0)
  const [mode3d, setMode3d] = useState(false)
  const [show3dNonce, setShow3dNonce] = useState(0)
  const [revealRequest, setRevealRequest] = useState<{ placeId: string; nonce: number } | null>(null)

  /* Every day change — strip, pin or reveal — updates the model context. The library already
     pushed the opening day, so only a change is reported (a ref, not a first-run flag, so a
     Strict Mode re-run reports nothing and Day 1 -> 2 -> 1 reports both moves). */
  const reportedDay = useRef(activeDayNumber)
  useEffect(() => {
    if (reportedDay.current === activeDayNumber) return
    reportedDay.current = activeDayNumber
    onDayChange({ trip_id: tripId, day: activeDayNumber })
  }, [activeDayNumber, tripId, onDayChange])

  // TripWorkspace.tsx:207-232.
  const days = useMemo(() => orderedDays(bundle), [bundle])
  const placeIndex = useMemo(() => buildPlaceIndex(bundle), [bundle])
  const trailNumbers = useMemo(() => buildTrailNumbers(bundle), [bundle])
  const canUseHubLayer = useMemo(() => recommendedHotelId(bundle) !== null, [bundle])
  const hotels = useMemo(() => tripHotels(bundle), [bundle])
  const activeDay = days.find((d) => d.day_number === activeDayNumber) ?? null
  const dayPlaces = placesForDay(bundle, activeDayNumber)
  const dayLegs = activeDay ? legsForDay(bundle, activeDay.id) : []
  const dayRestaurants = activeDay ? restaurantsForDay(bundle, activeDay.id) : []
  const selectedTripPlace = findTripPlace(bundle, selectedPlaceId)

  /* TripWorkspace.tsx:276-294: a pin on another day opens that day; the scroll waits for the
     render (revealRequest). */
  const revealWith = (placeId: string) => {
    const plan = planReveal(bundle, placeId, { activeDayNumber, tab: 'trip', panelOpen, listView: mobileList })
    if (!plan) return
    if (placeId === selectedPlaceId) setFocusNonce((n) => n + 1)
    setActiveDayNumber(plan.activeDayNumber)
    setPanelOpen(plan.panelOpen)
    setMobileList(plan.listView)
    setSelectedPlaceId(plan.selectedPlaceId)
    setExpanded(false)
    setRevealRequest((r) => ({ placeId, nonce: (r?.nonce ?? 0) + 1 }))
  }

  const selectPlaceFromList = (placeId: string) => {
    if (placeId === selectedPlaceId) setFocusNonce((n) => n + 1)
    else setSelectedPlaceId(placeId)
  }

  const sheetState: SheetState = !panelOpen ? 'hidden' : expanded ? 'expanded' : 'compact'

  // TripWorkspace.tsx:392-444, phone only. A viewer: never readOnly (that is the Sample trail).
  const viewProps: MobileTripViewProps = {
    bundle,
    readOnly: false,
    days,
    activeDay,
    activeDayNumber,
    onSelectDay: (n) => { setActiveDayNumber(n); setMobileList('stops'); setLayerMode('route') },
    dayPlaces,
    dayLegs,
    dayRestaurants,
    placeIndex,
    trailNumbers,
    selectedPlaceId,
    selectedTripPlace,
    onSelectPlace: selectPlaceFromList,
    revealRequest,
    onRevealPlace: revealWith,
    tab: 'trip',
    onTab: () => {},
    selectedRestaurantPlaceId,
    onSelectRestaurant: setSelectedRestaurantPlaceId,
    hotels,
    selectedHotelId,
    onSelectHotel: setSelectedHotelId,
    layerMode,
    onLayerMode: setLayerMode,
    canUseHubLayer,
    listView: mobileList,
    onStay: () => { setMobileList('stay'); if (canUseHubLayer) setLayerMode('hub') },
    sheet: sheetState,
    fitTarget: fitTarget(bundle, activeDayNumber, layerMode, selectedHotelId),
    onFit: () => setFitNonce((n) => n + 1),
    mode3d,
    onToggle3d: () => setMode3d((v) => !v),
    onShow3d: (placeId) => {
      if (placeId !== selectedPlaceId) setSelectedPlaceId(placeId)
      setMode3d(true)
      setShow3dNonce((n) => n + 1)
    },
    showConfidence: false,
    onToggleSheetHeight: () => setExpanded((v) => !v),
    onHideSheet: () => setPanelOpen(false),
    onReopenSheet: () => { setExpanded(false); setPanelOpen(true) },
    summaryRewriting: false,
    feedback: null,
  }

  // ItineraryWidget's predicate and wording, so every bounded cut is said, not hidden.
  const partial = Object.values(truncated).some(Boolean)

  /* `data-library` (the 48px tap rule, the sheet's host-inset padding, the paper ground) sits on a
     NON-positioned wrapper: its paint stays below the fixed `.shared-map` (z-0), while the
     positioned overlay below paints above it. Putting the attribute on <main> would hide the map.
     The overlay is click-through so pans and pin taps reach the map (TripWorkspace.tsx:465-478). */
  return (
    <div data-library data-library-map>
      <main className="pointer-events-none relative h-[100dvh] w-full overflow-clip">
        <div className="pointer-events-none absolute inset-0">
          <TripMap
            bundle={bundle}
            activeDayNumber={activeDayNumber}
            selectedPlaceId={selectedPlaceId}
            selectedRestaurantPlaceId={selectedRestaurantPlaceId}
            onSelectRestaurant={setSelectedRestaurantPlaceId}
            onSelectPlace={revealWith}
            selectedHotelId={selectedHotelId}
            layerMode={layerMode}
            focusNonce={focusNonce}
            fitNonce={fitNonce}
            mode3d={mode3d}
            show3dNonce={show3dNonce}
          />
        </div>
        <div className="paper-scope mobile-trip pointer-events-none absolute inset-0">
          <ControlStrip
            onBack={onBack}
            sheetExpanded={sheetState === 'expanded'}
            fit={viewProps.fitTarget ? { label: fitLabel(viewProps.fitTarget), onFit: viewProps.onFit } : null}
            mode3d={mode3d}
            onToggle3d={viewProps.onToggle3d}
          />
          <MobileTripSheet
            state={sheetState}
            onToggleHeight={viewProps.onToggleSheetHeight}
            onHide={viewProps.onHideSheet}
            onReopen={viewProps.onReopenSheet}
            heading={<SheetHeading title={tripTitle(bundle.trip)} dates={tripDateRange(bundle.trip)} readOnly={false} />}
            header={<DateStrip {...viewProps} />}
          >
            {partial ? (
              <p role="note" className="type-body m-subcard mb-3 px-4 py-3 text-[14px] leading-snug text-[var(--m-text)]">
                Showing part of this trip ({days.length} of {Math.max(savedDays.length, days.length)} days).
                Open it in Astrail for everything.
              </p>
            ) : null}
            <TripPanelBody {...viewProps} />
          </MobileTripSheet>
        </div>
      </main>
    </div>
  )
}

/** The icon-only Back circle top-left and the Fit / 3D stack top-right, both measured for the camera padding. */
function ControlStrip({ onBack, sheetExpanded, fit, mode3d, onToggle3d }: {
  onBack: () => void
  sheetExpanded: boolean
  fit: { label: string; onFit: () => void } | null
  mode3d: boolean
  onToggle3d: () => void
}) {
  const backRef = useRef<HTMLButtonElement>(null)
  useReportControls(backRef, 'library-trip-back', [])
  return (
    <>
      <button ref={backRef} type="button" onClick={onBack} aria-label="Back to all trips" data-map-control
        style={{ width: 48, height: 48 }}
        className={`${EDGE} left-3 m-btn-icon pointer-events-auto focus-visible:outline-none focus-visible:shadow-[var(--m-focus)]`}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.1"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </button>
      <MapControlStack
        variant="phone"
        owner="library-trip-stack"
        className={`${EDGE} right-3`}
        onlyLeading={sheetExpanded}
        fit={fit}
        mode3d={mode3d}
        onToggle3d={onToggle3d}
      />
    </>
  )
}
