import { describe, expect, it } from 'vitest'
import { itineraryResponseSchema, renderSummarySchema } from '@/lib/mcp/contract'
import {
  DAY_TWO_START_RESPONSE, MULTI_SOURCE_RESPONSE, NO_DAYS_RESPONSE, OTHER_TRIP_RESPONSE,
  TRUNCATED_RESPONSE,
} from '../__fixtures__/multi-source-bundle'
import { renderResult } from './tool-results'

const FIXTURES = {
  MULTI_SOURCE_RESPONSE, TRUNCATED_RESPONSE, DAY_TWO_START_RESPONSE, NO_DAYS_RESPONSE, OTHER_TRIP_RESPONSE,
}

describe('widget fixtures', () => {
  it.each(Object.entries(FIXTURES))('%s validates against itineraryResponseSchema', (_, response) => {
    const parsed = itineraryResponseSchema.safeParse(response)
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true)
  })

  it.each(Object.entries(FIXTURES))('%s summarizes into a valid render summary', (_, response) => {
    expect(renderSummarySchema.safeParse(renderResult(response, 2).structuredContent).success).toBe(true)
  })

  // The fixture's premise, asserted where it is defined: every case the widget tests rely on is
  // actually present, so trimming the fixture cannot leave those tests green and watching nothing.
  it('covers every shape the widget has to render', () => {
    const { bundle } = MULTI_SOURCE_RESPONSE
    const sources = new Set(bundle.places.map((tp) => tp.source_type))
    expect(sources).toEqual(new Set(['reel_extracted', 'user_requested', 'agent_suggested']))
    expect(bundle.places.some((tp) => tp.source_type === 'user_requested' && tp.evidence_json.evidence_kind === 'reel_quote')).toBe(true)
    expect(bundle.places.some((tp) => tp.day_number === null)).toBe(true)
    expect(bundle.days.map((d) => d.day_number)).toEqual([1, 2, 3])
    const suggestionIds = new Set(bundle.suggestion_places.map((p) => p.id))
    const placeIds = new Set(bundle.places.map((tp) => tp.place_id))
    expect(bundle.restaurants.some((r) => r.restaurant_place_id !== null
      && suggestionIds.has(r.restaurant_place_id) && !placeIds.has(r.restaurant_place_id))).toBe(true)
    expect(bundle.hotels.some((h) => h.geo_status === 'placed' && h.rank !== null)).toBe(true)
    expect(bundle.hotels.some((h) => h.geo_status === 'placed' && h.rank === null)).toBe(true)
    expect(bundle.hotels.some((h) => h.geo_status === 'unresolved')).toBe(true)
    const day3 = bundle.days.find((d) => d.day_number === 3)!
    expect(bundle.places.some((tp) => tp.day_number === 3)).toBe(false)
    expect(bundle.transport_legs.some((l) => l.trip_day_id === day3.id)).toBe(true)
  })

  it('variants keep referential integrity after dropping days', () => {
    for (const { bundle } of [TRUNCATED_RESPONSE, DAY_TWO_START_RESPONSE, NO_DAYS_RESPONSE]) {
      const dayIds = new Set(bundle.days.map((d) => d.id))
      expect(bundle.transport_legs.every((l) => l.trip_day_id !== null && dayIds.has(l.trip_day_id))).toBe(true)
      expect(bundle.restaurants.every((r) => r.trip_day_id !== null && dayIds.has(r.trip_day_id))).toBe(true)
      const days = new Set(bundle.days.map((d) => d.day_number))
      expect(bundle.places.every((tp) => tp.day_number === null || days.has(tp.day_number))).toBe(true)
    }
    expect(TRUNCATED_RESPONSE.truncated.days).toBe(true)
    expect(DAY_TWO_START_RESPONSE.bundle.days[0].day_number).toBe(2)
  })
})
