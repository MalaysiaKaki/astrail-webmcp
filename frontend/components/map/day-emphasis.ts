/**
 * The active day's route on the desktop map (plan v2 amendment 6).
 *
 * Three layers on the EXISTING trail source (`trip-trail`, one LineString per day with a
 * `day_number`), added by drawTrail and tracked in its route ids, so the route cleanup removes them
 * with the rest (route -> hub -> route, and leaving the page):
 *
 *   - a soft white casing and a solid, thicker brand-brass core, filtered to the active day;
 *   - a chevron symbol layer along that day's line, pointing in journey order.
 *
 * A day switch, a zoom or a rotation only re-filters and re-paints them (applyDayEmphasis): no
 * source is recreated and the road geometry, cross-day connectors and unrouted straight links are
 * untouched. On a phone the emphasis layers are hidden and the base trail paints exactly as before.
 */

export const TRAIL_SOURCE = 'trip-trail'
export const TRAIL_CORE = 'trip-trail-core'
export const ACTIVE_CASING = 'trip-trail-active-casing'
export const ACTIVE_CORE = 'trip-trail-active'
export const CHEVRONS = 'trip-trail-chevrons'
export const CHEVRON_IMAGE = 'astrail-route-chevron'

/** The brand route colour: a deeper brass than the day palette, readable on the dawn map. */
export const ACTIVE_ROUTE_COLOR = '#A8702C'
const BASE_CORE_OPACITY = 0.95
const BASE_CORE_WIDTH = 2.6
const DIMMED_CORE_OPACITY = 0.4
const DIMMED_CORE_WIDTH = 2

type EmphasisMap = {
  addLayer: (layer: Record<string, unknown>) => unknown
  getLayer: (id: string) => unknown
  setFilter: (id: string, filter: unknown) => unknown
  setPaintProperty: (id: string, name: string, value: unknown) => unknown
  setLayoutProperty: (id: string, name: string, value: unknown) => unknown
  hasImage?: (id: string) => boolean
  addImage?: (id: string, image: { width: number; height: number; data: Uint8Array }, opts?: { pixelRatio?: number }) => unknown
  removeImage?: (id: string) => unknown
}

const onDay = (day: number) => ['==', ['get', 'day_number'], day]
const offDay = (day: number) => ['!=', ['get', 'day_number'], day]

/**
 * A right-pointing chevron as raw RGBA, drawn procedurally (no canvas: it must work wherever the
 * map does, and a 2D context is not guaranteed). White with a dark hairline, so it reads on the
 * brass line at any zoom. 2x pixel ratio: 12 CSS px.
 */
export function chevronImage(size = 24): { width: number; height: number; data: Uint8Array } {
  const data = new Uint8Array(size * size * 4)
  // Two strokes meeting at the tip: (0.32,0.2) -> (0.68,0.5) -> (0.32,0.8), in unit coordinates.
  const segs: [number, number, number, number][] = [[0.32, 0.2, 0.68, 0.5], [0.68, 0.5, 0.32, 0.8]]
  const dist = (px: number, py: number, [ax, ay, bx, by]: [number, number, number, number]) => {
    const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)))
    return Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay)))
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.min(...segs.map((s) => dist((x + 0.5) / size, (y + 0.5) / size, s))) * size
      const i = (y * size + x) * 4
      const core = Math.max(0, Math.min(1, 2.2 - d))          // ~2px white stroke, anti-aliased
      const edge = Math.max(0, Math.min(1, 3.4 - d)) - core   // a darker rim around it
      const a = Math.min(1, core + edge * 0.55)
      if (a <= 0) continue
      const shade = core > 0 ? 255 : 90
      data[i] = shade; data[i + 1] = shade; data[i + 2] = core > 0 ? 255 : 60; data[i + 3] = Math.round(a * 255)
    }
  }
  return { width: size, height: size, data }
}

/** Adds the three emphasis layers on the trail source; returns their ids for the route cleanup. */
export function addDayEmphasisLayers(map: EmphasisMap, activeDay: number): string[] {
  if (map.addImage && map.hasImage && !map.hasImage(CHEVRON_IMAGE)) {
    map.addImage(CHEVRON_IMAGE, chevronImage(), { pixelRatio: 2 })
  }
  map.addLayer({
    id: ACTIVE_CASING, type: 'line', source: TRAIL_SOURCE, filter: onDay(activeDay),
    layout: { 'line-join': 'round', 'line-cap': 'round', visibility: 'none' },
    paint: { 'line-color': '#ffffff', 'line-width': 10, 'line-opacity': 0.75, 'line-blur': 1 },
  })
  map.addLayer({
    id: ACTIVE_CORE, type: 'line', source: TRAIL_SOURCE, filter: onDay(activeDay),
    layout: { 'line-join': 'round', 'line-cap': 'round', visibility: 'none' },
    paint: { 'line-color': ACTIVE_ROUTE_COLOR, 'line-width': 5.5, 'line-opacity': 0.95 },
  })
  map.addLayer({
    id: CHEVRONS, type: 'symbol', source: TRAIL_SOURCE, filter: onDay(activeDay),
    layout: {
      visibility: 'none',
      'symbol-placement': 'line',
      'symbol-spacing': 56,
      'icon-image': CHEVRON_IMAGE,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-rotation-alignment': 'map',
      'icon-keep-upright': false,
    },
  })
  return [ACTIVE_CASING, ACTIVE_CORE, CHEVRONS]
}

/**
 * Re-applies the emphasis for this day and layout. Desktop: the active day's casing, core and
 * chevrons visible, the base trail limited to the other days and dimmed. Phone: the emphasis layers
 * hidden, the base trail unfiltered at its usual paint. Safe to call when no trail is drawn (hub
 * mode, one stop): every call checks its layer first.
 */
export function applyDayEmphasis(map: EmphasisMap, activeDay: number, desktop: boolean): void {
  if (map.getLayer(TRAIL_CORE)) {
    map.setFilter(TRAIL_CORE, desktop ? offDay(activeDay) : null)
    map.setPaintProperty(TRAIL_CORE, 'line-opacity', desktop ? DIMMED_CORE_OPACITY : BASE_CORE_OPACITY)
    map.setPaintProperty(TRAIL_CORE, 'line-width', desktop ? DIMMED_CORE_WIDTH : BASE_CORE_WIDTH)
  }
  for (const id of [ACTIVE_CASING, ACTIVE_CORE, CHEVRONS]) {
    if (!map.getLayer(id)) continue
    map.setFilter(id, onDay(activeDay))
    map.setLayoutProperty(id, 'visibility', desktop ? 'visible' : 'none')
  }
}

/** Leaving the page: the shared map outlives it, so the chevron image goes too. */
export function removeChevronImage(map: EmphasisMap): void {
  if (map.hasImage?.(CHEVRON_IMAGE)) map.removeImage?.(CHEVRON_IMAGE)
}
