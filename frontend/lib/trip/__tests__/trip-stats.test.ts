import { describe, it, expect } from 'vitest'
import { tripStats, formatRoutedDistance } from '@/lib/trip/trip-stats'
import { TOKYO_TRIP } from '@/lib/trip/fixtures'
import type { TransportLeg, TripBundle } from '@/lib/trip/backend-types'

const withLegs = (legs: TransportLeg[]): TripBundle => ({ ...TOKYO_TRIP, transport_legs: legs })
const leg = (over: Partial<TransportLeg>): TransportLeg => ({ ...TOKYO_TRIP.transport_legs[0], ...over })

describe('tripStats', () => {
  it('counts places, days and legs, and sums only routed legs with a known distance', () => {
    // Fixture: two routed legs (130 m walk + 9.5 km drive) and one no-route leg with no distance.
    expect(tripStats(TOKYO_TRIP)).toEqual({
      places: TOKYO_TRIP.places.length,
      days: TOKYO_TRIP.days.length,
      legs: 3,
      routedMeters: 9630,
    })
  })

  it('skips a routed leg with an unknown distance and any non-routed leg that carries one (partial distance)', () => {
    const stats = tripStats(withLegs([
      leg({ id: 'a', status: 'ok', distance_meters: 2000 }),
      leg({ id: 'b', status: 'ok', distance_meters: null }),
      leg({ id: 'c', status: 'no_route', distance_meters: 50000 }),
      leg({ id: 'd', status: 'failed', distance_meters: 7000 }),
    ]))
    expect(stats.legs).toBe(4)
    expect(stats.routedMeters).toBe(2000)
  })

  it('has no routed distance at all when the trip has no legs', () => {
    expect(tripStats(withLegs([]))).toMatchObject({ legs: 0, routedMeters: null })
  })

  it('has no routed distance when no leg was routed, rather than a zero', () => {
    expect(tripStats(withLegs([leg({ status: 'no_route', distance_meters: null })])).routedMeters).toBeNull()
  })

  it('still counts days that have no date', () => {
    const b = { ...TOKYO_TRIP, days: TOKYO_TRIP.days.map((d) => ({ ...d, day_date: null })) }
    expect(tripStats(b).days).toBe(TOKYO_TRIP.days.length)
  })
})

describe('formatRoutedDistance', () => {
  it('says "—" for no distance and never "0 km"', () => {
    expect(formatRoutedDistance(null)).toBe('—')
    expect(formatRoutedDistance(0)).toBe('—')
  })

  it('keeps one decimal under 10 km, whole kilometres above, and metres under 1 km', () => {
    expect(formatRoutedDistance(9630)).toBe('9.6 km')
    expect(formatRoutedDistance(42_400)).toBe('42 km')
    expect(formatRoutedDistance(130)).toBe('130 m')
  })
})
