import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  availableDayNumbers, daySlice, initialDayNumber, persistWidgetDayState, readWidgetDayState,
  unscheduledPlaces,
} from '../day-view'
import {
  DAY_TWO_START_RESPONSE, FIXTURE_IDS, MULTI_SOURCE_RESPONSE,
} from '../__fixtures__/multi-source-bundle'

const TRIP = FIXTURE_IDS.trip

describe('initialDayNumber', () => {
  const base = { available: [1, 2, 3], focusDay: null, tripId: TRIP, restored: null }

  it('opens on focus_day when the view carries it', () => {
    expect(initialDayNumber({ ...base, focusDay: 3 })).toBe(3)
  })

  it('ignores a focus_day the view does not carry and falls back to the earliest day', () => {
    expect(initialDayNumber({ ...base, focusDay: 9 })).toBe(1)
  })

  it('focus_day wins over a restored day', () => {
    expect(initialDayNumber({ ...base, focusDay: 2, restored: { trip_id: TRIP, day: 3 } })).toBe(2)
  })

  it('restores a day only for the same trip', () => {
    expect(initialDayNumber({ ...base, restored: { trip_id: TRIP, day: 3 } })).toBe(3)
    expect(initialDayNumber({ ...base, restored: { trip_id: FIXTURE_IDS.otherTrip, day: 3 } })).toBe(1)
  })

  it('drops a stale restored day the trip no longer has', () => {
    expect(initialDayNumber({ ...base, restored: { trip_id: TRIP, day: 5 } })).toBe(1)
  })

  it('uses the minimum day NUMBER, not index 0, for a view starting at Day 2', () => {
    expect(initialDayNumber({ ...base, available: availableDayNumbers(DAY_TWO_START_RESPONSE.bundle) })).toBe(2)
  })

  it('returns null when the view has no days', () => {
    expect(initialDayNumber({ ...base, available: [], focusDay: 1 })).toBeNull()
  })
})

describe('day slices', () => {
  const { bundle } = MULTI_SOURCE_RESPONSE

  it('slices stops, legs and restaurants by day number', () => {
    const day1 = daySlice(bundle, 1)!
    expect(day1.places.map((tp) => tp.place.name)).toEqual(['Sensō-ji', 'Nakamise-dori', 'Kappabashi Kitchen Street'])
    expect(day1.legs.map((l) => l.id)).toEqual([FIXTURE_IDS.leg1, FIXTURE_IDS.leg2])
    expect(day1.restaurants.map((r) => r.id)).toEqual([FIXTURE_IDS.restImahan])
    const day3 = daySlice(bundle, 3)!
    expect(day3.places).toEqual([])
    expect(day3.legs).toHaveLength(1)
    expect(daySlice(bundle, 7)).toBeNull()
  })

  it('lists stops with no day separately', () => {
    expect(unscheduledPlaces(bundle).map((tp) => tp.place.name)).toEqual(['Shibuya Sky'])
  })
})

describe('host widget state', () => {
  afterEach(() => {
    delete window.openai
  })

  it('is absent on hosts without window.openai', () => {
    expect(readWidgetDayState()).toBeNull()
    expect(() => persistWidgetDayState({ trip_id: TRIP, day: 2 })).not.toThrow()
  })

  it('reads a valid state and rejects a malformed one', () => {
    window.openai = { widgetState: { trip_id: TRIP, day: 2 } }
    expect(readWidgetDayState()).toEqual({ trip_id: TRIP, day: 2 })
    window.openai = { widgetState: { trip_id: TRIP, day: '2' } }
    expect(readWidgetDayState()).toBeNull()
  })

  it('persists through setWidgetState when the host offers it', () => {
    const setWidgetState = vi.fn()
    window.openai = { setWidgetState }
    persistWidgetDayState({ trip_id: TRIP, day: 3 })
    expect(setWidgetState).toHaveBeenCalledWith({ trip_id: TRIP, day: 3 })
  })
})
