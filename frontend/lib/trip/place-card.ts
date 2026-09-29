import type { HotelSuggestion, Place, RestaurantSuggestion, TripBundle, TripPlace } from './backend-types'
import { buildPlaceIndex, findTripPlace, hasRealCoords, orderedDays, orderedTripPlaces, restaurantsForDay } from './selectors'

/**
 * The desktop map place card's model (A10; Codex map-card review §3).
 *
 * The card that is open is an explicit descriptor, separate from selection: the selected ids mean
 * different things (a default-selected latent hotel, a stop left selected after a day switch) and
 * cannot say "closed" or "reopened on the same place". The nonce is the opening request, so a
 * second open of the same place is a new request. `opener` says where focus goes back on close.
 */
export type OpenCardKind = 'stop' | 'eat' | 'hotel'
export type CardOpener = 'pin' | 'row' | 'other'
export type OpenCard = { kind: OpenCardKind; id: string; nonce: number; opener?: CardOpener }

/** A stop's place in the ONE journey order the pins paint, or null when it is not on it. */
export type StopSequence = { number: number; total: number; day: number; prev: string | null; next: string | null }

export function stopSequence(bundle: TripBundle, placeId: string): StopSequence | null {
  const route = orderedTripPlaces(bundle)
  const i = route.findIndex((tp) => tp.place_id === placeId)
  if (i < 0) return null
  return {
    number: i + 1,
    total: route.length,
    day: route[i].day_number as number,
    prev: route[i - 1]?.place_id ?? null,
    next: route[i + 1]?.place_id ?? null,
  }
}

/**
 * The real suggestion rows anchored to this stop (`near_place_id`), and how many the stop's day
 * has in all for "See all N". Never the day's other suggestions: an unanchored row says nothing
 * about proximity to THIS stop (popup-model's fallback did, and it is not reused here).
 */
export function anchoredEats(bundle: TripBundle, tp: TripPlace): {
  near: RestaurantSuggestion[]
  dayTotal: number
  dayNumber: number | null
} {
  if (tp.day_number === null) return { near: [], dayTotal: 0, dayNumber: null }
  const day = orderedDays(bundle).find((d) => d.day_number === tp.day_number)
  const forDay = day ? restaurantsForDay(bundle, day.id) : []
  return { near: forDay.filter((r) => r.near_place_id === tp.place_id), dayTotal: forDay.length, dayNumber: tp.day_number }
}

export type CardEntity =
  | { kind: 'stop'; tp: TripPlace; at: [number, number] }
  | { kind: 'eat'; suggestion: RestaurantSuggestion; place: Place; at: [number, number] }
  | { kind: 'hotel'; hotel: HotelSuggestion; at: [number, number] }

/**
 * What an open card shows, read from the CURRENT bundle. Null when an edit removed the entity or
 * left it without a location: the card then closes (or its detail moves to the sidebar).
 */
export function openCardEntity(bundle: TripBundle, card: OpenCard): CardEntity | null {
  if (card.kind === 'stop') {
    const tp = findTripPlace(bundle, card.id)
    if (!tp || !hasRealCoords(tp.place.lng, tp.place.lat)) return null
    return { kind: 'stop', tp, at: [tp.place.lng, tp.place.lat] }
  }
  if (card.kind === 'eat') {
    const suggestion = bundle.restaurants.find((r) => r.restaurant_place_id === card.id)
    const place = bundle.suggestion_places.find((p) => p.id === card.id) ?? buildPlaceIndex(bundle).get(card.id)
    if (!suggestion || !place || !hasRealCoords(place.lng, place.lat)) return null
    return { kind: 'eat', suggestion, place, at: [place.lng, place.lat] }
  }
  const hotel = bundle.hotels.find((h) => h.id === card.id)
  if (!hotel || hotel.geo_status !== 'placed' || hotel.lng === null || hotel.lat === null) return null
  if (!hasRealCoords(hotel.lng, hotel.lat)) return null
  return { kind: 'hotel', hotel, at: [hotel.lng, hotel.lat] }
}
