import { describe, expect, it } from 'vitest'
import { MULTI_SOURCE_RESPONSE, OTHER_TRIP_RESPONSE } from '../../src/__fixtures__/multi-source-bundle'
import { renderResult, widgetData } from '../../src/__tests__/tool-results'
import { EMPTY_TRIPS_PAGE, MORE_TRIPS_PAGE, STRESS_RESPONSE, TRIPS_PAGE_FIXTURE } from '../__fixtures__/trips-page'
import { backToList, contextRemoved, initialLibraryState, openTrip, tripModelContext, withTripError, withTripResult, withTripsResult } from '../state'

const page = (p: unknown) => ({ content: [{ type: 'text' as const, text: 'trips' }], structuredContent: p as Record<string, unknown> })
const A = MULTI_SOURCE_RESPONSE.bundle.trip.id
const B = OTHER_TRIP_RESPONSE.bundle.trip.id

describe('library state', () => {
  it('reads a trips page, notes more, and rejects anything else', () => {
    expect(withTripsResult(initialLibraryState(), page(TRIPS_PAGE_FIXTURE))).toMatchObject({ list: { kind: 'ready' }, hasMore: false })
    expect(withTripsResult(initialLibraryState(), page(MORE_TRIPS_PAGE)).hasMore).toBe(true)
    expect(withTripsResult(initialLibraryState(), page(EMPTY_TRIPS_PAGE)).trips).toEqual([])
    expect(withTripsResult(initialLibraryState(), page({ trips: 'nope' })).list.kind).toBe('error')
    expect(withTripsResult(initialLibraryState(), { isError: true, content: [{ type: 'text', text: 'Sign in again.' }] }).list).toEqual({ kind: 'error', message: 'Sign in again.' })
  })

  it('a late trips page keeps an open trip open', () => {
    const opened = openTrip(initialLibraryState(), A)
    expect(withTripsResult(opened, page(TRIPS_PAGE_FIXTURE)).detail).toEqual(opened.detail)
  })

  it('stale results are dropped by identity; only the latest selection renders', () => {
    const first = openTrip(initialLibraryState(), A)
    const second = openTrip(backToList(first), B)
    expect(withTripResult(second, first.detail!.seq, renderResult(MULTI_SOURCE_RESPONSE))).toBe(second)
    expect(withTripError(second, first.detail!.seq, 'x')).toBe(second)
    expect(withTripResult(second, second.detail!.seq, renderResult(OTHER_TRIP_RESPONSE)).detail?.phase.kind).toBe('ready')
  })

  it('a result for another trip than the one selected is malformed', () => {
    const s = openTrip(initialLibraryState(), A)
    expect(withTripResult(s, s.detail!.seq, renderResult(OTHER_TRIP_RESPONSE)).detail?.phase).toEqual({ kind: 'malformed' })
  })

  it('a result after back-to-list is stale', () => {
    const opened = openTrip(initialLibraryState(), A)
    const back = backToList(opened)
    expect(withTripResult(back, opened.detail!.seq, renderResult(MULTI_SOURCE_RESPONSE))).toBe(back)
  })
})

const TRIP = A

describe('trip model context', () => {
  it('attaches ids and a summary, labelled as user data, titled for the chip', () => {
    const ctx = tripModelContext(widgetData(MULTI_SOURCE_RESPONSE), 1)
    expect(ctx.structuredContent).toEqual({ trip_id: TRIP, day: 1 })
    const [block] = ctx.content
    expect(block.text).toContain(`trip_id ${TRIP}`)
    expect(block.text).toContain('Day 1')
    expect(block.text).toMatch(/user data/i)
    expect(block._meta['openai/title'].length).toBeGreaterThan(0)
  })

  it('is bounded and excludes evidence under stress', () => {
    const { text, _meta } = tripModelContext(widgetData(STRESS_RESPONSE), 1).content[0]
    expect(text.length).toBeLessThanOrEqual(1500)
    expect(_meta['openai/title'].length).toBeLessThanOrEqual(80)
    expect(text).not.toMatch(/EVIDENCE-SENTINEL/)
    const stops = text.split('\n').find((l) => l.startsWith('Stops on Day 1: '))
    expect(stops).toBeDefined()
    expect(stops).toMatch(/\(\+\d+ more\)\.$/)
    const names = stops!.replace('Stops on Day 1: ', '').replace(/ \(\+\d+ more\)\.$/, '').split(', ')
    expect(names.length).toBeLessThanOrEqual(12)
    for (const n of names) expect(n.length).toBeLessThanOrEqual(80)
    const tripLine = text.split('\n').find((l) => l.startsWith('Trip: '))!
    expect(tripLine.length).toBeLessThanOrEqual(80 + 80 + 120)
    expect(tripLine).not.toMatch(/[\r\n]/)
    expect(_meta['openai/title']).not.toMatch(/[\r\n]/)
    expect(text.split('\n').filter((l) => l.startsWith('Trip: '))).toHaveLength(1)
  })

  it('never yields an empty chip title', () => {
    const blank = { ...MULTI_SOURCE_RESPONSE, bundle: { ...MULTI_SOURCE_RESPONSE.bundle, trip: { ...MULTI_SOURCE_RESPONSE.bundle.trip, title: '  ' } } }
    expect(tripModelContext(widgetData(blank), null).content[0]._meta['openai/title']).toBe('Untitled trip')
  })

  it('detects removal only from an update that carries the key as null', () => {
    expect(contextRemoved({ 'openai/modelContext': null })).toBe(true)
    expect(contextRemoved({ theme: 'dark' })).toBe(false)
    expect(contextRemoved({ 'openai/modelContext': { updateId: 'u' } })).toBe(false)
    expect(contextRemoved(undefined)).toBe(false)
  })
})
