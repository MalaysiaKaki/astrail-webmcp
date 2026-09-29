import { TOKYO_TRIP } from '@/lib/trip/fixtures'
import type { MemoryWrite } from './memory-events'

/**
 * SAMPLE DATA for the anonymous demo trip only (`/app/trip/demo`). Never shown on a real trip:
 * `useTripMemoryWrites` returns it only when the sample flag is set AND the trip id is the demo's,
 * and the For you tab labels it "Sample". The demo has no account, so there is no
 * `memory_events` row to read; this shows what a planned-with-preferences trip records.
 *
 * The text is the demo trip's own stated preferences, as a real write would carry the user's
 * explicit words verbatim (backend/pipeline/preferences.py `_write_add_intent`).
 */
export const DEMO_MEMORY_TRIP_ID = TOKYO_TRIP.trip.id

export const DEMO_MEMORY_WRITES: readonly MemoryWrite[] = [
  {
    id: 'sample-memory-write-1',
    texts: ['Walkable days, ramen, not too rushed, mid-range budget.'],
    createdAt: TOKYO_TRIP.trip.updated_at,
    markedFailed: false,
  },
]
