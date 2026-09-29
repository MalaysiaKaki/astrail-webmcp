import { describe, it, expect } from 'vitest'
import { TOKYO_TRIP } from '@/lib/trip/fixtures'
import type { TripBundle, TripInspirationItem } from '@/lib/trip/backend-types'
import { heroCovers, heroStats } from '../hero'

const item = (n: number, over: Partial<TripInspirationItem> = {}): TripInspirationItem => ({
  id: `i${n}`, trip_id: 't', item_type: 'reel', source: 'user_paste',
  normalized_reel_url: `https://www.instagram.com/reel/R${n}/`, reel_cache_id: null,
  requested_place_text: null, resolved_place_id: null, status: 'scraped',
  thumbnail_url: `https://cdn.example.com/r${n}.jpg`, ...over,
} as TripInspirationItem)

const withInspiration = (inspiration: TripInspirationItem[]): TripBundle => ({ ...TOKYO_TRIP, inspiration })

describe('heroCovers', () => {
  it('shows up to four covers and counts the rest as +N', () => {
    const c = heroCovers(withInspiration([1, 2, 3, 4, 5, 6].map((n) => item(n))))
    expect(c.covers).toHaveLength(4)
    expect(c.reels).toBe(6)
    expect(c.extra).toBe(2)
  })

  it('dedupes Reels by canonical URL (a trailing slash is the same Reel)', () => {
    const c = heroCovers(withInspiration([
      item(1), item(1, { id: 'dup', normalized_reel_url: 'https://www.instagram.com/reel/R1' }), item(2),
    ]))
    expect(c.reels).toBe(2)
    expect(c.covers).toHaveLength(2)
  })

  it('skips requested-place rows and hostile thumbnails, but still counts a Reel with no cover', () => {
    const c = heroCovers(withInspiration([
      item(1), item(2, { thumbnail_url: 'javascript:alert(1)' }), item(3, { thumbnail_url: null }),
      item(4, { item_type: 'requested_place', normalized_reel_url: null, thumbnail_url: null }),
    ]))
    expect(c.reels).toBe(3)
    expect(c.covers).toEqual(['https://cdn.example.com/r1.jpg'])
    expect(c.extra).toBe(2)
  })

  it('no Reels: no covers, no count', () => {
    expect(heroCovers(withInspiration([]))).toEqual({ covers: [], reels: 0, extra: 0 })
  })
})

describe('heroStats', () => {
  it('places, days and routed km, never "0 km"', () => {
    const s = heroStats(TOKYO_TRIP)
    expect(s.map((x) => x.label)).toEqual(['Places', 'Days', 'Routed'])
    expect(s[0].value).toBe(String(TOKYO_TRIP.places.length))
    const none = heroStats({ ...TOKYO_TRIP, transport_legs: [] })
    expect(none.find((x) => x.label === 'Routed')).toBeUndefined()
  })
})
