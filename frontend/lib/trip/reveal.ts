import type { TripBundle } from './backend-types'
import { findTripPlace } from './selectors'

/**
 * The trip panel's tabs (plan 2026-09-29 desktop trip page v2): the itinerary, the memory story,
 * and how Astrail built the trip. `id` is also the `?tab=` value.
 */
export const TRIP_TABS = [
  { id: 'trip', label: 'Trip' },
  { id: 'for-you', label: 'For you' },
  { id: 'build', label: 'How it was built' },
] as const

export type TripTab = (typeof TRIP_TABS)[number]['id']

/** A `?tab=` (or stored) value as a tab, or null when it names none. Exact match only. */
export function parseTripTab(raw: string | null | undefined): TripTab | null {
  return TRIP_TABS.find((t) => t.id === raw)?.id ?? null
}

/**
 * Show one place in the panel, from anywhere: a map pin, `show_on_map`, a "Picked for you" link.
 *
 * FROZEN (amendment 5): Tab B's For you tab calls it as `onRevealPlace`. It selects the place's
 * own day, switches to the Trip tab, reopens a collapsed panel, leaves the Stay list, and brings
 * the stop's card (or the undayed "Selected place" card) into view once it has mounted. Tab
 * changes never remount the map or interrupt the camera. List taps do NOT go through it: a tap
 * inside the list is already where it needs to be.
 */
export type RevealPlace = (placeId: string) => void

/** The panel state a reveal reads and writes. */
export type RevealView = {
  activeDayNumber: number
  tab: TripTab
  panelOpen: boolean
  listView: 'stops' | 'stay'
}

/**
 * The view that shows `placeId`, or null when the place is not on this trip (a stale id must not
 * clear what the user is looking at). An undayed place keeps the current day: there is no day to
 * switch to, and the Trip tab pins it above the list instead.
 */
export function planReveal(
  bundle: TripBundle,
  placeId: string,
  view: RevealView,
): (RevealView & { selectedPlaceId: string }) | null {
  const tp = findTripPlace(bundle, placeId)
  if (!tp) return null
  return {
    activeDayNumber: typeof tp.day_number === 'number' ? tp.day_number : view.activeDayNumber,
    tab: 'trip',
    panelOpen: true,
    listView: 'stops',
    selectedPlaceId: placeId,
  }
}
