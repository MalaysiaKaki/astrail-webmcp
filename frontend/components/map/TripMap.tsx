'use client'

import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import { buildPopupModel, thumbnailFor, type PopupModel } from './popup-model'
import { buildEatPopup, buildStayPopup } from './suggestion-popup'
import type { Place, RestaurantSuggestion, TripBundle, TripPlace } from '@/lib/trip/backend-types'
import {
  trailCoordinates, buildTrailNumbers, buildPlaceIndex, placesForDay, hasRealCoords,
  selectedHotel, hubSpokeFeatures, isHotelBasePlace, hotelBasePlaceIds,
  orderedDays, restaurantsForDay,
} from '@/lib/trip/selectors'
import { consumeTripFramed } from '@/lib/trip/map-handoff'
import { fitTarget } from '@/lib/trip/fit-target'
import { getSheetObstruction, useSheetObstruction } from '@/lib/trip/sheet-obstruction'
import { useTripLayout } from '@/lib/trip/use-trip-layout'
import { computeFramePadding } from './frame-padding'
import { buildPhonePin } from './phone-pin'
import './phone-pins.css'
import './phone-map-cards.css'
import { useSharedMap } from '@/components/map/MapProvider'

const DAY_ROUTE_COLORS = [
  '#F4D7A1', // light starlight brass
  '#C9974E', // Astrail brass
  '#8F632C', // dark bronze
  '#E7B866', // bright amber
  '#A97842', // warm umber
  '#FFE2AA', // pale gold
] as const

const BUILDING_LAYER_ID = 'astrail-3d-buildings'
const LABEL_ZOOM = 11
const LABEL_MAX_CHARS = 24

function shortPlaceName(name: string): string {
  const chars = Array.from(name)
  if (chars.length <= LABEL_MAX_CHARS) return name
  return `${chars.slice(0, LABEL_MAX_CHARS - 1).join('')}…`
}

function safeWebUrl(raw: string): string | null {
  try {
    // Resolved against our own origin so same-origin paths ("/landing/x.webp") work — an
    // absolute-only parse silently dropped them. The protocol check still runs afterwards, so a
    // javascript: or data: URL lifted from a caption is rejected exactly as before.
    const base = typeof window === 'undefined' ? 'https://astrail.xyz' : window.location.origin
    const parsed = new URL(raw, base)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null
  } catch {
    return null
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg'
let pinClipSeq = 0

/**
 * A teardrop pin whose head holds the Reel's own still.
 *
 * Built as SVG rather than the usual rotated-square CSS teardrop, for a specific reason: the
 * classic trick is `border-radius: 50% 50% 50% 0; transform: rotate(-45deg)`, and
 * marker-css-contract.test.ts forbids `transform` on a marker ROOT — Mapbox positions the root
 * with its own inline transform, and a second one drags the pin off its coordinate. SVG needs no
 * transform anywhere, and stays crisp at any density.
 *
 * The stop NUMBER survives as a badge even when there is a photo. It is not decoration: the
 * WebMCP tools address stops by it ("move stop 7"), and `buildTrailNumbers` is the shared
 * vocabulary between what the agent says and what the user can see.
 */
function buildPinGraphic(photoUrl: string | null, number: number | null): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 40 52')
  svg.setAttribute('class', 'constellation-pin__drop')
  svg.setAttribute('aria-hidden', 'true')

  const clipId = `pin-clip-${++pinClipSeq}`
  const defs = document.createElementNS(SVG_NS, 'defs')
  const clip = document.createElementNS(SVG_NS, 'clipPath')
  clip.setAttribute('id', clipId)
  const clipCircle = document.createElementNS(SVG_NS, 'circle')
  clipCircle.setAttribute('cx', '20'); clipCircle.setAttribute('cy', '19'); clipCircle.setAttribute('r', '14')
  clip.append(clipCircle); defs.append(clip); svg.append(defs)

  // Teardrop: a circular head over a tapered tip that lands exactly on the coordinate.
  const body = document.createElementNS(SVG_NS, 'path')
  body.setAttribute('d', 'M20 51C20 51 37 30.5 37 19A17 17 0 1 0 3 19C3 30.5 20 51 20 51Z')
  body.setAttribute('class', 'constellation-pin__drop-body')
  svg.append(body)

  if (photoUrl) {
    const img = document.createElementNS(SVG_NS, 'image')
    img.setAttribute('href', photoUrl)
    img.setAttribute('x', '6'); img.setAttribute('y', '5')
    img.setAttribute('width', '28'); img.setAttribute('height', '28')
    img.setAttribute('preserveAspectRatio', 'xMidYMid slice')
    img.setAttribute('clip-path', `url(#${clipId})`)
    // A dead Instagram CDN link must fall back to the number, not leave a hole in the pin.
    img.addEventListener('error', () => {
      img.remove()
      if (number !== null) svg.append(numberText(number))
    })
    svg.append(img)
    // Marks the frame as coming FROM a Reel. One Reel yields one cover, so stops from the same
    // Reel share it; the badge is what keeps that honest — the image is the source, not a
    // portrait of the venue.
    const ring = document.createElementNS(SVG_NS, 'circle')
    ring.setAttribute('cx', '20'); ring.setAttribute('cy', '19'); ring.setAttribute('r', '14')
    ring.setAttribute('class', 'constellation-pin__reel-ring')
    svg.append(ring)
  } else {
    // One universal placeholder for every stop with no Reel behind it — typed by the user, or
    // surfaced by Astrail's own research. Deliberately not a photograph: borrowing an image for
    // a place we have no picture of would be a claim we cannot support.
    const disc = document.createElementNS(SVG_NS, 'circle')
    disc.setAttribute('cx', '20'); disc.setAttribute('cy', '19'); disc.setAttribute('r', '13')
    disc.setAttribute('class', 'constellation-pin__placeholder')
    svg.append(disc)
    if (number !== null) svg.append(numberText(number))
  }
  return svg
}

/** Fork and knife, so an eat pin reads as "somewhere to eat" and not as an unexplained dot.
 *  Stroked rather than filled: at this size a filled cutlery shape turns to mud, while two
 *  strokes stay legible down to ~10px. */
function buildEatGlyph(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('class', 'eat-pin__glyph')
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS(SVG_NS, 'path')
  // Fork: three tines meeting a stem. Knife: a tapered blade over a stem.
  path.setAttribute('d', 'M4 3v3M6 3v3M8 3v3M6 6v7M11.5 3c1.2 0 1.8 1.4 1.8 2.6S12.7 8 11.5 8M11.5 8v5')
  svg.append(path)
  return svg
}

function numberText(number: number): SVGTextElement {
  const text = document.createElementNS(SVG_NS, 'text')
  text.setAttribute('x', '20'); text.setAttribute('y', '19')
  text.setAttribute('text-anchor', 'middle'); text.setAttribute('dominant-baseline', 'central')
  text.setAttribute('class', 'constellation-pin__drop-number')
  text.textContent = String(number)
  return text
}

/** Small badge so the stop number stays visible even when the head shows a photo. */
function buildPinBadge(number: number): HTMLElement {
  const badge = document.createElement('span')
  badge.className = 'constellation-pin__badge'
  badge.textContent = String(number)
  return badge
}

/**
 * Build popup DOM without parsing attacker-controlled caption text as markup.
 *
 * Every string goes in via textContent. Reel captions are written by strangers, so a popup that
 * used innerHTML here would be a stored-XSS hole on the one surface that promises provenance.
 */
function evidencePopupContent(
  model: PopupModel,
  onZoom: () => void,
): HTMLElement {
  const content = document.createElement('article')
  content.className = 'evidence-popup'

  if (model.imageUrl) {
    const safeImg = safeWebUrl(model.imageUrl)
    if (safeImg) {
      const img = document.createElement('img')
      img.className = 'evidence-popup__image'
      img.src = safeImg
      img.alt = ''            // decorative: the name is already the heading
      img.loading = 'lazy'
      // A dead Instagram CDN link must not leave a broken-image glyph in the card.
      img.addEventListener('error', () => img.remove())
      content.append(img)
    }
  }

  const eyebrow = document.createElement('p')
  eyebrow.className = 'evidence-popup__eyebrow'
  eyebrow.textContent = model.eyebrow

  const title = document.createElement('h3')
  title.className = 'evidence-popup__title'
  title.textContent = model.title

  content.append(eyebrow, title)

  if (model.subtitle) {
    const sub = document.createElement('p')
    sub.className = 'evidence-popup__subtitle'
    sub.textContent = model.subtitle
    content.append(sub)
  }

  if (model.where) {
    const where = document.createElement('p')
    where.className = 'evidence-popup__where'
    where.textContent = model.where
    content.append(where)
  }

  // The trip-relative block: what a generic place card cannot tell you.
  if (model.context.length) {
    const label = document.createElement('p')
    label.className = 'evidence-popup__label'
    label.textContent = 'On this trip'
    const list = document.createElement('ul')
    list.className = 'evidence-popup__context'
    for (const line of model.context) {
      const li = document.createElement('li')
      li.textContent = line
      list.append(li)
    }
    content.append(label, list)
  }

  if (model.eats.length) {
    const eatsLabel = document.createElement('p')
    eatsLabel.className = 'evidence-popup__label'
    eatsLabel.textContent = 'Where to eat'
    const list = document.createElement('ul')
    list.className = 'evidence-popup__context'
    for (const eat of model.eats) {
      const li = document.createElement('li')
      li.textContent = eat.note ? `${eat.name} · ${eat.note}` : eat.name
      list.append(li)
    }
    content.append(eatsLabel, list)
  }

  const evidenceLabel = document.createElement('p')
  evidenceLabel.className = 'evidence-popup__label'
  evidenceLabel.textContent = model.evidenceLabel

  const evidence = document.createElement('blockquote')
  evidence.className = 'evidence-popup__quote'
  evidence.textContent = model.evidence

  content.append(evidenceLabel, evidence)

  if (model.confidence !== null) {
    const confidence = document.createElement('p')
    confidence.className = 'evidence-popup__confidence'
    confidence.textContent = `Confidence ${model.confidence}%`
    content.append(confidence)
  }

  const actions = document.createElement('div')
  actions.className = 'evidence-popup__actions'

  const zoom = document.createElement('button')
  zoom.type = 'button'
  zoom.className = 'evidence-popup__zoom'
  zoom.textContent = 'Zoom in for 3D'
  zoom.addEventListener('click', onZoom)
  actions.append(zoom)

  // The Reel first and prominently: it is what the traveller actually saved.
  for (const link of [model.reel, model.reference]) {
    if (!link) continue
    const safeUrl = safeWebUrl(link.url)
    if (safeUrl) {
      const a = document.createElement('a')
      a.className =
        link === model.reel
          ? 'evidence-popup__source'
          : 'evidence-popup__source evidence-popup__source--secondary'
      a.href = safeUrl
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      a.textContent = link.label
      actions.append(a)
    } else {
      // A javascript: or data: URL lifted from a caption renders as inert text, never a link.
      const inert = document.createElement('p')
      inert.className = 'evidence-popup__source evidence-popup__source--invalid'
      inert.textContent = link.url
      actions.append(inert)
    }
  }

  content.append(actions)
  return content
}

/**
 * Split the continuous journey into day features. The connector from the previous day's last
 * stop to this day's first stop belongs to the arriving day, so adjacent features share an
 * endpoint and the route never breaks visually.
 */
function dayTrailFeatureCollection(
  bundle: TripBundle,
): GeoJSON.FeatureCollection<GeoJSON.LineString, { day_number: number; color: string }> {
  const dayNumbers = [...new Set(
    bundle.places
      .filter((tripPlace) => tripPlace.day_number !== null)
      .map((tripPlace) => tripPlace.day_number as number),
  )].sort((a, b) => a - b)
  const features: GeoJSON.Feature<
    GeoJSON.LineString,
    { day_number: number; color: string }
  >[] = []
  let previous: [number, number] | null = null

  dayNumbers.forEach((dayNumber, dayIndex) => {
    const dayPlaces = placesForDay(bundle, dayNumber)
      .filter((tripPlace) => hasRealCoords(tripPlace.place.lng, tripPlace.place.lat))
    if (dayPlaces.length === 0) return

    const withinDay = dayPlaces.length === 1
      ? [[dayPlaces[0].place.lng, dayPlaces[0].place.lat] as [number, number]]
      : trailCoordinates({ ...bundle, places: dayPlaces })
    const coordinates = previous ? [previous, ...withinDay] : withinDay
    previous = withinDay.at(-1) ?? previous
    if (coordinates.length < 2) return

    features.push({
      type: 'Feature',
      properties: {
        day_number: dayNumber,
        color: DAY_ROUTE_COLORS[dayIndex % DAY_ROUTE_COLORS.length],
      },
      geometry: { type: 'LineString', coordinates },
    })
  })

  return { type: 'FeatureCollection', features }
}

export default function TripMap({
  bundle, activeDayNumber, selectedPlaceId, onSelectPlace,
  selectedHotelId = null, layerMode = 'route',
  selectedRestaurantPlaceId = null,
  onSelectRestaurant,
  focusNonce = 0,
  fitNonce = 0,
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
}) {
  const { hasToken, ready, getMap, acquire, release, setMarkers } = useSharedMap()
  const routeIdsRef = useRef<string[]>([])
  const markerLabelsRef = useRef<HTMLElement[]>([])
  const activePopupRef = useRef<mapboxgl.Popup | null>(null)
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
  // Phone only: has the trip been framed against the sheet's REAL height yet? The first framing
  // usually runs before the sheet has measured itself (it settles after its transition), so the
  // first measurement triggers one proper re-fit; every later height change only eases padding.
  const fitWithSheetRef = useRef(false)
  // What the camera was last asked to show. The one-time re-fit above must re-frame THIS — a
  // selection, a day switch, or show_on_map can land between first framing and the sheet's first
  // measurement, and re-fitting the whole trip then would silently undo it. 'other' (a restaurant
  // or hotel hub flight) is left alone: only its padding eases.
  const cameraIntentRef = useRef<'trip' | 'day' | 'place' | 'other'>('trip')

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

  /* One popup at a time across every layer — a stop, a restaurant and a hotel opening three
     stacked cards over the map is how the panel-versus-map hierarchy falls apart. */
  function openSuggestionPopup(at: [number, number], content: HTMLElement) {
    const map = getMap()
    if (!map) return
    activePopupRef.current?.remove()
    activePopupRef.current = new mapboxgl.Popup({
      // Phones get the light kit card (phone-map-cards.css); desktop keeps the night card.
      className: layoutRef.current === 'mobile' ? 'astrail-evidence-popup phone-popup' : 'astrail-evidence-popup',
      closeButton: true, closeOnClick: true, offset: 16, maxWidth: '300px',
    }).setLngLat(at).setDOMContent(content).addTo(map)
  }

  function syncMarkerLabelVisibility() {
    const map = getMap()
    if (!map) return
    const byZoom = map.getZoom() >= LABEL_ZOOM
    // On a phone, close pins would stack their name pills into an unreadable pile, and the sheet
    // already names every stop: only the selected pin (or selected eat suggestion) is labelled.
    const phone = layoutRef.current === 'mobile'
    for (const label of markerLabelsRef.current) {
      const cls = label.classList.contains('eat-pin__label')
        ? 'eat-pin__label--visible'
        : 'constellation-pin__label--visible'
      label.classList.toggle(cls, phone ? label.dataset.selected === 'true' : byZoom)
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
      activePopupRef.current?.remove()
      activePopupRef.current = null
      markerLabelsRef.current = []
      clearRoutes()
      clearBuildings()
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
    // Read at draw time; a live layout change redraws (see the [layout] effect). Null — SSR and the
    // hydration pass — draws the desktop markers, the layout that has always existed.
    const phone = layoutRef.current === 'mobile'
    const markers = bundle.places
      .filter((tp) => hasRealCoords(tp.place.lng, tp.place.lat))
      .filter((tp) => layerMode !== 'hub' || !isHotelBasePlace(tp, basePlaceIds))
      .map((tp) => {
        const el = document.createElement('button')
        el.type = 'button'
        el.setAttribute('aria-label', tp.place.name)
        const number = trailNumbers.get(tp.id) ?? null
        el.className = [
          'constellation-pin',
          `constellation-pin--${tp.source_type}`,
          number === null ? 'constellation-pin--receding' : '',
          tp.place_id === selectedPlaceId ? 'constellation-pin--selected' : '',
        ].filter(Boolean).join(' ')
        // The Reel still that this stop came from, when we can attribute one honestly.
        // Same untrusted value the popup already gates (guardrail #11: Reel content is
        // attacker-controlled). It reaches us from Apify's Instagram scrape via the DB, and
        // an SVG <image href> is a resource load, so it must clear the same protocol check as
        // the popup's copy — gated HERE rather than inside buildPinGraphic so the badge below
        // agrees with it; disagreeing would print the stop number twice.
        // NB the empty-string guard: safeWebUrl('') resolves against our origin and returns a
        // valid URL, which would render a broken image instead of the placeholder.
        const rawPhoto = thumbnailFor(bundle, tp)
        const photoUrl = rawPhoto ? safeWebUrl(rawPhoto) : null
        if (phone) {
          // Placify-style avatar pin, centred on the coordinate (components/map/phone-pin.ts). Its
          // name pill is drawn only when selected, so it never joins the zoom-toggled labels.
          const pinEl = buildPhonePin({
            name: tp.place.name,
            label: shortPlaceName(tp.place.name),
            placeType: tp.place.place_type,
            sourceType: tp.source_type,
            number,
            selected: tp.place_id === selectedPlaceId,
            photoUrl,
          })
          pinEl.addEventListener('click', (e) => {
            e.stopPropagation()
            onSelectPlace(tp.place_id)
            // Phones: no evidence popup. The selected, expanded, scrolled-to sheet card IS the detail.
            activePopupRef.current?.remove()
            activePopupRef.current = null
          })
          return new mapboxgl.Marker({ element: pinEl, anchor: 'center' })
            .setLngLat([tp.place.lng, tp.place.lat]).addTo(map)
        }
        el.append(buildPinGraphic(photoUrl, number))
        if (photoUrl && number !== null) el.append(buildPinBadge(number))
        if (number !== null) {
          const label = document.createElement('span')
          label.className = 'constellation-pin__label'
          label.textContent = shortPlaceName(tp.place.name)
          label.title = tp.place.name
          label.dataset.selected = String(tp.place_id === selectedPlaceId)
          labels.push(label)
          el.append(label)
        }
        el.addEventListener('click', (e) => {
          e.stopPropagation()
          onSelectPlace(tp.place_id)
          // Phones: no evidence popup. The selected, expanded, scrolled-to sheet row IS the detail
          // (a popup here doubled it and sat under the agent chip). Desktop is unchanged.
          if (layoutRef.current === 'mobile') {
            activePopupRef.current?.remove()
            activePopupRef.current = null
            return
          }
          activePopupRef.current?.remove()
          activePopupRef.current = new mapboxgl.Popup({
            className: 'astrail-evidence-popup',
            closeButton: true,
            closeOnClick: true,
            offset: 18,
            maxWidth: '340px',
          })
            .setLngLat([tp.place.lng, tp.place.lat])
            .setDOMContent(
              evidencePopupContent(buildPopupModel(bundle, tp), () => {
                // Drop to street level and tilt: the fill-extrusion buildings switch on at z15,
                // so this is what turns "a dot on a map" into "what is actually around this place".
                map.flyTo({
                  center: [tp.place.lng, tp.place.lat],
                  zoom: 17,
                  pitch: 60,
                  bearing: -20,
                  duration: 1400,
                  essential: true,   // still runs under prefers-reduced-motion
                })
              }),
            )
            .addTo(map)
        })
        // anchor:'bottom' puts the teardrop's TIP on the coordinate. The default 'center' would
        // float the whole pin half its height above the place it is pointing at.
        return new mapboxgl.Marker({ element: el, anchor: 'bottom' })
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
        el.className = phone ? 'hotel-hub-pin phone-hit' : 'hotel-hub-pin'
        el.textContent = '🏨'
        const at: [number, number] = [hub.lng, hub.lat]
        el.addEventListener('click', (e) => {
          e.stopPropagation()
          openSuggestionPopup(at, buildStayPopup(hub))
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
        const el = document.createElement('button')
        el.type = 'button'
        el.setAttribute('aria-label', `${place.name}${r.cuisine ? `, ${r.cuisine}` : ''}`)
        el.className = [
          'eat-pin',
          place.id === selectedRestaurantPlaceId ? 'eat-pin--selected' : '',
          phone ? 'phone-hit' : '',
        ].filter(Boolean).join(' ')
        const chip = document.createElement('span')
        chip.className = 'eat-pin__chip'
        chip.append(buildEatGlyph())
        el.append(chip)
        const label = document.createElement('span')
        label.className = 'eat-pin__label'
        label.textContent = shortPlaceName(place.name)
        label.title = place.name
        label.dataset.selected = String(place.id === selectedRestaurantPlaceId)
        el.append(label)
        // Same zoom rule as the trail labels rather than :hover — a touch device has no hover,
        // so a hover-only name is a name that never appears on a phone.
        labels.push(label)
        el.addEventListener('click', (e) => {
          e.stopPropagation()
          onSelectRestaurant?.(place.id)      // keep the sidebar strip in step with the map
          openSuggestionPopup([place.lng, place.lat], buildEatPopup(r, place, nearName(r)))
        })
        return new mapboxgl.Marker({ element: el }).setLngLat([place.lng, place.lat]).addTo(map)
      })

    markerLabelsRef.current = labels     // assigned AFTER the eat labels join the list
    setMarkers([...markers, ...eatMarkers])
    syncMarkerLabelVisibility()
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
    const id = 'trip-trail'
    const casingId = `${id}-casing`
    const coreId = `${id}-core`
    map.addSource(id, {
      type: 'geojson',
      data: trail,
    })
    map.addLayer({
      id: casingId,
      type: 'line',
      source: id,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#C9974E', 'line-width': 9, 'line-opacity': 0.18 },
    })
    map.addLayer({
      id: coreId,
      type: 'line',
      source: id,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 2.6,
        'line-opacity': 0.95,
        'line-dasharray': [0.1, 1.6],
      },
    })
    routeIdsRef.current.push(id, casingId, coreId)
  }

  function drawBuildings() {
    const map = getMap()
    if (!map || buildingLayerAddedRef.current || map.getLayer(BUILDING_LAYER_ID)) return
    // Standard normally exposes vector buildings through `composite`. Other styles may not;
    // skipping the layer keeps those styles fully functional instead of failing the trip map.
    if (!map.getSource('composite')) return
    try {
      map.addLayer({
        id: BUILDING_LAYER_ID,
        type: 'fill-extrusion',
        source: 'composite',
        'source-layer': 'building',
        minzoom: 15,
        slot: 'middle',
        filter: ['==', ['get', 'extrude'], 'true'],
        paint: {
          'fill-extrusion-color': '#B89D78',
          'fill-extrusion-height': ['coalesce', ['get', 'height'], 8],
          'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0],
          'fill-extrusion-opacity': 0.42,
          'fill-extrusion-vertical-gradient': true,
        },
      })
      buildingLayerAddedRef.current = true
    } catch {
      // A style can expose `composite` without a `building` source-layer. That is a supported
      // no-buildings state; the route and DOM markers remain available above the canvas.
      buildingLayerAddedRef.current = false
    }
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
    const id = 'hotel-spokes'
    const casingId = `${id}-casing`
    const coreId = `${id}-core`
    map.addSource(id, { type: 'geojson', data: spokes })
    map.addLayer({
      id: casingId,
      type: 'line',
      source: id,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#C9974E', 'line-width': 6, 'line-opacity': 0.12 },
    })
    map.addLayer({
      id: coreId,
      type: 'line',
      source: id,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#C9974E', 'line-width': 1.6, 'line-opacity': 0.7 },
    })
    routeIdsRef.current.push(id, casingId, coreId)
  }

  // The map shows the itinerary trail OR the hotel hub-and-spokes, never both at once (decision #3).
  function drawRouteLayer() {
    if (layerMode === 'hub') drawSpokes()
    else drawTrail()
  }

  // The details panel overlays the map — the left 440px on desktop, the stop sheet on a phone —
  // so uniform padding would frame a day's pins right underneath it. The geometry (and why it is
  // measured against the CANVAS, capped at 70%) lives in ./frame-padding; this only measures.
  // `popupRoom` biases the pin into the upper third so an evidence popup has somewhere to go.
  function framePadding(opts?: { popupRoom?: boolean }) {
    const map = getMap()
    // Defensive: the map may not be ready, and framing must never throw — a padding helper
    // taking down the whole map effect would be a far worse bug than a loosely framed camera.
    const canvas = typeof map?.getCanvas === 'function' ? map.getCanvas() : null
    // `??`, not `||`: a canvas measured at ZERO (transiently, mid-layout) is a real measurement.
    // No canvas at all still falls back to the window.
    const win = typeof window === 'undefined' ? { w: 1024, h: 768 } : { w: window.innerWidth, h: window.innerHeight }
    return computeFramePadding({
      width: canvas?.clientWidth ?? win.w,
      height: canvas?.clientHeight ?? win.h,
      obstruction: getSheetObstruction(),
      popupRoom: opts?.popupRoom,
    })
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
      map.flyTo({ center: pts[0], zoom: 13.5, pitch: 45, padding: framePadding(), duration, essential: true })
      return
    }
    const bounds = new mapboxgl.LngLatBounds()
    pts.forEach((p) => bounds.extend(p))
    map.fitBounds(bounds, { padding: framePadding(), maxZoom: 14, pitch: 45, duration, essential: true })
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
      fitWithSheetRef.current = getSheetObstruction() > 0
      cameraIntentRef.current = 'trip'
      flyToTrip(inherited ? 900 : 2200)
    })
    return () => { cancelled = true; cancelAnimationFrame(raf) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  // A live breakpoint switch (rotation) must reconcile what the previous layout left on the map:
  // phones show no popup, and label visibility follows a different rule on each side. Neither
  // is redrawn on a layout change by itself (padding eases and resizes emit no zoom event).
  useEffect(() => {
    if (!ready) return
    if (layout === 'mobile') {
      activePopupRef.current?.remove()
      activePopupRef.current = null
    }
    // The two layouts draw different marker graphics (phone avatars vs desktop teardrops). Redraw
    // them — only them: no camera move, and setMarkers removes the old elements with their handlers.
    // Before the first framing there is nothing drawn yet; the [ready] draw reads the layout itself.
    if (framedRef.current) drawMarkers()
    syncMarkerLabelVisibility()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout])

  useEffect(() => {
    if (!ready) return
    const map = getMap()
    if (!map) return
    map.on('zoom', syncMarkerLabelVisibility)
    syncMarkerLabelVisibility()
    return () => { map.off('zoom', syncMarkerLabelVisibility) }
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
    if (layout === 'mobile' && !fitWithSheetRef.current && sheetObstruction > 0) {
      // The sheet's first real measurement: re-fit the trip into the band between the top bar
      // and the sheet, once. Easing padding alone keeps a zoom chosen for the whole canvas.
      fitWithSheetRef.current = true
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
  }, [sheetObstruction, layout])

  // Mapbox's attribution and logo are bottom-corner controls, and the phone sheet covers exactly
  // that strip. Publish the covered height on the map container; phone-map-cards.css lifts the
  // bottom controls by it, so the attribution rides just above the sheet in every state.
  // The container is remembered, not re-read on unmount: the provider may drop the map first.
  const obstructionHostRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const container = getMap()?.getContainer?.() ?? null
    if (container) obstructionHostRef.current = container
    container?.style?.setProperty?.('--sheet-obstruction', `${layout === 'mobile' ? sheetObstruction : 0}px`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, sheetObstruction, layout])
  useEffect(() => () => {
    obstructionHostRef.current?.style?.removeProperty?.('--sheet-obstruction')
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
      center: [place.lng, place.lat], zoom: 14, pitch: 55,
      padding: framePadding({ popupRoom: true }), duration, essential: true,
    })
    return true
  }

  useEffect(() => {
    if (!ready || !framedRef.current) return
    cameraIntentRef.current = 'day'
    flyToDay(1400)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDayNumber])

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
      map.flyTo({ center: [hub.lng!, hub.lat!], zoom: 14, pitch: 45, padding: framePadding(), duration: 900, essential: true })
    } else if (target === 'day') {
      cameraIntentRef.current = 'day'
      flyToDay(900)
    } else {
      cameraIntentRef.current = 'trip'
      flyToTrip(900)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitNonce])

  // Refresh marker selection and fly to the selected place.
  useEffect(() => {
    if (!ready) return
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
      center: [place.lng, place.lat], zoom: 15, pitch: 45,
      padding: framePadding({ popupRoom: true }), duration: 1200, essential: true,
    })
    const suggestion = bundle.restaurants.find((r) => r.restaurant_place_id === selectedRestaurantPlaceId)
    if (suggestion) {
      openSuggestionPopup([place.lng, place.lat], buildEatPopup(suggestion, place, nearName(suggestion)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRestaurantPlaceId])

  // Hotel-hub map (T9): redraw when the hub selection or the layer mode changes — swap the itinerary
  // trail for the hub's spokes (or back), (re)pin the hub, and toggle base-hotel marker suppression.
  // Gated on framedRef so it never races the first paint on a SHARED map that is already loaded (the
  // initial draw is owned by the [ready] effect above); by the time a user can toggle, framing is
  // long done. No camera move — toggling the view stays put (scope: T9).
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
      center: [hub.lng, hub.lat], zoom: 14, pitch: 45,
      padding: framePadding({ popupRoom: true }), duration: 1200, essential: true,
    })
    openSuggestionPopup([hub.lng, hub.lat], buildStayPopup(hub))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedHotelId, layerMode])

  if (!hasToken) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[var(--deep)]">
        <p className="type-label text-xs uppercase tracking-wide text-[var(--muted)]">Map unavailable — token missing</p>
      </div>
    )
  }
  // The canvas itself is the shell's fixed layer; this component only drives it.
  return null
}
