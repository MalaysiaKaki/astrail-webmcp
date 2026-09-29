import { describe, it, expect } from 'vitest'
import { TOKYO_TRIP } from '@/lib/trip/fixtures'
import { TOKYO_TRIP_WITH_HOTELS } from '@/lib/trip/fixtures/tokyo-hotels'
import { placesForDay } from '@/lib/trip/selectors'
import { planReveal, TRIP_TABS, parseTripTab, type RevealView } from '../reveal'

const base: RevealView = { activeDayNumber: 1, tab: 'for-you', panelOpen: false, listView: 'stay' }

describe('planReveal (amendment 5: the frozen reveal contract)', () => {
  it('selects the owning day, switches to the Trip tab, reopens the panel and leaves Stay', () => {
    const lastDay = TOKYO_TRIP.days.at(-1)!.day_number!
    const stop = placesForDay(TOKYO_TRIP, lastDay)[0]
    expect(planReveal(TOKYO_TRIP, stop.place_id, base)).toEqual({
      activeDayNumber: lastDay, tab: 'trip', panelOpen: true, listView: 'stops', selectedPlaceId: stop.place_id,
    })
  })

  it('an undayed place keeps the day (there is none to switch to) and still opens the Trip tab', () => {
    expect(planReveal(TOKYO_TRIP_WITH_HOTELS, 'pl_hotelbase', { ...base, activeDayNumber: 2 })).toEqual({
      activeDayNumber: 2, tab: 'trip', panelOpen: true, listView: 'stops', selectedPlaceId: 'pl_hotelbase',
    })
  })

  it('refuses a place that is not on this trip, so a stale id never clears the view', () => {
    expect(planReveal(TOKYO_TRIP, 'pl_nowhere', base)).toBeNull()
  })

  it('is idempotent: revealing again from the revealed state plans the same view', () => {
    const stop = placesForDay(TOKYO_TRIP, 2)[0]
    const once = planReveal(TOKYO_TRIP, stop.place_id, base)!
    expect(planReveal(TOKYO_TRIP, stop.place_id, once)).toEqual(once)
  })
})

describe('trip tabs', () => {
  it('has three tabs in order, and parses only those', () => {
    expect(TRIP_TABS.map((t) => t.id)).toEqual(['trip', 'for-you', 'build'])
    expect(parseTripTab('for-you')).toBe('for-you')
    expect(parseTripTab('build')).toBe('build')
    expect(parseTripTab('TRIP')).toBeNull()
    expect(parseTripTab('')).toBeNull()
    expect(parseTripTab(null)).toBeNull()
  })
})
