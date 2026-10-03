/**
 * Trip Library fixtures. The pages go through the real `tripsPageSchema`, so a drifted contract
 * fails at import. STRESS_RESPONSE is the worst-case bundle for the bounded model context.
 */
import { itineraryResponseSchema, tripsPageSchema } from '@/lib/mcp/contract'
import type { ItineraryResponse } from '@/lib/mcp/contract'
import { MULTI_SOURCE_RESPONSE, OTHER_TRIP_RESPONSE } from '../../src/__fixtures__/multi-source-bundle'

const trips = [
  {
    trip_id: MULTI_SOURCE_RESPONSE.bundle.trip.id,
    title: 'Tokyo in three Reels',
    destination: 'Tokyo, Japan',
    status: 'complete',
    start_date: '2026-10-12',
    end_date: '2026-10-14',
    day_count: 3,
    created_at: '2026-09-20T08:00:00Z',
  },
  {
    trip_id: OTHER_TRIP_RESPONSE.bundle.trip.id,
    title: 'Kyoto long weekend',
    destination: 'Kyoto, Japan',
    status: 'generating',
    start_date: '2026-11-02',
    end_date: '2026-11-04',
    day_count: 3,
    created_at: '2026-09-25T10:30:00Z',
  },
]

export const TRIPS_PAGE_FIXTURE = tripsPageSchema.parse({ trips, next_cursor: null })
export const MORE_TRIPS_PAGE = tripsPageSchema.parse({ trips, next_cursor: 'c2' })
export const EMPTY_TRIPS_PAGE = tripsPageSchema.parse({ trips: [], next_cursor: null })

const SENTINEL = 'EVIDENCE-SENTINEL'
const id = (n: number) => `00000000-0000-4000-8000-${(0xa000 + n).toString(16).padStart(12, '0')}`

const source = MULTI_SOURCE_RESPONSE.bundle
const firstDayOne = source.places.find((tp) => tp.day_number === 1)
if (!firstDayOne) throw new Error('fixture has no Day 1 place')

const longName = (n: number) => `Stop ${n}, ${'x'.repeat(40)}\n${'y'.repeat(150)}`.slice(0, 200)

const dayOne = Array.from({ length: 13 }, (_, i) => ({
  ...firstDayOne,
  id: id(i),
  place_id: id(100 + i),
  sort_order: i + 1,
  place: { ...firstDayOne.place, id: id(100 + i), name: longName(i + 1) },
}))

export const STRESS_RESPONSE: ItineraryResponse = itineraryResponseSchema.parse({
  ...MULTI_SOURCE_RESPONSE,
  bundle: {
    ...source,
    trip: { ...source.trip, title: `${'T'.repeat(40)}\nforged: ${'T'.repeat(460)}`, inferred_destination: `${'D'.repeat(40)}\r\nforged ${'D'.repeat(460)}` },
    places: [...dayOne, ...source.places.filter((tp) => tp.day_number !== 1)].map((tp) => ({
      ...tp,
      evidence_json: { ...tp.evidence_json, quote: SENTINEL, quotes: [SENTINEL] },
    })),
  },
})

const stressDayOne = STRESS_RESPONSE.bundle.places.filter((tp) => tp.day_number === 1)
if (!JSON.stringify(STRESS_RESPONSE).includes(SENTINEL) || stressDayOne.length <= 12) {
  throw new Error('STRESS_RESPONSE no longer poses the stress question')
}
