import type { TripBundle } from './backend-types'
import { hasRealCoords } from './selectors'
import { stopProvenance } from './stop-provenance'

/**
 * The phone's "About this trip" stat grid: Places, Days, Legs and Routed distance.
 *
 * Routed distance sums ONLY legs the router actually routed (status 'ok') AND that carry a
 * distance (plan amendment 4). A no-route leg is not zero kilometres — it is an unknown — and a
 * trip whose legs are all unknown has no routed distance, not "0 km". Hence null, not 0.
 */
export type TripStats = {
  places: number
  days: number
  legs: number
  /** Sum of routed, known leg distances in metres; null when there is none. */
  routedMeters: number | null
}

export function tripStats(bundle: TripBundle): TripStats {
  const known = bundle.transport_legs
    .filter((l) => l.status === 'ok' && typeof l.distance_meters === 'number' && Number.isFinite(l.distance_meters))
    .map((l) => l.distance_meters as number)
  return {
    places: bundle.places.length,
    days: bundle.days.length,
    legs: bundle.transport_legs.length,
    routedMeters: known.length ? known.reduce((a, b) => a + b, 0) : null,
  }
}

/** "9.6 km", "42 km", "130 m" — or "—" when there is nothing honest to show (never "0 km"). */
export function formatRoutedDistance(meters: number | null): string {
  if (meters === null || meters <= 0) return '—'
  if (meters < 1000) return `${Math.round(meters)} m`
  const km = meters / 1000
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`
}

/**
 * The stops behind "Some stops are missing details": each stop with no map location, or a Reel
 * stop with no caption quote (the same test the stop card's "No caption evidence" uses). Empty
 * when every stop is whole — the trip's gaps are then elsewhere (weather, restaurants, a route).
 */
export function stopsMissingDetails(bundle: TripBundle): { id: string; name: string; lacks: string[] }[] {
  return bundle.places
    .map((tp) => {
      const lacks: string[] = []
      if (!hasRealCoords(tp.place.lng, tp.place.lat)) lacks.push('no map location')
      if (stopProvenance(tp).kind === 'none') lacks.push('no caption evidence')
      return { id: tp.id, name: tp.place.name, lacks }
    })
    .filter((s) => s.lacks.length > 0)
}
