'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
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
import MapDayChip from '@/components/map/MapDayChip'
import { planReveal, type RevealPlace } from '@/lib/trip/reveal'
import { useTripTab } from '@/lib/trip/use-trip-tab'
import TripTabUrl from './TripTabUrl'
import { useOpenCard } from './use-open-card'
import { openCardEntity, type CardOpener, type OpenCard } from '@/lib/trip/place-card'
import StopPlaceCard from './card/StopPlaceCard'
import { EatPlaceCard, HotelPlaceCard } from './card/SuggestionPlaceCards'

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
  const { acquire, release, getMap, hasToken } = useSharedMap()
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
  const registry = useOptionalWebMcpRegistry()
  const summaryRewriting = (registry?.activity ?? []).some(
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
  /* The panel's tab (Trip · For you · How it was built): per trip, per session, `?tab=` wins on
     load. Owned here, above both layouts, so rotating keeps it; the map and TripTools sit outside
     every tab-dependent mount, so a tab change never remounts the map or interrupts the camera. */
  const { tab, setTab, applyUrl } = useTripTab(tripId)
  /* A reveal to bring into view once the Trip tab's list has mounted: a counter, so revealing the
     same place again (a second pin click) scrolls again even though nothing else changed. */
  const [revealRequest, setRevealRequest] = useState<{ placeId: string; nonce: number } | null>(null)
  /* The desktop place card (A10): one open card, separate from selection, and where its detail
     is shown (at the pin, or in the sidebar). */
  const cards = useOpenCard()
  const { openCard, close: closeCard } = cards
  // Crossing to the phone with focus in the place card: the card unmounts, so focus follows the
  // selection to the phone sheet's card for the same stop (Codex review §4), never to <body>.
  const cardFocusRef = useRef(false)
  /* Whether the map can present a card at all (Codex final #2): TripMap reports false until the
     shared map has loaded, and for good if it never does (a rejected style, no WebGL). */
  const [mapAvailable, setMapAvailable] = useState(true)
  useEffect(() => {
    const track = () => { cardFocusRef.current = Boolean(document.activeElement?.closest?.('[data-place-card]')) }
    document.addEventListener('focusin', track)
    return () => document.removeEventListener('focusin', track)
  }, [])
  useEffect(() => {
    if (layout !== 'mobile' || !cardFocusRef.current || openCard?.kind !== 'stop') return
    cardFocusRef.current = false
    cards.focusAfterCommit([`[data-trip-scroll] [data-place-id="${CSS.escape(openCard.id)}"]`])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout])
  // An edit that removed the open card's place closes it: content is read from the latest bundle.
  useEffect(() => {
    if (!bundle || !openCard) return
    const gone = openCard.kind === 'stop' ? !findTripPlace(bundle, openCard.id) : !openCardEntity(bundle, openCard)
    if (gone) closeCard()
  }, [bundle, openCard, closeCard])

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

  /* The non-trip states — loading, not found, failed, still generating — are kit cards at every
     width (mobile/PhoneStateScreens; plan A8 retired the night desktop screens). One set of words
     and gates, so no layout branch is needed and SSR renders the final screen directly. */
  if (status === 'loading') return <PhoneLoading arriving={arrivingFromGeneration} />
  if (status === 'not_found' || !bundle) return <PhoneNotFound />
  if (bundle.trip.status === 'failed') {
    // Failed trips are where feedback is the most valuable beta signal (HANDOFF.md — "don't hide
    // the UI on failures"), so the composer mounts here too. A seeded bundle has no trip row for
    // feedback to reference, so the invitation goes with the composer rather than standing alone.
    return (
      <PhoneFailed
        feedback={readOnly ? null : (
          <>
            <p className="type-body mb-3 text-[15px] text-[var(--m-text-muted)]">
              Tell us what went wrong — it&apos;s the most useful feedback we get.
            </p>
            <TripFeedbackPanel key={bundle.trip.id} tripId={bundle.trip.id} composer={feedback} />
          </>
        )}
      />
    )
  }
  if (bundle.trip.status === 'generating' || bundle.trip.status === 'draft') return <PhoneGenerating />

  /* The frozen reveal contract (lib/trip/reveal, amendment 5), used by map pins, show_on_map and
     For you's "Picked for you" links. The map shows every day's pins but the list shows one day,
     so a Day 3 pin must open Day 3; an undayed stop (the base hotel) keeps the day and is pinned
     above the list. Every setter runs in one handler, so the tab, the day, the list and the
     selection arrive on the same render; the scroll waits for that render (revealRequest). */
  const revealWith = (placeId: string, opener: CardOpener) => {
    if (!bundle) return
    const plan = planReveal(bundle, placeId, { activeDayNumber, tab, panelOpen, listView: mobileList })
    if (!plan) return
    // Desktop shows the detail as the place card (at the pin, or in the sidebar when it cannot);
    // the phone's sheet card is the detail there, and a rotation carries the open card across.
    cards.open('stop', placeId, opener)
    // The same stop again (show_on_map after a pan, a second pin click): the flight is asked for
    // again too, not only the card (Codex final #8). The trip target never comes through here.
    if (placeId === selectedPlaceId) setFocusNonce((n) => n + 1)
    setActiveDayNumber(plan.activeDayNumber)
    if (plan.tab !== tab) setTab(plan.tab)
    setPanelOpen(plan.panelOpen)
    setMobileList(plan.listView)
    setSelectedPlaceId(plan.selectedPlaceId)
    // The pin stays in view: the phone sheet opens compact, not expanded over the map.
    setExpanded(false)
    setRevealRequest((r) => ({ placeId, nonce: (r?.nonce ?? 0) + 1 }))
  }
  const revealPlace: RevealPlace = (placeId) => revealWith(placeId, 'other')

  function selectPlaceFromList(placeId: string) {
    if (placeId === selectedPlaceId) setFocusNonce((n) => n + 1)
    else setSelectedPlaceId(placeId)
    cards.open('stop', placeId, 'row')
  }

  /* A suggestion to eat or a hotel as its place card; the eat one also stays selected in the
     list, so the map and the sidebar agree on which suggestion is current. */
  const openEat = (placeId: string, opener: CardOpener) => {
    setSelectedRestaurantPlaceId(placeId)
    cards.open('eat', placeId, opener)
  }

  /* The map card's links into the Trip tab: that day, its overview or its places to eat. */
  function showInPanel(target: 'overview' | 'eats', day: number) {
    setPanelOpen(true)
    if (tab !== 'trip') setTab('trip')
    setMobileList('stops')
    setLayerMode('route')
    setActiveDayNumber(day)
    cards.requestPanel(target, day)
  }

  /* A detail that cannot stay at its pin moves to the sidebar, and the sidebar is made to show it:
     the panel reopened, the Trip tab, the stop's day or the eat's day, or the Stay view for a hotel
     (Codex final #3, #4, #7). Focus follows it unless an approval or a text field holds focus. */
  function revealDetail(card: OpenCard, withFocus: boolean) {
    setPanelOpen(true)
    if (tab !== 'trip') setTab('trip')
    if (card.kind === 'hotel') {
      setMobileList('stay')
    } else {
      setMobileList('stops')
      const day = card.kind === 'stop'
        ? findTripPlace(bundle!, card.id)?.day_number
        : days.find((d) => d.id === bundle!.restaurants.find((r) => r.restaurant_place_id === card.id)?.trip_day_id)?.day_number
      if (typeof day === 'number') setActiveDayNumber(day)
    }
    const active = document.activeElement
    const typing = !!active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')
    if (!withFocus || registry?.pending || typing) return
    cards.focusAfterCommit(card.kind === 'stop'
      ? [`[data-trip-scroll] [data-place-id="${CSS.escape(card.id)}"]`]
      : ['[data-trip-scroll] [data-sidebar-detail]'])
  }
  const onCardFallback = (nonce: number) => {
    cards.fallBack(nonce)
    // Focus follows unless the user is on the map itself (panning it away with the keyboard).
    const onMap = !!document.activeElement?.closest?.('.mapboxgl-canvas-container')
    if (openCard && openCard.nonce === nonce) revealDetail(openCard, !onMap)
  }

  /* Where the open stop's detail is shown on desktop: at its pin, unless the map is unavailable,
     the place has no location, nothing fits at the pin (the map said so for THIS request), or the
     user asked for the sidebar. The phone never uses this: its sheet card is the detail. */
  const cardEntity = openCard ? openCardEntity(bundle, openCard) : null
  const openStop = openCard?.kind === 'stop' ? findTripPlace(bundle, openCard.id) : null
  const detailPlaceId = layout !== 'mobile' && openCard && openStop
    && (cards.detailsHere || !hasToken || !mapAvailable || !cardEntity || cards.fallbackNonce === openCard.nonce)
    ? openStop.place_id : null
  // The same for an eat or a hotel card (Codex final #3): its WHOLE detail, inline in the sidebar.
  const suggestionInSidebar = layout !== 'mobile' && !!openCard && openCard.kind !== 'stop' && !!cardEntity
    && (!hasToken || !mapAvailable || cards.fallbackNonce === openCard.nonce)
  const sidebarDetail = !suggestionInSidebar || !openCard ? null
    : openCard.kind === 'eat' ? (
      <EatPlaceCard inline bundle={bundle} placeId={openCard.id} onClose={() => closeCard()}
        onOpenStop={(id) => revealWith(id, 'other')} />
    ) : <HotelPlaceCard inline bundle={bundle} hotelId={openCard.id} onClose={() => closeCard()} />
  const mapCardNode = layout !== 'desktop' || !openCard || !cardEntity || detailPlaceId || suggestionInSidebar ? null
    : openCard.kind === 'stop' ? (
      <StopPlaceCard
        bundle={bundle}
        placeId={openCard.id}
        onClose={(reason) => closeCard(reason)}
        onNavigate={(id) => revealWith(id, openCard.opener ?? 'other')}
        onShow3d={() => { setMode3d(true); setShow3dNonce((n) => n + 1) }}
        onSelectEat={(id) => openEat(id, 'other')}
        onSeeAllEats={(day) => showInPanel('eats', day)}
        onDayOverview={(day) => showInPanel('overview', day)}
        onDetailsHere={() => {
          cards.setDetailsHere(true)
          revealDetail(openCard, true)
        }}
      />
    ) : openCard.kind === 'eat' ? (
      <EatPlaceCard bundle={bundle} placeId={openCard.id} onClose={(reason) => closeCard(reason)}
        onOpenStop={(id) => revealWith(id, 'other')} />
    ) : (
      <HotelPlaceCard bundle={bundle} hotelId={openCard.id} onClose={(reason) => closeCard(reason)} />
    )

  const sheetState: SheetState = !panelOpen ? 'hidden' : expanded ? 'expanded' : 'compact'

  // One set of props for both layouts: the phone sheet and the desktop panel render the same
  // content model, so they can only differ in their container.
  const viewProps: MobileTripViewProps = {
    bundle,
    readOnly,
    days,
    activeDay,
    activeDayNumber,
    // Choosing a day is navigation away from the open card: it closes (a prev/next that crosses
    // into another day goes through revealWith, not here, so its card stays).
    onSelectDay: (n) => { setActiveDayNumber(n); setMobileList('stops'); setLayerMode('route'); closeCard() },
    dayPlaces,
    dayLegs,
    dayRestaurants,
    placeIndex,
    trailNumbers,
    selectedPlaceId,
    selectedTripPlace,
    onSelectPlace: selectPlaceFromList,
    revealRequest,
    onRevealPlace: revealPlace,
    tab,
    onTab: setTab,
    selectedRestaurantPlaceId,
    onSelectRestaurant: (id) => openEat(id, 'row'),
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
    detailPlaceId,
    // Offered only after the user chose the sidebar: an automatic fallback would just repeat.
    onDetailOnMap: hasToken && mapAvailable && cardEntity && cards.detailsHere ? () => { cards.setDetailsHere(false); cards.fallBack(null) } : null,
    panelRequest: cards.panelRequest,
    sidebarDetail,
  }

  return (
    <>
      {/* Map-driving tools live only where a map exists. key={tripId} guarantees trip A's
          registrations unmount before trip B's mount, so two same-named tools never overlap. */}
      <TripTabUrl onTab={applyUrl} />
      <TripTools
        key={tripId}
        bundle={bundle}
        showDay={(n) => { setActiveDayNumber(n); setMobileList('stops') }}
        // A place goes through the reveal (its day, the Trip tab, its card); null clears it and
        // closes the card (show_on_map's day and trip targets).
        selectPlace={(id) => { if (id) revealPlace(id); else { setSelectedPlaceId(null); closeCard() } }}
        setLayerMode={setLayerMode}
        // show_on_map's day, trip and hotel targets open the Trip tab too (amendment 10).
        openPanel={() => { setPanelOpen(true); setTab('trip') }}
        showList={setMobileList}
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
          onSelectPlace={(id) => revealWith(id, 'pin')}
          selectedHotelId={selectedHotelId}
          layerMode={layerMode}
          focusNonce={focusNonce}
          fitNonce={fitNonce}
          mode3d={mode3d}
          show3dNonce={show3dNonce}
          card={mapCardNode && cardEntity && openCard ? { nonce: openCard.nonce, at: cardEntity.at, node: mapCardNode } : null}
          cards={{
            onFallback: onCardFallback,
            onAvailability: setMapAvailable,
            // Identity-checked (A12): a DOM card closes only the suggestion it showed.
            onDismiss: (which) => cards.closeIf(which),
            onOpenEat: (id) => openEat(id, 'pin'),
            onOpenHotel: (id) => cards.open('hotel', id, 'pin'),
          }}
          // The open eat or hotel at every width: TripMap carries it across the breakpoint (#6).
          openSuggestion={openCard && openCard.kind !== 'stop' ? { kind: openCard.kind, id: openCard.id } : null}
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
          {activeDay && mobileList === 'stops' && layerMode === 'route' ? <MapDayChip day={activeDay} /> : null}
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
