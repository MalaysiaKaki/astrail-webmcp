/**
 * Per-day slices of the widget's bundle, and the selected-day rules (PLAN §6 step 4).
 *
 * Everything here is keyed by DAY NUMBER, never by array index: a bounded view can start at Day 2
 * or skip a day, and an index would quietly point at the wrong one. The slices reuse the app's own
 * selectors over the real McpTripBundle (assignable to TripBundle), so nothing is cast.
 */
import { z } from 'zod'
import type {
  RestaurantSuggestion, TransportLeg, TripBundle, TripDay, TripPlace,
} from '@/lib/trip/backend-types'
import {
  legsForDay, orderedDays, placesForDay, restaurantsForDay,
} from '@/lib/trip/selectors'

export type DaySlice = {
  day: TripDay
  places: TripPlace[]
  legs: TransportLeg[]
  restaurants: RestaurantSuggestion[]
}

/** The day numbers this view actually carries, ascending and unique. */
export function availableDayNumbers(bundle: TripBundle): number[] {
  return [...new Set(orderedDays(bundle).map((d) => d.day_number))]
}

export function daySlice(bundle: TripBundle, dayNumber: number): DaySlice | null {
  const day = orderedDays(bundle).find((d) => d.day_number === dayNumber)
  if (!day) return null
  return {
    day,
    places: placesForDay(bundle, dayNumber),
    legs: legsForDay(bundle, day.id),
    restaurants: restaurantsForDay(bundle, day.id),
  }
}

/** Stops the trip holds but has not put on a day. Shown by name, never given a trail number. */
export function unscheduledPlaces(bundle: TripBundle): TripPlace[] {
  return bundle.places.filter((tp) => tp.day_number === null)
}

// ---- Host widget state (ChatGPT's window.openai; feature-detected, absent on other hosts) ----

export type WidgetDayState = { trip_id: string; day: number }

const widgetDayStateSchema = z.object({ trip_id: z.string(), day: z.number().int() })

type OpenAiWidgetGlobals = {
  widgetState?: unknown
  setWidgetState?: (state: WidgetDayState) => unknown
}

declare global {
  interface Window {
    openai?: OpenAiWidgetGlobals
  }
}

/** The host-restored `{trip_id, day}`, or null. The host hands back whatever was stored, so it is
    validated like any other external input. */
export function readWidgetDayState(): WidgetDayState | null {
  if (typeof window === 'undefined') return null
  const parsed = widgetDayStateSchema.safeParse(window.openai?.widgetState)
  return parsed.success ? parsed.data : null
}

export function persistWidgetDayState(state: WidgetDayState): void {
  if (typeof window === 'undefined') return
  const setWidgetState = window.openai?.setWidgetState
  if (typeof setWidgetState !== 'function') return
  try {
    void Promise.resolve(setWidgetState.call(window.openai, state)).catch(() => {
      console.warn('[astrail-widget] could not persist the selected day')
    })
  } catch {
    console.warn('[astrail-widget] could not persist the selected day')
  }
}

/**
 * The day the card opens on, or null when the view has no days:
 *   1. `focusDay`, when this view carries it;
 *   2. a restored day, only when it belongs to THIS trip and this view carries it — a stale state
 *      from an earlier trip (or a day the trip no longer has) must not win;
 *   3. otherwise the earliest day this view carries.
 */
export function initialDayNumber({ available, focusDay, tripId, restored }: {
  available: number[]
  focusDay: number | null
  tripId: string
  restored: WidgetDayState | null
}): number | null {
  if (available.length === 0) return null
  if (focusDay !== null && available.includes(focusDay)) return focusDay
  if (restored && restored.trip_id === tripId && available.includes(restored.day)) return restored.day
  return Math.min(...available)
}
