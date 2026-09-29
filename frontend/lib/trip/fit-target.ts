import type { TripBundle } from './backend-types'
import { hasRealCoords, placesForDay, selectedHotel } from './selectors'

/**
 * What the phone's "Fit" control frames right now, or null when nothing on the trip has a
 * location (the control hides then — a button that cannot move the camera is a dead button).
 *
 * - `hub`: in the hotel (hub) layer, the selected hotel, when it was placed on the map.
 * - `day`: the active day's located stops.
 * - `trip`: every located stop, when the active day has none.
 *
 * One function for both sides: the workspace decides whether to show the control and what to call
 * it, and TripMap decides where to fly, so the label can never promise a different target than
 * the camera goes to.
 */
export type FitTarget = 'hub' | 'day' | 'trip'

export function fitTarget(
  bundle: TripBundle,
  activeDayNumber: number,
  layerMode: 'route' | 'hub',
  selectedHotelId: string | null,
): FitTarget | null {
  if (layerMode === 'hub') {
    const hub = selectedHotel(bundle, selectedHotelId)
    if (hub && hub.geo_status === 'placed' && hub.lng !== null && hub.lat !== null && hasRealCoords(hub.lng, hub.lat)) {
      return 'hub'
    }
  }
  const located = (tp: TripBundle['places'][number]) => hasRealCoords(tp.place.lng, tp.place.lat)
  if (placesForDay(bundle, activeDayNumber).some(located)) return 'day'
  if (bundle.places.some(located)) return 'trip'
  return null
}

/** The Fit control's accessible name for a target: it says what the camera will frame. */
export function fitLabel(target: FitTarget): string {
  if (target === 'hub') return 'Fit map to the hotel'
  if (target === 'day') return 'Fit map to the day'
  return 'Fit map to the whole trip'
}
