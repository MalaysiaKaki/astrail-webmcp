'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import type { TripBundle } from '@/lib/trip/backend-types'
import { getTrip } from '@/lib/trip/supabase-api'
import TripTools from '@/components/webmcp/TripTools'
import {
  orderedDays, placesForDay, legsForDay, restaurantsForDay,
  tripHotels, buildPlaceIndex, buildTrailNumbers, findTripPlace, recommendedHotelId,
} from '@/lib/trip/selectors'
import { useSharedMap } from '@/components/map/MapProvider'
import { useOptionalGeneration } from '@/components/generation/GenerationProvider'
import { useOptionalWebMcpRegistry } from '@/components/webmcp/WebMcpRegistry'
import Astronaut from '@/components/mascot/Astronaut'
import TripFeedbackPanel from './TripFeedbackPanel'
import { useFeedbackComposer } from './use-feedback-composer'
import MobileTripView, { type MobileListView, type MobileTripViewProps } from './mobile/MobileTripView'
import FloatingTripPanel from './mobile/FloatingTripPanel'
import { HotelLayerButton } from './mobile/MobileMapControls'
import type { SheetState } from './mobile/MobileTripSheet'
import { useTripLayout } from '@/lib/trip/use-trip-layout'
import { fitLabel, fitTarget } from '@/lib/trip/fit-target'
import { PhoneFailed, PhoneGenerating, PhoneLoading, PhoneNotFound } from './mobile/PhoneStateScreens'
import MapControlStack from '@/components/map/MapControlStack'

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const TripMap = dynamic(() => import('@/components/map/TripMap'), { ssr: false })

/**
 * @param bundle    A trip supplied directly, instead of read from Supabase. `/app/trip/demo`
 *                  passes the Tokyo fixture so a judge can see a real 3D trail with no account,
 *                  no generation and nothing spent. Omit it and the fetch path below is unchanged.
 * @param readOnly  There is no database row behind a seeded bundle, so nothing that writes may be
 *                  offered against it — see the feedback composer below and the open-trip ref in
 *                  <TripTools/>. Also labels the page, so the agent does not attempt an edit.
 */
export default function TripWorkspace({
  tripId,
  bundle: seeded,
  readOnly = false,
}: {
  tripId: string
  bundle?: TripBundle
  readOnly?: boolean
}) {
  const { acquire, release, getMap } = useSharedMap()
  /**
   * Did the run the shell just finished produce THIS trip?
   *
   * Only used to decide what the loading frame says, and it is a backed claim, not optimism:
   * `complete` is set from a result frame whose verdict was success, and that same verdict is the
   * only one that navigates here at all. Matching the id matters — a finished run must not put
   * "your trip is ready" on some other trip the user opens next.
   *
   * Optional, because this component renders outside the /app shell too (nothing else in it needs
   * a generation), and null simply means there is no arrival to continue from.
   */
  const shellRun = useOptionalGeneration()?.run ?? null
  const arrivingFromGeneration = shellRun?.status === 'complete' && shellRun.tripId === tripId
  /*
   * Whether a summary rewrite is running right now.
   *
   * Every itinerary edit now starts one by itself (`startSummaryRewrite` in
   * `lib/webmcp/tools/edit.ts` -> `GlobalTools::runReplan`), and it takes ~30 s. For that whole
   * window the persisted day prose describes the trip BEFORE the edit — not wrong text, true text
   * about an itinerary that no longer exists. The activity rail was the only surface that said so,
   * which left a reader of THIS panel with no way to know the sentence under their eyes was about
   * to be replaced.
   *
   * Read off the rail's own entry rather than a second flag: `GlobalTools` deliberately keeps its
   * in-flight map in a ref ("nothing renders from it"), and a parallel signal would let the marker
   * and the rail disagree about the same rewrite. One fact, one source — and it clears on `failed`
   * exactly as on `done`, because a rewrite that died leaves the prose stale forever with nothing
   * coming to replace it, and "updating" would then be a standing lie.
   *
   * `subject` is what makes that reading safe, and matching on it is not defensive tidying — the
   * name and status alone were wrong in two separate ways. `RegisterTools` opens an entry BEFORE
   * `execute` runs, so an explicit `replan_trip` is `running` for the entire time its approval
   * card sits unanswered: the panel claimed this day's summary was being rewritten while nothing
   * was happening, and kept claiming it right up until the user DECLINED, which proves no rewrite
   * ever started. And with no target on the entry, a rewrite the agent ran for a DIFFERENT trip
   * dimmed and marked this one. Entries carrying a subject are written only by
   * `GlobalTools::runReplan`, at the moment the request actually goes out, and they name the trip
   * it is for — so one predicate answers both.
   *
   * Optional registry: this component renders outside the /app shell too, and null means no agent
   * can have started anything.
   */
  const summaryRewriting = (useOptionalWebMcpRegistry()?.activity ?? []).some(
    (e) => e.tool === 'replan_trip' && e.status === 'running' && e.subject === tripId,
  )
  const [bundle, setBundle] = useState<TripBundle | null>(seeded ?? null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'not_found'>(seeded ? 'ready' : 'loading')
  const [activeDayNumber, setActiveDayNumber] = useState(() => (seeded ? orderedDays(seeded)[0]?.day_number ?? 1 : 1))
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null)
  // Hotel-hub map (plan 2026-08-04-hotel-hub-map, T8) — ephemeral client state, no DB write.
  // Default selection = the route-central hotel (rank 1), which is `null` when NO hotel was
  // geocoded (honest-failure, C5); default layer = the existing itinerary route line.
  const [selectedHotelId, setSelectedHotelId] = useState<string | null>(() =>
    seeded ? recommendedHotelId(seeded) : null,
  )
  const [layerMode, setLayerMode] = useState<'route' | 'hub'>('route')
  const [expanded, setExpanded] = useState(false)
  const [panelOpen, setPanelOpen] = useState(true)
  // A "Where to eat" suggestion the user picked from the panel, so the map can show where it is.
  const [selectedRestaurantPlaceId, setSelectedRestaurantPlaceId] = useState<string | null>(null)
  /* Phone layout only. Which list the sheet shows — stops or Stay — is separate state from the map
     layer (route | hub): the Stay list renders even when no hotel has coordinates for a hub. */
  const [mobileList, setMobileList] = useState<MobileListView>('stops')
  // Bumped when the selected stop is tapped again, so the map re-frames the same place.
  const [focusNonce, setFocusNonce] = useState(0)
  // Bumped by the phone map's Fit control: a counter, so a second press after a manual pan is a
  // new request even though the target is the same (plan amendment 1).
  const [fitNonce, setFitNonce] = useState(0)
  /* The trip camera's 3D mode (plan A5, amendment 1): off by default, kept for as long as this trip
     page is open, and honoured by every camera command TripMap issues. One value for both layouts,
     so rotating across 768px keeps the map as tilted as it was. */
  const [mode3d, setMode3d] = useState(false)
  // Bumped by a stop card's "Show in 3D": fly to that stop at street level (the mode turns on too).
  const [show3dNonce, setShow3dNonce] = useState(0)
  /* Which panel tree to render. null during SSR and hydration: the desktop tree then renders
     behind `max-md:hidden`, so desktop paints its rail straight from the server HTML exactly as
     before, and a phone shows no desktop flash before the client snapshot picks the phone tree.
     Hooks stay above the early returns below. */
  const layout = useTripLayout()
  /* The feedback composer's draft, held HERE rather than in the panel: rotating across 768px
     swaps the phone tree for the desktop rail, each with its own composer, and a panel-owned
     draft (note, rating, an in-flight send) was lost in the swap. */
  const feedback = useFeedbackComposer(tripId)

  useEffect(() => {
    // A seeded bundle is already the answer, and there is nothing to read: the fixture has no
    // row. Returning before `setStatus('loading')` is what keeps the sample from flashing a
    // loading screen it would never leave.
    if (seeded) return
    let active = true
    setStatus('loading')
    getTrip(tripId).then((b) => {
      if (!active) return
      if (!b) { setStatus('not_found'); return }
      setBundle(b)
      setActiveDayNumber(orderedDays(b)[0]?.day_number ?? 1)
      setSelectedHotelId(recommendedHotelId(b))
      setStatus('ready')
    })
    return () => { active = false }
  }, [tripId, seeded])

  // Re-reads the trip INTO this page's state. Published to the WebMCP registry so an agent edit
  // becomes visible immediately; previously every change needed a manual page refresh.
  const refreshBundle = useCallback(async () => {
    // A seeded bundle IS the current state and `tripId` names no row, so re-reading would ask
    // Supabase for a trip that does not exist and answer null.
    if (seeded) return seeded
    const fresh = await getTrip(tripId)
    if (fresh) setBundle(fresh)
    return fresh
  }, [tripId, seeded])

  const days = useMemo(() => (bundle ? orderedDays(bundle) : []), [bundle])
  const placeIndex = useMemo(() => (bundle ? buildPlaceIndex(bundle) : new Map()), [bundle])
  // ONE numbering for the whole surface: the map paints these, `resolvePlaceRef` answers to
  // them, and the itinerary panel now labels its stops from the same map. The panel used to
  // count 01, 02 per day, so "move stop 1" on any day after the first moved a stop the user
  // was not looking at.
  const trailNumbers = useMemo(() => (bundle ? buildTrailNumbers(bundle) : new Map()), [bundle])
  // No hotel got a coordinate ⇒ the hub layer has nothing to draw, so the Hotel toggle is
  // disabled rather than flipping to a silently blank map (C5). Same signal that seeds the
  // default selection above, so "toggle enabled" and "a hub is selected" never disagree.
  const canUseHubLayer = useMemo(() => (bundle ? recommendedHotelId(bundle) !== null : false), [bundle])
  // Hotel search is OFF (2026-08-30): Travala's Travel MCP became "Travala Wallet MCP" and now
  // 401s every unauthenticated call, so `runner.HOTEL_SEARCH_ENABLED` is false and a trip
  // generated from now on has NO hotel rows. Everything hotel-shaped is hidden on that basis.
  //
  // Gated on the DATA, not on a build-time flag, and the difference is not cosmetic: trips
  // generated BEFORE the switch have real hotel rows in the database, and a flag would blank
  // them out — deleting visible user data from the UI to hide a feature they already have. This
  // way an old trip keeps its hotels and a new one simply never grows the surface.
  const hotels = useMemo(() => (bundle ? tripHotels(bundle) : []), [bundle])
  const hasHotels = hotels.length > 0
  const activeDay = days.find((d) => d.day_number === activeDayNumber) ?? null
  const dayPlaces = bundle ? placesForDay(bundle, activeDayNumber) : []
  const dayLegs = bundle && activeDay ? legsForDay(bundle, activeDay.id) : []
  const dayRestaurants = bundle && activeDay ? restaurantsForDay(bundle, activeDay.id) : []
  const selectedTripPlace = bundle ? findTripPlace(bundle, selectedPlaceId) : null

  // Hold the shell map on screen while the trip loads and while it is still generating.
  // The night->dawn relight fires as generation completes and lands in exactly these
  // states — a full-bleed takeover here would hide the signature moment behind a
  // loading screen. Inert, because there is nothing to explore until the bundle lands.
  const mapBehind = status === 'loading'
    || (bundle !== null && (bundle.trip.status === 'generating' || bundle.trip.status === 'draft'))

  useEffect(() => {
    if (!mapBehind) return
    acquire({ interactive: false, lightPreset: 'dawn' })
    return () => release()
  }, [mapBehind, acquire, release])

  /* Phones get the same states as kit cards (mobile/PhoneStateScreens); a null (SSR/hydration)
     layout keeps the desktop screens below, as the panel branch does. */
  const phone = layout === 'mobile'
  if (status === 'loading') {
    if (phone) return <PhoneLoading arriving={arrivingFromGeneration} />
    return (
      <main className="relative flex h-[100dvh] items-center justify-center p-6">
        {arrivingFromGeneration ? (
          /* The arrival, not a new page. The shell pushes here the instant the result frame
             lands, and everything that framed the wait screen — the narration rail, the sidebar —
             goes at once, so the bare pill below read to the first user who saw it as being
             dumped back on the home page before his trip appeared. This carries the rail's last
             words and its astronaut across the handoff; the dawn map behind it never moved. The
             dot is live because the page genuinely is still working: the trip is ready, the read
             is not. Confined to this branch, so it cannot outlive the open outcome — a read that
             answers not-found or failed falls through to those screens below. */
          <div data-testid="trip-arrival" className="surface flex items-center gap-3 px-5 py-4">
            <Astronaut size={40} variant="idle" />
            <div>
              <p className="type-display text-[15px] text-[var(--starlight)]">Your trip is ready</p>
              <p className="type-label flex items-center gap-2 text-xs uppercase tracking-wide text-[var(--muted)]">
                <span aria-hidden className="pulse-dot pulse-dot--live" />
                Opening your map…
              </p>
            </div>
          </div>
        ) : (
          <p className="surface type-label px-4 py-2.5 text-xs uppercase tracking-wide text-[var(--muted)]">Loading trip…</p>
        )}
      </main>
    )
  }
  if (status === 'not_found' || !bundle) {
    if (phone) return <PhoneNotFound />
    return (
      <main className="flex h-[100dvh] items-center justify-center bg-[var(--void)]">
        <p className="type-body text-sm text-[var(--muted)]">Trip not found.</p>
      </main>
    )
  }
  if (bundle.trip.status === 'failed' && phone) {
    // Same gate as below: a seeded bundle has no trip row for feedback to reference.
    return (
      <PhoneFailed
        feedback={readOnly ? null : (
          <>
            <p className="type-body mb-3 text-[15px] text-[var(--m-text-muted)]">
              Tell us what went wrong — it&apos;s the most useful feedback we get.
            </p>
            <TripFeedbackPanel key={bundle.trip.id} tripId={bundle.trip.id} composer={feedback} variant="phone" />
          </>
        )}
      />
    )
  }
  if (bundle.trip.status === 'failed') {
    // Failed trips are where feedback is the most valuable beta signal (HANDOFF.md — "don't hide
    // the UI on failures"), so the composer mounts here too. min-h + overflow-y-auto (not a rigid
    // h-[100dvh] + justify-center) so the composer never clips on short/mobile viewports with the
    // keyboard open; the screen stays centered when the content fits. Night tokens from :root are
    // correct here — do NOT wrap in paper-scope.
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 overflow-y-auto bg-[var(--void)] p-6">
        <p className="type-display text-xl text-[var(--starlight)]">Generation failed</p>
        <p className="type-body max-w-md text-center text-sm text-[var(--muted)]">
          Astrail couldn&apos;t build this trip. Start a new one — repeat Reels are cached, so retrying is fast.
        </p>
        <a href="/app" className="type-label text-xs uppercase tracking-wide text-[var(--brass-bright)] underline-offset-2 hover:underline max-md:inline-flex max-md:min-h-11 max-md:items-center max-md:px-3">
          Plan a new trip
        </a>
        {/* Same gate as the composer in the main return: a seeded bundle has no trip row for
            feedback to reference, so the invitation goes with it rather than standing alone. */}
        {!readOnly && (
          <>
            <p className="type-body max-w-md text-center text-sm text-[var(--muted)]">
              Tell us what went wrong — it&apos;s the most useful feedback we get.
            </p>
            <div className="w-full max-w-md">
              <TripFeedbackPanel key={bundle.trip.id} tripId={bundle.trip.id} composer={feedback} />
            </div>
          </>
        )}
      </main>
    )
  }
  if (bundle.trip.status === 'generating' || bundle.trip.status === 'draft') {
    if (phone) return <PhoneGenerating />
    return (
      <main className="relative flex h-[100dvh] flex-col items-center justify-center p-6">
        <div className="surface flex flex-col items-center gap-3 px-5 py-4">
          <p className="type-label text-xs uppercase tracking-wide text-[var(--muted)]">
            Still generating — refresh in a moment.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="type-label text-xs uppercase tracking-wide text-[var(--brass-bright)] underline-offset-2 hover:underline max-md:min-h-11 max-md:px-3"
          >
            Refresh
          </button>
        </div>
      </main>
    )
  }

  /* The map shows every day's pins, but the itinerary list below shows only the ACTIVE day —
     so selecting a Day 3 pin while Day 1 is open used to open the panel on a list that does not
     contain it: no card to highlight, and nothing to scroll to. Activating the place's own day
     is the parent's job, since the day is the parent's state. Both setters run in one handler,
     so the list and the selection arrive on the same render. An undayed stop (the base hotel)
     leaves the day alone — there is no day to switch to. */
  function selectPlaceFromMap(placeId: string) {
    // Optional chain only to satisfy TS: a hoisted function declaration is not narrowed by the
    // early return above, though at runtime bundle is non-null by the time this can be called.
    const day = bundle?.places.find((tp) => tp.place_id === placeId)?.day_number
    if (typeof day === 'number') setActiveDayNumber(day)
    setSelectedPlaceId(placeId)
    setPanelOpen(true)
    // The pin stays in view: select, show its card in the stop list, keep the phone sheet compact.
    setMobileList('stops')
    setExpanded(false)
  }

  function selectPlaceFromList(placeId: string) {
    if (placeId === selectedPlaceId) setFocusNonce((n) => n + 1)
    else setSelectedPlaceId(placeId)
  }

  const sheetState: SheetState = !panelOpen ? 'hidden' : expanded ? 'expanded' : 'compact'

  // One set of props for both layouts: the phone sheet and the desktop panel render the same
  // content model, so they can only differ in their container.
  const viewProps: MobileTripViewProps = {
    bundle,
    readOnly,
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
    onSelectPlace: selectPlaceFromList,
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
    showConfidence: layout !== 'mobile',
    onToggleSheetHeight: () => setExpanded((v) => !v),
    onHideSheet: () => setPanelOpen(false),
    onReopenSheet: () => { setExpanded(false); setPanelOpen(true) },
    summaryRewriting,
    feedback,
  }

  return (
    <>
      {/* Map-driving tools live only where a map exists. key={tripId} guarantees trip A's
          registrations unmount before trip B's mount, so two same-named tools never overlap. */}
      <TripTools
        key={tripId}
        bundle={bundle}
        showDay={(n) => { setActiveDayNumber(n); setMobileList('stops') }}
        selectPlace={setSelectedPlaceId}
        setLayerMode={setLayerMode}
        openPanel={() => setPanelOpen(true)}
        refresh={refreshBundle}
        readOnly={readOnly}
      />
    {/* The interactive Mapbox canvas is a FIXED layer behind this route (MapProvider's
        `.shared-map`). This overlay must be click-through, or it swallows every pan/zoom/
        pin-tap before the map beneath ever sees it. Interactive children re-enable
        pointer events explicitly (the panel + its buttons below).

        A BRACED comment, not bare `//`. Inside JSX a `//` line is not a comment — it is a text child,
        so these four lines RENDERED, took 48px of flow, and pushed <main> (which is 100dvh
        tall) that far down the page. The visible symptom was a strip of map above the details
        panel and 48px of the panel hanging below the fold. Invisible as text only because it
        is dark-on-dark. */}
    {/* overflow-CLIP, not hidden: hidden is still a script-scroll container, so a stop card's
        scrollIntoView({block:'start'}) scrolled THIS element too and slid the phone sheet up over
        the map. clip clips identically and leaves the scroll to the sheet's own list. */}
    <main className="pointer-events-none relative h-[100dvh] w-full overflow-clip">
      <div className="pointer-events-none absolute inset-0">
        <TripMap
          bundle={bundle}
          activeDayNumber={activeDayNumber}
          selectedPlaceId={selectedPlaceId}
          selectedRestaurantPlaceId={selectedRestaurantPlaceId}
          onSelectRestaurant={setSelectedRestaurantPlaceId}
          onSelectPlace={(id) => selectPlaceFromMap(id)}
          selectedHotelId={selectedHotelId}
          layerMode={layerMode}
          focusNonce={focusNonce}
          fitNonce={fitNonce}
          mode3d={mode3d}
          show3dNonce={show3dNonce}
        />
      </div>

      {layout === 'mobile' ? (
        <MobileTripView {...viewProps} />
      ) : (
        /* Desktop (plan A6): the SAME content model in a floating kit panel on the left, plus the
           kit control stack on the right. A null layout (SSR, hydration) renders it behind
           `max-md:hidden`, so desktop paints straight from the server HTML and a phone shows no
           desktop flash before the client snapshot picks its tree. */
        <div className={layout === null ? 'max-md:hidden' : undefined}>
          <FloatingTripPanel
            {...viewProps}
            open={panelOpen}
            onClose={() => setPanelOpen(false)}
            onOpen={() => setPanelOpen(true)}
          />
          <MapControlStack
            variant="desktop"
            owner="trip-stack-desktop"
            className="paper-scope pointer-events-none absolute right-4 top-4 z-20"
            mode3d={mode3d}
            onToggle3d={() => setMode3d((v) => !v)}
            onZoomIn={() => getMap()?.zoomIn({ duration: prefersReducedMotion() ? 0 : 300 })}
            onZoomOut={() => getMap()?.zoomOut({ duration: prefersReducedMotion() ? 0 : 300 })}
            fit={viewProps.fitTarget ? { label: fitLabel(viewProps.fitTarget), onFit: viewProps.onFit } : null}
            trailing={hasHotels ? (
              <HotelLayerButton
                hub={layerMode === 'hub'}
                canUseHubLayer={canUseHubLayer}
                onToggle={() => setLayerMode(layerMode === 'hub' ? 'route' : 'hub')}
              />
            ) : null}
          />
        </div>
      )}
    </main>
    </>
  )
}
