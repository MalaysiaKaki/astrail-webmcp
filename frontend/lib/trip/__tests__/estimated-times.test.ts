import { describe, it, expect } from 'vitest'
import { deriveEstimatedTimes, fmtClock } from '@/lib/trip/estimated-times'
import { buildRouteLinks } from '@/lib/trip/route-links'
import { buildPlaceIndex, legsForDay, placesForDay } from '@/lib/trip/selectors'
import { TOKYO_TRIP } from '@/lib/trip/fixtures'

/* Migrated from ItineraryCards.test "estimated times" (plan A6): the view is retired, the
   derivation is kept. Same fixtures, same numbers, asserted on the derived values instead of the
   rendered column. Astrail holds no dwell data, so no view renders these today. */
const day1 = placesForDay(TOKYO_TRIP, 1)
const idx = buildPlaceIndex(TOKYO_TRIP)
const above = (legs = legsForDay(TOKYO_TRIP, 'day_1')) => buildRouteLinks(day1, legs, idx).above

describe('deriveEstimatedTimes', () => {
  it('derives nothing when no dwell durations are supplied', () => {
    expect(deriveEstimatedTimes(day1, above(), undefined).every((e) => e === null)).toBe(true)
  })

  /* 09:00 start, +60 min at Akasaka, + leg_1's 150 s (the "3 min" the folded leg prints), +30 min. */
  it('derives times from the real dwell and travel durations', () => {
    const dwell = new Map([[day1[0].place_id, 3600], [day1[1].place_id, 1800]])
    const est = deriveEstimatedTimes(day1, above(), dwell)
    expect(fmtClock(est[0]!.start)).toBe('09:00')
    expect(fmtClock(est[0]!.end!)).toBe('10:00')
    expect(fmtClock(est[1]!.start)).toBe('10:03')
    expect(fmtClock(est[1]!.end!)).toBe('10:33')
  })

  it('gives a stop with unknown dwell an arrival but no departure', () => {
    const est = deriveEstimatedTimes(day1, above(), new Map([[day1[0].place_id, 3600]]))
    expect(fmtClock(est[1]!.start)).toBe('10:03')
    expect(est[1]!.end).toBeNull()
  })

  it('treats an empty dwell map as no data at all, not as a 09:00 start', () => {
    expect(deriveEstimatedTimes(day1, above(), new Map()).every((e) => e === null)).toBe(true)
  })

  it('stops estimating past a gap in the travel data', () => {
    const dwell = new Map([[day1[0].place_id, 3600], [day1[1].place_id, 1800]])
    const est = deriveEstimatedTimes(day1, above([]), dwell)
    expect(fmtClock(est[0]!.start)).toBe('09:00')
    expect(est[1]).toBeNull()
  })
})
