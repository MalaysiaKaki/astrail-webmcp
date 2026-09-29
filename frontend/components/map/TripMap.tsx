'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import mapboxgl from 'mapbox-gl'
import { thumbnailFor } from './popup-model'
import { buildEatPopup, buildStayPopup } from './suggestion-popup'
import type { Place, RestaurantSuggestion, TripBundle, TripPlace } from '@/lib/trip/backend-types'
import {
  buildTrailNumbers, buildPlaceIndex, placesForDay, hasRealCoords,
  selectedHotel, hubSpokeFeatures, isHotelBasePlace, hotelBasePlaceIds,
  orderedDays, restaurantsForDay,
} from '@/lib/trip/selectors'
import { consumeTripFramed } from '@/lib/trip/map-handoff'
import { fitTarget } from '@/lib/trip/fit-target'
import { getSheetObstruction, useSheetObstruction } from '@/lib/trip/sheet-obstruction'
import { getPanelObstruction, usePanelObstruction } from '@/lib/trip/panel-obstruction'
import { useTripLayout } from '@/lib/trip/use-trip-layout'
import { measureFramePadding } from './map-padding'
import { cameraPitch, createTerrainController, PITCH_3D, type TerrainController } from './camera-mode'
import { getControlRects, useControlRects } from '@/lib/trip/control-obstruction'
import { buildPhonePin } from './phone-pin'
import './phone-pins.css'
import './phone-map-cards.css'
import {
  addBuildingLayer, BUILDING_LAYER_ID, buildEatPin, dayTrailFeatureCollection, safeWebUrl, shortPlaceName,
} from './trail-features'
import { useSharedMap } from '@/components/map/MapProvider'
import { addSpokeLayers, addTrailLayers } from './route-layers'
import { addDayEmphasisLayers, applyDayEmphasis, removeChevronImage } from './day-emphasis'
import { reconcileOnMap, type PinEntry } from './pin-reconcile'
import { usePlaceCard, type MapCard } from './use-place-card'
import { createDomSuggestionCard, type SuggestionRef } from './dom-suggestion-card'
import './place-card.css'
import { usePlacementObstacles } from '@/lib/trip/placement-obstacles'
import { useOptionalWebMcpRegistry } from '@/components/webmcp/WebMcpRegistry'

/** The desktop place card's owner callbacks (A10). Omitted: every width keeps the DOM cards. */
export type MapCardHandlers = {
  /** Nothing fits at the pin: show this request's detail in the sidebar. */
  onFallback: (nonce: number) => void
  /** A click on the empty map. */
  /** With `which`: only that eat/hotel (a phone DOM card closed, A12). Without: the open card. */
  onDismiss: (which?: SuggestionRef) => void
  onOpenEat: (restaurantPlaceId: string) => void
  onOpenHotel: (hotelId: string) => void
  /** Whether a card can be shown at all: false until the shared map has loaded, and for good if
   *  it never does (a rejected style, no WebGL). The owner keeps the detail in the sidebar. */
  onAvailability?: (available: boolean) => void
}

export default function TripMap({
  bundle, activeDayNumber, selectedPlaceId, onSelectPlace,
  selectedHotelId = null, layerMode = 'route',
  selectedRestaurantPlaceId = null,
  onSelectRestaurant,
  focusNonce = 0,
  fitNonce = 0,
  mode3d = false,
  show3dNonce = 0,
  card = null,
  cards,
  openSuggestion = null,
}: {
  bundle: TripBundle
  activeDayNumber: number
  selectedPlaceId: string | null
  onSelectPlace: (placeId: string) => void
  /** A restaurant picked from the "Where to eat" strip. Suggestions were listed but never
   *  drawn, so clicking one told you nothing about where it actually is. */
  selectedRestaurantPlaceId?: string | null
  /** Clicking an eat pin selects it in the sidebar strip too, so the two never disagree
   *  about which suggestion is current. */
  onSelectRestaurant?: (placeId: string) => void
  // Hotel-hub map (plan 2026-08-04-hotel-hub-map, T9). Optional with route-preserving defaults so
  // today's caller (TripWorkspace, pre-T8) keeps the itinerary-only behavior untouched; T8 passes
  // both explicitly (`string | null` / `'route' | 'hub'`) to drive the Route/Hotel toggle.
  selectedHotelId?: string | null
  layerMode?: 'route' | 'hub'
  /** Bumped to fly to the SAME selected place again (the phone's re-tap of a selected stop).
   *  Omitted on desktop, where selection alone drives the camera as before. */
  focusNonce?: number
  /** Bumped by the phone's "Fit" control: frame the fitTarget (day, hub or trip) again, even when
   *  nothing else changed — the user panned away and wants the route back. 0 means no request. */
  fitNonce?: number
  /** The trip camera's 3D mode (components/map/camera-mode). Every camera command below takes its
   *  pitch from it, and terrain + fog exist on the shared map only while it is on. */
  mode3d?: boolean
  /** Bumped by a stop card's "Show in 3D" (the old popup's "Zoom in for 3D"): fly to the selected
   *  stop at street level. The owner turns the mode on in the same update. */
  show3dNonce?: number
  /** Desktop: the one open place card (its request, where it points, its React content), shown
   *  at the pin in a Mapbox Popup this component owns. Ignored on a phone. */
  card?: (MapCard & { node: ReactNode }) | null
  cards?: MapCardHandlers
  /** The eat or hotel whose detail is open, at every width (the owner's open card). A rotation
   *  carries it across as ONE surface: the phone's DOM card or the desktop place card. */
  openSuggestion?: { kind: 'eat' | 'hotel'; id: string } | null
}) {
  const { hasToken, ready, getMap, acquire, release, setMarkers } = useSharedMap()
  const routeIdsRef = useRef<string[]>([])
  const markerLabelsRef = useRef<HTMLElement[]>([])
  const panelObstruction = usePanelObstruction()
  // The phone's eat/stay DOM card (./dom-suggestion-card); a user close closes the owner's card.
  const domCardRef = useRef<ReturnType<typeof createDomSuggestionCard> | null>(null)
  if (!domCardRef.current) domCardRef.current = createDomSuggestionCard(() => getMap(), (which) => cardsRef.current?.onDismiss(which))
  const domCard = domCardRef.current
  const buildingLayerAddedRef = useRef(false)
  const framedRef = useRef(false)
  // Route teardown in progress, and the padding ease currently deferred to `moveend` (if any).
  const tornDownRef = useRef(false)
  const cancelDeferredEaseRef = useRef<(() => void) | null>(null)
  // Read here only to re-run the padding effect below; framePadding() reads the live value.
  const sheetObstruction = useSheetObstruction()
  const layout = useTripLayout()
  // Read by marker click handlers and label sync, which are DOM listeners built once per draw and
  // must see the layout as it is now, not as it was when the markers were drawn.
  const layoutRef = useRef(layout)
  layoutRef.current = layout
  // Which layout's obstruction the current framing was solved against: the phone sheet or the
  // desktop panel. The first framing usually runs before either has measured itself (both settle
  // after a transition), so that layout's first measurement triggers one proper re-fit; every later
  // change only eases padding. Keyed by layout so a rotation re-fits once for the new obstruction
  // (Codex final-review fix 2: the desktop panel's first measurement used to only ease).
  const fittedForRef = useRef<'mobile' | 'desktop' | null>(null)
  // What the camera was last asked to show. The one-time re-fit above must re-frame THIS — a
  // selection, a day switch, or show_on_map can land between first framing and the sheet's first
  // measurement, and re-fitting the whole trip then would silently undo it. 'other' (a restaurant
  // or hotel hub flight) is left alone: only its padding eases.
  const cameraIntentRef = useRef<'trip' | 'day' | 'place' | 'other'>('trip')
  // Read at call time by every camera command, so a fly issued from a stale closure (a marker
  // click handler, a deferred re-fit) still uses the mode as it is now.
  const mode3dRef = useRef(mode3d)
  mode3dRef.current = mode3d
  const terrainRef = useRef<TerrainController | null>(null)
  const terrainMapRef = useRef<mapboxgl.Map | null>(null)
  // The mode the camera was last moved for; only a real change eases the pitch.
  const appliedModeRef = useRef(false)
  // A card's "Show in 3D" waiting for the mode to turn on.
  const pending3dFlyRef = useRef<[number, number] | null>(null)
  const controlRects = useControlRects()
  // Desktop day emphasis (plan v2): the drawn stop pins, reconciled in place (dimming, name pills)
  // on day, zoom, selection, layout, camera and place-card changes.
  const pinEntriesRef = useRef<PinEntry[]>([])
  const activeDayRef = useRef(activeDayNumber)
  activeDayRef.current = activeDayNumber
  const selectedRef = useRef(selectedPlaceId)
  selectedRef.current = selectedPlaceId
  // The moveend listener is registered once, so everything reconcile() reads comes through refs.
  const layerModeRef = useRef(layerMode)
  layerModeRef.current = layerMode
  // The desktop place card (A10). Its shell, placement and one bounded camera correction live in
  // usePlaceCard; this component stays the only thing that moves the camera for a selection.
  const placementObstacles = usePlacementObstacles()
  const registry = useOptionalWebMcpRegistry()
  const pendingRef = useRef(false)
  pendingRef.current = Boolean(registry?.pending)
  const cardsRef = useRef(cards)
  cardsRef.current = cards
  /** Desktop with an owner for the cards: eat and stay open as place cards, not DOM popups. */
  const desktopCards = () => layoutRef.current === 'desktop' && Boolean(cardsRef.current)
  const shownCard = layout === 'desktop' && cards ? card : null
  useEffect(() => { cardsRef.current?.onAvailability?.(ready) }, [ready])
  const placeCard = usePlaceCard({
    getMap, ready,
    card: shownCard ? { nonce: shownCard.nonce, at: shownCard.at } : null,
    onFallback: (n) => cardsRef.current?.onFallback(n),
    onDismiss: () => cardsRef.current?.onDismiss(),
    mayTakeFocus: () => !pendingRef.current,
    onLayout: () => reconcile(),
    deps: [panelObstruction, controlRects, placementObstacles, layout],
  })

  /* One reconcile for the desktop emphasis: the route's filters and paint, and the pins' dimming
     and name pills. No marker is rebuilt and the camera never moves. On a phone it undoes every
     desktop-only change, so the phone map is exactly as before. */
  function reconcile() {
    const map = getMap()
    if (!map) return
    const desktop = layoutRef.current === 'desktop'
    if (typeof map.setFilter === 'function') applyDayEmphasis(map as unknown as Parameters<typeof applyDayEmphasis>[0], activeDayRef.current, desktop && layerModeRef.current === 'route')
    reconcileOnMap(map, pinEntriesRef.current, {
      activeDay: activeDayRef.current, selectedPlaceId: selectedRef.current, desktop,
      controls: getControlRects(), panelRight: getPanelObstruction(),
      card: desktop ? placeCard.cardRect() : null,
      hideSelected: desktop && placeCard.isOpen(),
    })
  }

  function clearRoutes() {
    const map = getMap()
    if (!map) return
    for (const id of [...routeIdsRef.current].reverse()) {
      if (map.getLayer(id)) map.removeLayer(id)
      if (map.getSource(id)) map.removeSource(id)
    }
    routeIdsRef.current = []
  }

  function clearBuildings() {
    const map = getMap()
    if (!map) return
    if (map.getLayer(BUILDING_LAYER_ID)) map.removeLayer(BUILDING_LAYER_ID)
    buildingLayerAddedRef.current = false
  }

  /* The stop a suggestion was searched around. `near_place_id` is the day's stop NEAREST the
     restaurant, resolved through the same index the rest of the map uses. */
  function nearName(r: RestaurantSuggestion): string | null {
    if (!r.near_place_id) return null
    return buildPlaceIndex(bundle).get(r.near_place_id)?.name ?? null
  }

  const openSuggestionPopup = (at: [number, number], el: HTMLElement, which: SuggestionRef) => domCard.open(at, el, which)
  const dropDomPopup = () => domCard.drop()
  // Crossing the breakpoint with an eat/hotel detail open (Codex #6): one surface. Widening drops the
  // phone's DOM card for the place card; narrowing rebuilds the DOM card the place card leaves.
  const shownLayoutRef = useRef(layout)
  const openSuggestionRef = useRef(openSuggestion)
  openSuggestionRef.current = openSuggestion
  useEffect(() => {
    const prev = shownLayoutRef.current
    shownLayoutRef.current = layout
    if (!ready || !framedRef.current || !cardsRef.current || prev === layout || !prev || !layout) return
    if (layout === 'desktop') dropDomPopup()
    else if (openSuggestionRef.current) domCard.openFor(bundle, openSuggestionRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, ready])

  function syncMarkerLabelVisibility() {
    // Close pins would stack their name pills into an unreadable pile, and the panel already names
    // every stop: only the selected eat suggestion is labelled (the selected stop pin draws its own).
    for (const label of markerLabelsRef.current) {
      label.classList.toggle('eat-pin__label--visible', label.dataset.selected === 'true')
    }
  }

  // Daybreak world (DESIGN-DRAFT §5): generation happens at night (GenerationScene);
  // the saved trip is explored at dawn — PRD §13's "readable trip exploration lighting".
  // Arriving from generation the map is already relighting to dawn, and re-setting the
  // same preset is a no-op, so the transition is never interrupted.
  useEffect(() => {
    tornDownRef.current = false
    const first = bundle.places[0]?.place
    acquire({
      interactive: true,
      lightPreset: 'dawn',
      center: first ? [first.lng, first.lat] : [0, 20],
      zoom: 1.4,
    })
    // Layers are ours, and the map outlives this component — leaving them behind would
    // paint this trip's routes over the next one.
    return () => {
      dropDomPopup()
      markerLabelsRef.current = []
      pinEntriesRef.current = []
      clearRoutes()
      clearBuildings()
      const leaving = getMap()
      if (leaving) removeChevronImage(leaving as unknown as Parameters<typeof removeChevronImage>[0])
      // Terrain and fog go before the map is handed back: the shared map outlives this route, and
      // /app/trips (or the next trip) must never inherit this trip's 3D atmosphere.
      // Only on the live map: when the whole /app shell is leaving, MapProvider may already have
      // removed it, and a removed map has no style left to restore into (or to throw from).
      if (terrainMapRef.current && getMap() === terrainMapRef.current) terrainRef.current?.dispose()
      terrainRef.current = null
      terrainMapRef.current = null
      pending3dFlyRef.current = null
      // Order matters. release() calls map.stop(), and Mapbox's stop() fires `moveend`
      // SYNCHRONOUSLY — so a padding ease deferred to moveend (the effect below) would start a
      // fresh easeTo with this trip's padding after any reset. Disarm it first, stop the map,
      // and only then clear the padding: the map outlives this route, and /app/trips (or the next
      // trip) must not inherit a sheet-sized dead zone at the bottom of its canvas.
      tornDownRef.current = true
      cancelDeferredEaseRef.current?.()
      release()
      getMap()?.setPadding?.({ top: 0, right: 0, bottom: 0, left: 0 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function drawMarkers() {
    const map = getMap()
    if (!map) return
    const entries: PinEntry[] = []
    // Global trail numbers: every stop across the whole trip is numbered 1..N in journey
    // order (Day 1's first stop = 1, the last day's final stop = N), so the numbered pins
    // read as one sequence you can follow end to end — independent of the active day.
    // Pins with no number (the undayed base hotel, unresolved coordinates) recede.
    const trailNumbers = buildTrailNumbers(bundle)
    // Hub mode (hotel-hub map): the selected hotel is drawn once as a distinct hub pin below, so
    // suppress the base-hotel PLACE marker to avoid a duplicate pin sitting on top of the hub. The
    // predicate is IMPORTED from selectors (the same one hubSpokeFeatures uses to pick spoke
    // targets) — reimplementing it risks dropping the base_place_id signal and double-pinning.
    const basePlaceIds = hotelBasePlaceIds(bundle)
    const labels: HTMLElement[] = []
    const markers = bundle.places
      .filter((tp) => hasRealCoords(tp.place.lng, tp.place.lat))
      .filter((tp) => layerMode !== 'hub' || !isHotelBasePlace(tp, basePlaceIds))
      .map((tp) => {
        const number = trailNumbers.get(tp.id) ?? null
        // The Reel still that this stop came from, when we can attribute one honestly. Untrusted
        // (guardrail #11: Reel content is attacker-controlled): it reaches us from Apify's scrape,
        // and an <img src> is a resource load, so it clears the same protocol check as any link.
        // NB the empty-string guard: safeWebUrl('') resolves against our origin and returns a
        // valid URL, which would render a broken image instead of the glyph.
        const rawPhoto = thumbnailFor(bundle, tp)
        const photoUrl = rawPhoto ? safeWebUrl(rawPhoto) : null
        // Placify-style avatar pin, centred on the coordinate (components/map/phone-pin.ts), at
        // every width since plan A6. Its name pill is drawn only when selected.
        const pinEl = buildPhonePin({
          name: tp.place.name,
          label: shortPlaceName(tp.place.name),
          placeType: tp.place.place_type,
          sourceType: tp.source_type,
          number,
          selected: tp.place_id === selectedPlaceId,
          photoUrl,
        })
        // Read by the card's logical-opener lookup (focus goes back to this pin on close).
        pinEl.dataset.pinPlaceId = tp.place_id
        pinEl.addEventListener('click', (e) => {
          e.stopPropagation()
          // The owner reveals the stop: on a phone its expanded sheet card is the detail, on
          // desktop its place card opens here at the pin. Never a DOM evidence popup.
          onSelectPlace(tp.place_id)
          dropDomPopup()
        })
        // No hover preview (A10): the active day's pills name the pins, and the card is the detail.
        const at: [number, number] = [tp.place.lng, tp.place.lat]
        entries.push({ el: pinEl, tp, lngLat: at, label: shortPlaceName(tp.place.name) })
        return new mapboxgl.Marker({ element: pinEl, anchor: 'center' })
          .setLngLat([tp.place.lng, tp.place.lat]).addTo(map)
      })
    // Hub mode: pin the selected PLACED hotel as the hub. Honest empty-state (Guardrail #1 / C5):
    // a null/unresolved/coordless selection draws no hub — the panel/toggle owns the messaging, and
    // hubSpokeFeatures returns an empty collection in the very same case (never an invented coord).
    if (layerMode === 'hub') {
      const hub = selectedHotel(bundle, selectedHotelId)
      if (
        hub && hub.geo_status === 'placed'
        && hub.lng !== null && hub.lat !== null && hasRealCoords(hub.lng, hub.lat)
      ) {
        const el = document.createElement('button')
        el.type = 'button'
        el.setAttribute('aria-label', hub.name)
        el.setAttribute('role', 'button')   // not Mapbox's default role="img"
        el.className = 'hotel-hub-pin phone-hit'
        el.textContent = '🏨'
        const at: [number, number] = [hub.lng, hub.lat]
        el.addEventListener('click', (e) => {
          e.stopPropagation()
          // The owner always learns which card is open (a rotation carries it); the phone also
          // shows its DOM card.
          cardsRef.current?.onOpenHotel(hub.id)
          if (!desktopCards()) openSuggestionPopup(at, buildStayPopup(hub), { kind: 'hotel', id: hub.id })
        })
        markers.push(new mapboxgl.Marker({ element: el }).setLngLat(at).addTo(map))
      }
    }
    // "Where to eat" was text-only: a suggestion you could read but not locate. These are
    // deliberately quieter than trail pins — they are options, not stops on the route.
    const dayMeta = orderedDays(bundle).find((d) => d.day_number === activeDayNumber)
    const eatMarkers = (dayMeta ? restaurantsForDay(bundle, dayMeta.id) : [])
      .map((r) => {
        const place = r.restaurant_place_id
          ? bundle.suggestion_places.find((p) => p.id === r.restaurant_place_id)
          : undefined
        return place && hasRealCoords(place.lng, place.lat) ? { r, place } : null
      })
      .filter((x): x is { r: RestaurantSuggestion; place: Place } => x !== null)
      .map(({ r, place }) => {
        const { el, label } = buildEatPin(r, place, place.id === selectedRestaurantPlaceId)
        // Shown when selected rather than on :hover — a touch device has no hover.
        labels.push(label)
        el.addEventListener('click', (e) => {
          e.stopPropagation()
          onSelectRestaurant?.(place.id)      // keep the sidebar strip in step with the map
          cardsRef.current?.onOpenEat(place.id)
          if (!desktopCards()) openSuggestionPopup([place.lng, place.lat], buildEatPopup(r, place, nearName(r)), { kind: 'eat', id: place.id })
        })
        return new mapboxgl.Marker({ element: el }).setLngLat([place.lng, place.lat]).addTo(map)
      })

    markerLabelsRef.current = labels     // assigned AFTER the eat labels join the list
    pinEntriesRef.current = entries
    setMarkers([...markers, ...eatMarkers])
    syncMarkerLabelVisibility()
    reconcile()
  }

  // "Constellation trail" (docs/roadmap/trip-map-day-connections.md): one continuous brass
  // line threading every stop in journey order — Day 1's first stop through the last day's
  // final stop — built from the ORDERED STOPS, with per-hop road geometry substituted where a
  // same-day transport leg provides it (selectors.trailCoordinates). The stop order, not the
  // legs, is what defines the line: most "saved with gaps" trips come back with zero legs, so
  // a leg-DRIVEN line would leave those pins disconnected. Every hop without usable geometry
  // stays a straight pin-to-pin link — this always connects. The hotel-as-hub model lands in a
  // later phase, not here.
  function drawTrail() {
    const map = getMap()
    if (!map) return
    clearRoutes()
    const trail = dayTrailFeatureCollection(bundle)
    if (trail.features.length === 0) return // one stop (or none) has nothing to connect
    routeIdsRef.current.push(...addTrailLayers(map, trail))
    // The active day's casing, solid core and chevrons, on this same source (plan v2 amendment 6).
    // Tracked with the trail, so every route cleanup removes them; reconcile() shows them on desktop.
    if (typeof map.setFilter === 'function') {
      routeIdsRef.current.push(...addDayEmphasisLayers(map as unknown as Parameters<typeof addDayEmphasisLayers>[0], activeDayRef.current))
    }
    reconcile()
  }

  // Drop to street level, tilted: this is what turns "a dot on a map" into "what is actually around
  // this place". essential: still runs under prefers-reduced-motion.
  function flyToStreet(at: [number, number]) {
    getMap()?.flyTo({ center: at, zoom: 17, pitch: PITCH_3D, bearing: -20, duration: 1400, essential: true })
  }

  function drawBuildings() {
    const map = getMap()
    if (!map || buildingLayerAddedRef.current) return
    buildingLayerAddedRef.current = addBuildingLayer(map)
  }

  // Hotel-hub map (plan 2026-08-04-hotel-hub-map, T9): hub mode's counterpart to drawTrail. Straight
  // 2-point spokes from the selected hub hotel to each destination place (hub-and-spoke), built by
  // selectors.hubSpokeFeatures — which owns the geometry, the base-hotel exclusion, and the
  // missing-duration handling, all unit-tested in T7. This only wires the FeatureCollection onto the
  // map as line layers, pushing their ids into routeIdsRef so clearRoutes tears them down on the next
  // redraw / unmount. Honest empty-state: an empty collection (no placed hub) draws nothing at all.
  function drawSpokes() {
    const map = getMap()
    if (!map) return
    clearRoutes()
    const spokes = hubSpokeFeatures(selectedHotel(bundle, selectedHotelId), bundle)
    if (spokes.features.length === 0) return
    routeIdsRef.current.push(...addSpokeLayers(map, spokes))
  }

  // The map shows the itinerary trail OR the hotel hub-and-spokes, never both at once (decision #3).
  function drawRouteLayer() {
    if (layerMode === 'hub') drawSpokes()
    else drawTrail()
  }

  // The details panel overlays the map (the left panel on desktop, the stop sheet on a phone), so
  // uniform padding would frame a day's pins right underneath it: ./map-padding measures it.
  function framePadding(opts?: { popupRoom?: boolean }) {
    return measureFramePadding(getMap(), layoutRef.current === 'mobile', opts?.popupRoom)
  }

  // essential: framing is not decoration — reduced-motion must still land on the pins,
  // not leave the camera wherever the last gesture (or generation) parked the globe.
  function frame(pts: [number, number][], duration: number) {
    const map = getMap()
    if (!map || pts.length === 0) return
    // The shared map is built while its container is still hidden (height 0), so Mapbox sizes the
    // canvas at its 300px default and corrects it later from its own ResizeObserver. Framing
    // before that correction measures the wrong canvas, and the late resize then cuts the fly
    // short: the camera stayed on the globe, or framed the route low (phones, and the flaky 1024
    // desktop capture). Bring the canvas to its container's size first; synchronous and cheap.
    const canvas = typeof map.getCanvas === 'function' ? map.getCanvas() : null
    const container = typeof map.getContainer === 'function' ? map.getContainer() : null
    if (canvas && container && (canvas.clientWidth !== container.clientWidth || canvas.clientHeight !== container.clientHeight)) {
      map.resize()
    }
    if (pts.length === 1) {
      map.flyTo({ center: pts[0], zoom: 13.5, pitch: cameraPitch(mode3dRef.current), padding: framePadding(), duration, essential: true })
      return
    }
    const bounds = new mapboxgl.LngLatBounds()
    pts.forEach((p) => bounds.extend(p))
    map.fitBounds(bounds, { padding: framePadding(), maxZoom: 14, pitch: cameraPitch(mode3dRef.current), duration, essential: true })
  }

  function pointsForDay(dayNumber: number): [number, number][] {
    return placesForDay(bundle, dayNumber)
      .filter((tp) => hasRealCoords(tp.place.lng, tp.place.lat))
      .map((tp) => [tp.place.lng, tp.place.lat] as [number, number])
  }

  function flyToTrip(duration = 2200) {
    const pts = bundle.places
      .filter((tp) => hasRealCoords(tp.place.lng, tp.place.lat))
      .map((tp) => [tp.place.lng, tp.place.lat] as [number, number])
    frame(pts, duration)
  }

  // The shared map fires 'load' once ever, and this component usually mounts long after
  // that — so first draw keys off `ready`, not a load listener that will never fire.
  // Framing is explicit for the same reason: the camera no longer resets on navigation,
  // so without this the trip would inherit wherever generation left the globe.
  //
  // Deferred to the next frame, deliberately. Two teardown paths call release() ->
  // map.stop(), which cancels an in-flight fitBounds: React Strict Mode's dev
  // mount->cleanup->remount, and the generation->trip handoff (the outgoing scene's
  // release races our fit). Both run their cleanup synchronously before the next frame,
  // so scheduling the fit in an rAF lets stop() fire first and our framing win. The
  // effect's own cleanup cancels a still-pending frame, so the remount reschedules a
  // fresh one instead of being locked out by a one-shot guard.
  useEffect(() => {
    if (!ready) return
    let cancelled = false
    const raf = requestAnimationFrame(() => {
      if (cancelled) return
      framedRef.current = true
      drawMarkers()
      drawRouteLayer()
      drawBuildings()
      // Arriving from the trips dashboard already framed on this trip → settle into the
      // panel geometry (short) rather than re-fly the whole camera (full). Any other entry
      // (generation handoff, direct load) never marks the handoff, so it frames normally.
      const inherited = consumeTripFramed(bundle.trip.id)
      const lay = layoutRef.current
      fittedForRef.current = lay && (lay === 'mobile' ? getSheetObstruction() : getPanelObstruction()) > 0 ? lay : null
      cameraIntentRef.current = 'trip'
      // This framing is solved at the mode's pitch; recording it means the mode effect never
      // follows with a pitch-only ease that would cut the pitched fit short mid-flight.
      appliedModeRef.current = mode3dRef.current
      flyToTrip(inherited ? 900 : 2200)
    })
    return () => { cancelled = true; cancelAnimationFrame(raf) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  // The sheet changed height (compact, expanded, hidden) or the viewport crossed the md line:
  // re-apply padding with a short ease, keeping the camera's centre. Not a fresh fly-to — the
  // framing already chosen stays, it just shifts into the part of the map that is visible now.
  // A selection fly still in the air is not interrupted: the new padding lands when it settles.
  useEffect(() => {
    if (!ready || !framedRef.current) return
    const map = getMap()
    if (!map || typeof map.easeTo !== 'function') return
    const measured = layout === 'mobile' ? sheetObstruction : panelObstruction
    if (layout && fittedForRef.current !== layout && measured > 0) {
      // This layout's first real measurement (the phone sheet, or the desktop panel): re-fit into
      // the visible band, once. Easing padding alone keeps a zoom chosen for the whole canvas.
      fittedForRef.current = layout
      const intent = cameraIntentRef.current
      if (intent !== 'other') {
        cancelDeferredEaseRef.current?.()
        if (intent === 'place') flyToSelected(700)
        else if (intent === 'day') flyToDay(700)
        else flyToTrip(700)
        return
      }
    }
    const apply = () => {
      cancelDeferredEaseRef.current = null
      if (tornDownRef.current) return
      map.easeTo({ padding: framePadding(), duration: 300, essential: true })
    }
    if (map.isMoving?.()) {
      map.once('moveend', apply)
      const cancel = () => { map.off('moveend', apply); cancelDeferredEaseRef.current = null }
      cancelDeferredEaseRef.current = cancel
      return cancel
    }
    apply()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetObstruction, panelObstruction, layout, controlRects])

  // The 3D mode. Our terrain + fog follow it (camera-mode.ts; the Standard style's own z<13.7 relief
  // is its baseline and not ours to remove), and a real change eases the camera's pitch where it
  // is — or, for
  // a popup's "Zoom in for 3D", flies to that stop. Before the first framing only the terrain is
  // set: the framing itself reads the mode for its pitch.
  useEffect(() => {
    if (!ready) return
    const map = getMap()
    if (!map) return
    // Off adds nothing (no DEM source, no fog); the controller only reads until 3D is first on.
    // Defensive on the API, like framing: a map without terrain support stays a flat map.
    if (typeof map.setTerrain === 'function' && typeof map.getTerrain === 'function') {
      if (!terrainRef.current) {
        terrainRef.current = createTerrainController(map as unknown as Parameters<typeof createTerrainController>[0])
        terrainMapRef.current = map
      }
      terrainRef.current.set(mode3d)
    }
    if (appliedModeRef.current === mode3d) return
    appliedModeRef.current = mode3d
    const street = pending3dFlyRef.current
    pending3dFlyRef.current = null
    if (!framedRef.current) return
    if (street && mode3d) { flyToStreet(street); return }
    const pitch = cameraPitch(mode3d)
    const reduced = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced && typeof map.jumpTo === 'function') map.jumpTo({ pitch })
    else map.easeTo({ pitch, duration: 700, essential: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, mode3d])

  // Mapbox's attribution and logo are bottom-corner controls, and the phone sheet covers exactly
  // that strip. Publish the covered height on the map container; phone-map-cards.css lifts the
  // bottom controls by it, so the attribution rides just above the sheet in every state.
  // The container is remembered, not re-read on unmount: the provider may drop the map first.
  const obstructionHostRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const container = getMap()?.getContainer?.() ?? null
    if (container) obstructionHostRef.current = container
    container?.style?.setProperty?.('--sheet-obstruction', `${layout === 'mobile' ? sheetObstruction : 0}px`)
    // The desktop panel covers the bottom-left corner too: the Mapbox logo rides beside it.
    container?.style?.setProperty?.('--panel-obstruction', `${layout === 'mobile' ? 0 : panelObstruction}px`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, sheetObstruction, panelObstruction, layout])
  useEffect(() => () => {
    obstructionHostRef.current?.style?.removeProperty?.('--sheet-obstruction')
    obstructionHostRef.current?.style?.removeProperty?.('--panel-obstruction')
  }, [])

  // Fly to the active day's pins when the day changes. Markers and the trail are whole-trip
  // and day-independent now (global numbering, one continuous journey line), so switching a
  // day only moves the camera — it never relabels pins or redraws the trail. Falls back to
  // the whole trip when a day has no resolved-coordinate places, so the camera is never
  // stranded.
  function flyToDay(duration: number) {
    const pts = pointsForDay(activeDayNumber)
    frame(pts.length ? pts : bundle.places
      .filter((tp) => hasRealCoords(tp.place.lng, tp.place.lat))
      .map((tp) => [tp.place.lng, tp.place.lat] as [number, number]), duration)
  }

  /** Fly to the selected stop. False when there is nothing locatable to fly to. */
  function flyToSelected(duration: number): boolean {
    const map = getMap()
    if (!map || !selectedPlaceId) return false
    const place = buildPlaceIndex(bundle).get(selectedPlaceId)
    if (!place || !hasRealCoords(place.lng, place.lat)) return false
    map.flyTo({
      center: [place.lng, place.lat], zoom: 14, pitch: cameraPitch(mode3dRef.current),
      // Reduced motion lands immediately (A10): the card's placement then follows in the same frame.
      padding: framePadding({ popupRoom: true }), duration: reducedMotion() ? 0 : duration, essential: true,
    })
    return true
  }

  useEffect(() => {
    if (!ready || !framedRef.current) return
    cameraIntentRef.current = 'day'
    flyToDay(1400)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDayNumber])

  // The desktop emphasis follows the day, the layout and the obstructions a pill must clear; a
  // layout change also drops a hover card (a phone has no hover). Filters and classes only.
  useEffect(() => {
    if (!ready || !framedRef.current) return
    reconcile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDayNumber, layout])
  useEffect(() => {
    if (!ready || !framedRef.current) return
    reconcile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelObstruction, controlRects])

  // Name pills are placed in screen space, so every settled camera move (zoom, pan, pitch, bearing,
  // the 3D toggle) re-places them. One reconcile per animation frame at most.
  useEffect(() => {
    if (!ready) return
    const map = getMap()
    if (!map || typeof map.on !== 'function') return
    let frame = 0
    const onMoveEnd = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => reconcile())
    }
    map.on('moveend', onMoveEnd)
    return () => { cancelAnimationFrame(frame); map.off?.('moveend', onMoveEnd) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  // A refreshed itinerary (an agent edit, a replan) redraws the pins and the trail from the new
  // bundle. Skips the first render: the [ready] framing draws that one.
  const drawnBundleRef = useRef(bundle)
  useEffect(() => {
    if (drawnBundleRef.current === bundle) return
    drawnBundleRef.current = bundle
    if (!ready || !framedRef.current) return
    drawMarkers()
    drawRouteLayer()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle])

  // The phone's "Fit" control. Keyed on the counter alone, so every press moves the camera and no
  // other prop change is mistaken for one. The target comes from the same fitTarget() the button
  // was labelled from. show_on_map never bumps this: its 'trip' target stays camera-free.
  useEffect(() => {
    if (!ready || !framedRef.current || fitNonce === 0) return
    const map = getMap()
    const target = fitTarget(bundle, activeDayNumber, layerMode, selectedHotelId)
    if (!map || !target) return
    cancelDeferredEaseRef.current?.()
    if (target === 'hub') {
      const hub = selectedHotel(bundle, selectedHotelId)!
      cameraIntentRef.current = 'other'
      map.flyTo({ center: [hub.lng!, hub.lat!], zoom: 14, pitch: cameraPitch(mode3dRef.current), padding: framePadding(), duration: 900, essential: true })
    } else if (target === 'day') {
      cameraIntentRef.current = 'day'
      flyToDay(900)
    } else {
      cameraIntentRef.current = 'trip'
      flyToTrip(900)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitNonce])

  // A stop card's "Show in 3D". The owner turns the mode on in the same update; if the mode effect
  // has not applied it yet, the fly waits for it (pending3dFlyRef), exactly as the old popup did.
  useEffect(() => {
    if (!ready || show3dNonce === 0 || !selectedPlaceId) return
    const place = buildPlaceIndex(bundle).get(selectedPlaceId)
    if (!place || !hasRealCoords(place.lng, place.lat)) return
    cameraIntentRef.current = 'place'
    const at: [number, number] = [place.lng, place.lat]
    if (mode3dRef.current && appliedModeRef.current) flyToStreet(at)
    else pending3dFlyRef.current = at
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show3dNonce])

  // Refresh marker selection and fly to the selected place.
  useEffect(() => {
    if (!ready) return
    if (selectedPlaceId) dropDomPopup()   // a chosen stop replaces a phone eat/stay DOM card (A12)
    drawMarkers()
    if (flyToSelected(1400)) cameraIntentRef.current = 'place'
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlaceId, focusNonce])

  /* Selecting from the sidebar has to move the map, not just restyle a pin. "Where to eat" set
     `selectedRestaurantPlaceId`, TripMap added `eat-pin--selected`, and that was the whole
     interaction — so clicking a restaurant highlighted something off-screen, which read as the
     click doing nothing. Mirrors the trip-stop behaviour, popup included, so a suggestion
     behaves like every other thing on this map. */
  useEffect(() => {
    if (!ready) return
    drawMarkers()
    const map = getMap()
    if (!map || !selectedRestaurantPlaceId) return
    const place = bundle.suggestion_places.find((p) => p.id === selectedRestaurantPlaceId)
      ?? buildPlaceIndex(bundle).get(selectedRestaurantPlaceId)
    if (!place || !hasRealCoords(place.lng, place.lat)) return
    cameraIntentRef.current = 'other'
    map.flyTo({
      center: [place.lng, place.lat], zoom: 15, pitch: cameraPitch(mode3dRef.current),
      padding: framePadding({ popupRoom: true }), duration: 1200, essential: true,
    })
    const suggestion = bundle.restaurants.find((r) => r.restaurant_place_id === selectedRestaurantPlaceId)
    // Desktop: the owner opens the eat's place card (A10); the phone keeps its DOM card.
    if (suggestion && !desktopCards()) {
      openSuggestionPopup([place.lng, place.lat], buildEatPopup(suggestion, place, nearName(suggestion)), { kind: 'eat', id: selectedRestaurantPlaceId })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRestaurantPlaceId])

  // Hotel-hub map (T9): the hub selection or layer mode changed — swap trail and spokes, (re)pin the
  // hub, suppress the base-hotel marker. Gated on framedRef: the [ready] effect owns the first draw.
  useEffect(() => {
    if (!ready || !framedRef.current) return
    drawMarkers()
    drawRouteLayer()
    // Fly to the chosen hub and show its numbers. The original "no camera move" note was scoped
    // to T9, when a hub was an emoji with nothing behind it; picking one is now a real decision
    // (class, nightly rate, trip total), so leaving the camera elsewhere hides the answer.
    const map = getMap()
    if (!map || layerMode !== 'hub') return
    const hub = selectedHotel(bundle, selectedHotelId)
    if (!hub || hub.geo_status !== 'placed' || hub.lng === null || hub.lat === null) return
    if (!hasRealCoords(hub.lng, hub.lat)) return
    cameraIntentRef.current = 'other'
    map.flyTo({
      center: [hub.lng, hub.lat], zoom: 14, pitch: cameraPitch(mode3dRef.current),
      padding: framePadding({ popupRoom: true }), duration: 1200, essential: true,
    })
    // The owner always learns which card is open, as a hub click does (A12: phone Stay selections).
    cardsRef.current?.onOpenHotel(hub.id)
    if (!desktopCards()) openSuggestionPopup([hub.lng, hub.lat], buildStayPopup(hub), { kind: 'hotel', id: hub.id })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedHotelId, layerMode])

  if (!hasToken) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[var(--deep)]">
        <p className="type-label uppercase tracking-wide text-[var(--muted)] text-[length:var(--t-meta)] leading-[1.45]">Map unavailable — token missing</p>
      </div>
    )
  }
  // The canvas itself is the shell's fixed layer; this component only drives it, and portals the
  // desktop place card's content into the popup host it owns.
  return shownCard && placeCard.host ? createPortal(shownCard.node, placeCard.host) : null
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
