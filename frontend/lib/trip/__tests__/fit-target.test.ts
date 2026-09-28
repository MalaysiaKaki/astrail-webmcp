import { describe, it, expect } from 'vitest'
import { fitTarget } from '@/lib/trip/fit-target'
import { TOKYO_TRIP } from '@/lib/trip/fixtures'
import { TOKYO_TRIP_WITH_HOTELS } from '@/lib/trip/fixtures/tokyo-hotels'
import { recommendedHotelId } from '@/lib/trip/selectors'
import type { TripBundle } from '@/lib/trip/backend-types'

const unlocated = (b: TripBundle): TripBundle => ({
  ...b,
  places: b.places.map((tp) => ({ ...tp, place: { ...tp.place, lat: 0, lng: 0 } })),
})

describe('fitTarget', () => {
  it('fits the active day in route mode when it has located stops', () => {
    expect(fitTarget(TOKYO_TRIP, 1, 'route', null)).toBe('day')
  })

  it('fits the whole trip when the active day has no located stop', () => {
    const b: TripBundle = {
      ...TOKYO_TRIP,
      places: TOKYO_TRIP.places.map((tp) => (tp.day_number === 1 ? { ...tp, place: { ...tp.place, lat: 0, lng: 0 } } : tp)),
    }
    expect(fitTarget(b, 1, 'route', null)).toBe('trip')
    expect(fitTarget(TOKYO_TRIP, 99, 'route', null)).toBe('trip')
  })

  it('fits the hub in Stay (hub) mode when the selected hotel is placed', () => {
    const hub = recommendedHotelId(TOKYO_TRIP_WITH_HOTELS)
    expect(hub).not.toBeNull()
    expect(fitTarget(TOKYO_TRIP_WITH_HOTELS, 1, 'hub', hub)).toBe('hub')
  })

  it('falls back to the route targets in hub mode when the hotel has no location', () => {
    const unplaced = TOKYO_TRIP_WITH_HOTELS.hotels.find((h) => h.geo_status !== 'placed')
    expect(unplaced).toBeDefined()
    expect(fitTarget(TOKYO_TRIP_WITH_HOTELS, 1, 'hub', unplaced!.id)).toBe('day')
  })

  it('is null when nothing on the trip is located, so the control can hide', () => {
    expect(fitTarget(unlocated(TOKYO_TRIP), 1, 'route', null)).toBeNull()
    expect(fitTarget({ ...TOKYO_TRIP, places: [] }, 1, 'route', null)).toBeNull()
  })
})
