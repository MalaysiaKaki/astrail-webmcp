import { describe, it, expect } from 'vitest'
import { TOKYO_TRIP } from '@/lib/trip/fixtures'
import { TOKYO_TRIP_WITH_HOTELS } from '@/lib/trip/fixtures/tokyo-hotels'
import { anchoredEats, openCardEntity, stopSequence } from '@/lib/trip/place-card'

/* A10 item 2: the desktop map card's model. "Stop N of M" and prev/next follow the ONE journey
   order the pins paint (orderedTripPlaces / buildTrailNumbers), across days; eats are the real
   suggestion rows ANCHORED to this stop; an open card is resolved against the latest bundle. */

describe('stopSequence', () => {
  it('numbers a stop in whole-trip journey order, with its day', () => {
    expect(stopSequence(TOKYO_TRIP, 'pl_sandolab')).toEqual({
      number: 3, total: 5, day: 1, prev: 'pl_hpcafe', next: 'pl_ichiran',
    })
  })

  it('crosses the day boundary: the last stop of day 1 leads to the first of day 2', () => {
    expect(stopSequence(TOKYO_TRIP, 'pl_ichiran')!.next).toBe('pl_disney')
    expect(stopSequence(TOKYO_TRIP, 'pl_disney')).toMatchObject({ number: 5, day: 2, prev: 'pl_ichiran', next: null })
  })

  it('disables navigation at the ends', () => {
    expect(stopSequence(TOKYO_TRIP, 'pl_akasaka')!.prev).toBeNull()
  })

  it('keeps undayed and unlocated places out of the numbered sequence', () => {
    expect(stopSequence(TOKYO_TRIP_WITH_HOTELS, 'pl_hotelbase')).toBeNull()
    const gaps = structuredClone(TOKYO_TRIP)
    gaps.places[1].place.lat = 0
    gaps.places[1].place.lng = 0
    expect(stopSequence(gaps, 'pl_hpcafe')).toBeNull()
    expect(stopSequence(gaps, 'pl_akasaka')).toMatchObject({ number: 1, total: 4, next: 'pl_sandolab' })
  })
})

describe('anchoredEats', () => {
  it('lists only suggestions anchored to this stop, with the day\'s total for "See all"', () => {
    const sando = TOKYO_TRIP.places.find((p) => p.place_id === 'pl_sandolab')!
    const r = anchoredEats(TOKYO_TRIP, sando)
    expect(r.near.map((x) => x.id).sort()).toEqual(['rest_1', 'rest_2'])
    expect(r.dayTotal).toBe(TOKYO_TRIP.restaurants.filter((x) => x.trip_day_id === 'day_1').length)
  })

  it('never borrows another stop\'s suggestions to fill the card (no proximity is claimed)', () => {
    const akasaka = TOKYO_TRIP.places.find((p) => p.place_id === 'pl_akasaka')!
    expect(anchoredEats(TOKYO_TRIP, akasaka).near).toEqual([])
  })

  it('an undayed place has no day to list', () => {
    const base = TOKYO_TRIP_WITH_HOTELS.places.find((p) => p.place_id === 'pl_hotelbase')!
    expect(anchoredEats(TOKYO_TRIP_WITH_HOTELS, base)).toEqual({ near: [], dayTotal: 0, dayNumber: null })
  })
})

describe('openCardEntity (content is derived from the latest bundle, never captured)', () => {
  it('resolves a located stop', () => {
    const e = openCardEntity(TOKYO_TRIP, { kind: 'stop', id: 'pl_akasaka', nonce: 1 })
    expect(e?.kind).toBe('stop')
  })

  it('answers null once an edit removes the stop, or leaves it without a location', () => {
    const removed = structuredClone(TOKYO_TRIP)
    removed.places = removed.places.filter((p) => p.place_id !== 'pl_akasaka')
    expect(openCardEntity(removed, { kind: 'stop', id: 'pl_akasaka', nonce: 1 })).toBeNull()
    const unlocated = structuredClone(TOKYO_TRIP)
    unlocated.places[0].place.lat = Number.NaN
    expect(openCardEntity(unlocated, { kind: 'stop', id: 'pl_akasaka', nonce: 1 })).toBeNull()
  })

  it('resolves an eat card by its restaurant place, with its suggestion row', () => {
    const e = openCardEntity(TOKYO_TRIP, { kind: 'eat', id: 'pl_popo', nonce: 2 })
    expect(e).toMatchObject({ kind: 'eat', suggestion: { id: 'rest_2' } })
  })

  it('resolves a hotel only when it is placed', () => {
    const e = openCardEntity(TOKYO_TRIP_WITH_HOTELS, { kind: 'hotel', id: 'hotel_1', nonce: 3 })
    expect(e?.kind).toBe('hotel')
    const unplaced = structuredClone(TOKYO_TRIP_WITH_HOTELS)
    unplaced.hotels[0].geo_status = 'unresolved'
    expect(openCardEntity(unplaced, { kind: 'hotel', id: 'hotel_1', nonce: 3 })).toBeNull()
  })
})
