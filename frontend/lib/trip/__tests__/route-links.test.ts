import { describe, it, expect } from 'vitest'
import { TOKYO_TRIP } from '@/lib/trip/fixtures'
import { buildRouteLinks } from '@/lib/trip/route-links'
import { buildPlaceIndex, legsForDay, orderedDays, placesForDay } from '@/lib/trip/selectors'

const index = buildPlaceIndex(TOKYO_TRIP)
const linksFor = (dayNumber: number) => {
  const day = orderedDays(TOKYO_TRIP).find((d) => d.day_number === dayNumber)!
  return buildRouteLinks(placesForDay(TOKYO_TRIP, dayNumber), legsForDay(TOKYO_TRIP, day.id), index)
}

describe('buildRouteLinks', () => {
  it('folds the demo cross-day, no-route leg in as the arrival into day 2 — warning and origin kept', () => {
    const { above, trailing } = linksFor(2)
    expect(trailing).toEqual([])
    const arrival = above[0]!
    expect(arrival.leg.id).toBe('leg_3')
    expect(arrival.leg.status).toBe('no_route')
    expect(arrival.leg.warning).toMatch(/Long transfer/)
    // Its origin is on ANOTHER day, so the reader cannot see it above: name it.
    expect(arrival.from).toBe('Ichiran Shibuya')
  })

  it('omits the origin between two stops on the same list', () => {
    const { above } = linksFor(1)
    const hop = above.find((l) => l?.leg.id === 'leg_1')!
    expect(hop.from).toBeNull()
  })

  it('trails a leg no stop on the list claims rather than dropping it', () => {
    const [first] = placesForDay(TOKYO_TRIP, 1)
    const { above, trailing } = buildRouteLinks([first], legsForDay(TOKYO_TRIP, 'day_1'), index)
    expect(above).toEqual([null])
    expect(trailing.map((t) => t.leg.id).sort()).toEqual(['leg_1', 'leg_2'])
  })
})
