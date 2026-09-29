import type { Place, RestaurantSuggestion, TripBundle } from '@/lib/trip/backend-types'
import type mapboxgl from 'mapbox-gl'
import { hasRealCoords, placesForDay, trailCoordinates } from '@/lib/trip/selectors'
import { nativeBuildings } from './camera-mode'

/* Pure helpers for TripMap's markers and trail, moved out of TripMap.tsx (plan v2 A9) so the
   component stays under the 800-line cap as the desktop emphasis joins it. Unchanged. */

export const DAY_ROUTE_COLORS = [
  '#F4D7A1', // light starlight brass
  '#C9974E', // Astrail brass
  '#8F632C', // dark bronze
  '#E7B866', // bright amber
  '#A97842', // warm umber
  '#FFE2AA', // pale gold
] as const

export const BUILDING_LAYER_ID = 'astrail-3d-buildings'
const LABEL_MAX_CHARS = 24

export function shortPlaceName(name: string): string {
  const chars = Array.from(name)
  if (chars.length <= LABEL_MAX_CHARS) return name
  return `${chars.slice(0, LABEL_MAX_CHARS - 1).join('')}…`
}

export function safeWebUrl(raw: string): string | null {
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
/** Fork and knife, so an eat pin reads as "somewhere to eat" and not as an unexplained dot.
 *  Stroked rather than filled: at this size a filled cutlery shape turns to mud, while two
 *  strokes stay legible down to ~10px. */
export function buildEatGlyph(): SVGSVGElement {
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

/**
 * Split the continuous journey into day features. The connector from the previous day's last
 * stop to this day's first stop belongs to the arriving day, so adjacent features share an
 * endpoint and the route never breaks visually.
 */
export function dayTrailFeatureCollection(
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

/**
 * The custom 3D building layer, only as the fallback for a style without its own. True when it was
 * added by this call. Mapbox Standard draws its own buildings, and adding ours as well would
 * z-fight them.
 */
export function addBuildingLayer(map: mapboxgl.Map): boolean {
  if (map.getLayer(BUILDING_LAYER_ID)) return false
  if (nativeBuildings(map)) return false
  // Standard normally exposes vector buildings through `composite`. Other styles may not;
  // skipping the layer keeps those styles fully functional instead of failing the trip map.
  if (!map.getSource('composite')) return false
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
    return true
  } catch {
    // A style can expose `composite` without a `building` source-layer. That is a supported
    // no-buildings state; the route and DOM markers remain available above the canvas.
    return false
  }
}

/** A "Where to eat" marker: the fork-and-knife chip and its name label (shown when selected). */
export function buildEatPin(r: RestaurantSuggestion, place: Place, selected: boolean): { el: HTMLButtonElement; label: HTMLElement } {
  const el = document.createElement('button')
  el.type = 'button'
  el.setAttribute('aria-label', `${place.name}${r.cuisine ? `, ${r.cuisine}` : ''}`)
  el.className = ['eat-pin', selected ? 'eat-pin--selected' : '', 'phone-hit'].filter(Boolean).join(' ')
  const chip = document.createElement('span')
  chip.className = 'eat-pin__chip'
  chip.append(buildEatGlyph())
  el.append(chip)
  const label = document.createElement('span')
  label.className = 'eat-pin__label'
  label.textContent = shortPlaceName(place.name)
  label.title = place.name
  label.dataset.selected = String(selected)
  el.append(label)
  return { el, label }
}
