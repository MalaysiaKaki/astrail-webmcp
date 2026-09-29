import { describe, it, expect, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import {
  fetchTripMemoryWrites, rowsToMemoryWrites, useTripMemoryWrites,
  type MemoryEventRow, type MemoryEventsReader,
} from '@/lib/trip/insights/memory-events'
import { DEMO_MEMORY_WRITES } from '@/lib/trip/insights/demo-memory'
import { TOKYO_TRIP } from '@/lib/trip/fixtures'

const TRIP = 'trip-1'
const OWNER = 'user-1'

const row = (over: Partial<MemoryEventRow> = {}): MemoryEventRow => ({
  id: 'me-1', user_id: OWNER, trip_id: TRIP, event_type: 'learned',
  learned_facts_json: [{ fact: 'vegetarian, no early starts' }],
  created_at: '2026-09-20T10:00:00Z', ...over,
})

/** A fake of the one PostgREST chain the reader uses, recording every call. */
function fakeReader(results: { data: unknown[] | null; error: unknown }[]) {
  const calls: { table: string; select: string; filters: [string, string, unknown][] }[] = []
  let i = 0
  const reader = {
    from(table: string) {
      const call = { table, select: '', filters: [] as [string, string, unknown][] }
      calls.push(call)
      const q = {
        eq: (c: string, v: unknown) => { call.filters.push(['eq', c, v]); return q },
        in: (c: string, v: unknown) => { call.filters.push(['in', c, v]); return q },
        order: (c: string) => { call.filters.push(['order', c, null]); return q },
        then: (res: (v: { data: unknown[] | null; error: unknown }) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve(results[Math.min(i++, results.length - 1)]).then(res, rej),
      }
      return { select: (s: string) => { call.select = s; return q } }
    },
  } as unknown as MemoryEventsReader
  return { reader, calls }
}

describe('rowsToMemoryWrites', () => {
  it('keeps the user text verbatim with its date, and marks failed adds unconfirmed', () => {
    const writes = rowsToMemoryWrites([
      row(),
      row({ id: 'me-2', event_type: 'failed', learned_facts_json: [{ fact: 'halal only' }], created_at: '2026-09-21T10:00:00Z' }),
    ], { tripId: TRIP, ownerId: OWNER })
    expect(writes).toEqual([
      { id: 'me-1', texts: ['vegetarian, no early starts'], createdAt: '2026-09-20T10:00:00Z', confirmed: true },
      { id: 'me-2', texts: ['halal only'], createdAt: '2026-09-21T10:00:00Z', confirmed: false },
    ])
  })

  it('shows an orphan intent (learned row, add never confirmed) as a write attempt, nothing more', () => {
    // The row is inserted BEFORE the Mem0 add, so a crash leaves it behind. It still only says
    // "sent"; the component never claims it was retained.
    expect(rowsToMemoryWrites([row()], { tripId: TRIP, ownerId: OWNER })).toHaveLength(1)
  })

  it('never shows another owner\'s rows, another trip\'s, or non-write event types', () => {
    const writes = rowsToMemoryWrites([
      row({ id: 'a', user_id: 'someone-else' }),
      row({ id: 'b', trip_id: 'other-trip' }),
      row({ id: 'c', event_type: 'cleared' }),
      row({ id: 'd', event_type: 'reconciled' }),
    ], { tripId: TRIP, ownerId: OWNER })
    expect(writes).toEqual([])
  })

  it('drops malformed or blank fact payloads rather than rendering them', () => {
    const writes = rowsToMemoryWrites([
      row({ id: 'a', learned_facts_json: 'not an array' }),
      row({ id: 'b', learned_facts_json: [{ fact: '  ' }, { fact: 42 }, null, 'bare'] }),
      row({ id: 'c', learned_facts_json: [{ fact: '  walkable  ' }, { nope: 1 }] }),
    ], { tripId: TRIP, ownerId: OWNER })
    expect(writes.map((w) => [w.id, w.texts])).toEqual([['c', ['walkable']]])
  })
})

describe('fetchTripMemoryWrites', () => {
  it('queries memory_events for this trip, write types only, oldest first', async () => {
    const { reader, calls } = fakeReader([{ data: [row()], error: null }])
    const state = await fetchTripMemoryWrites(reader, TRIP, OWNER)
    expect(state.status).toBe('recorded')
    expect(calls[0].table).toBe('memory_events')
    expect(calls[0].select).toContain('learned_facts_json')
    expect(calls[0].filters).toContainEqual(['eq', 'trip_id', TRIP])
    expect(calls[0].filters).toContainEqual(['in', 'event_type', ['learned', 'failed']])
  })

  it('is unavailable on a PostgREST error or a thrown transport error', async () => {
    const { reader } = fakeReader([{ data: null, error: { message: 'boom' } }])
    expect(await fetchTripMemoryWrites(reader, TRIP, OWNER)).toEqual({ status: 'unavailable' })
    const throwing: MemoryEventsReader = { from: () => { throw new Error('offline') } }
    expect(await fetchTripMemoryWrites(throwing, TRIP, OWNER)).toEqual({ status: 'unavailable' })
  })

  it('is none when nothing is recorded (including only other owners\' rows)', async () => {
    expect(await fetchTripMemoryWrites(fakeReader([{ data: [], error: null }]).reader, TRIP, OWNER)).toEqual({ status: 'none' })
    expect(await fetchTripMemoryWrites(fakeReader([{ data: [row({ user_id: 'x' })], error: null }]).reader, TRIP, OWNER)).toEqual({ status: 'none' })
  })
})

describe('useTripMemoryWrites', () => {
  it('loads, then Check again re-queries and picks up a write that landed after the result', async () => {
    const { reader, calls } = fakeReader([{ data: [], error: null }, { data: [row()], error: null }])
    const { result } = renderHook(() => useTripMemoryWrites({ tripId: TRIP, ownerId: OWNER, sample: false, reader }))
    expect(result.current.state.status).toBe('loading')
    await waitFor(() => expect(result.current.state.status).toBe('none'))
    await act(async () => { await result.current.checkAgain() })
    expect(result.current.state.status).toBe('recorded')
    expect(calls).toHaveLength(2)
  })

  it('re-queries on remount (the tab reopened), so an empty read is never cached', async () => {
    const { reader, calls } = fakeReader([{ data: [], error: null }, { data: [row()], error: null }])
    const first = renderHook(() => useTripMemoryWrites({ tripId: TRIP, ownerId: OWNER, sample: false, reader }))
    await waitFor(() => expect(first.result.current.state.status).toBe('none'))
    first.unmount()
    const second = renderHook(() => useTripMemoryWrites({ tripId: TRIP, ownerId: OWNER, sample: false, reader }))
    await waitFor(() => expect(second.result.current.state.status).toBe('recorded'))
    expect(calls).toHaveLength(2)
  })

  it('surfaces a failed read as unavailable, and Check again can recover it', async () => {
    const { reader } = fakeReader([{ data: null, error: { message: 'x' } }, { data: [row()], error: null }])
    const { result } = renderHook(() => useTripMemoryWrites({ tripId: TRIP, ownerId: OWNER, sample: false, reader }))
    await waitFor(() => expect(result.current.state.status).toBe('unavailable'))
    await act(async () => { await result.current.checkAgain() })
    expect(result.current.state.status).toBe('recorded')
  })

  it('the demo never queries and shows the sample fixture', async () => {
    const reader = { from: vi.fn() } as unknown as MemoryEventsReader
    const { result } = renderHook(() => useTripMemoryWrites({ tripId: TOKYO_TRIP.trip.id, ownerId: TOKYO_TRIP.trip.user_id, sample: true, reader }))
    expect(result.current.state).toEqual({ status: 'sample', writes: DEMO_MEMORY_WRITES })
    await act(async () => { await result.current.checkAgain() })
    expect(reader.from).not.toHaveBeenCalled()
  })

  it('never shows the sample fixture on a real trip, even if the sample flag is set by mistake', async () => {
    const reader = { from: vi.fn() } as unknown as MemoryEventsReader
    const { result } = renderHook(() => useTripMemoryWrites({ tripId: TRIP, ownerId: OWNER, sample: true, reader }))
    expect(result.current.state).toEqual({ status: 'none' })
    expect(reader.from).not.toHaveBeenCalled()
  })

  it('ignores a stale response when the trip changes mid-flight', async () => {
    let resolveFirst: (v: { data: unknown[]; error: null }) => void = () => {}
    const slow = new Promise<{ data: unknown[]; error: null }>((r) => { resolveFirst = r })
    let calls = 0
    const reader: MemoryEventsReader = {
      from: () => {
        // The first read (trip-a) hangs until released; later reads answer empty at once.
        const answer = calls++ === 0 ? slow : Promise.resolve({ data: [], error: null })
        const q = {
          eq: () => q, in: () => q, order: () => q,
          then: (res: (v: unknown) => unknown) => answer.then(res),
        }
        return { select: () => q }
      },
    } as unknown as MemoryEventsReader
    const { result, rerender } = renderHook(
      ({ tripId }) => useTripMemoryWrites({ tripId, ownerId: OWNER, sample: false, reader }),
      { initialProps: { tripId: 'trip-a' } },
    )
    rerender({ tripId: 'trip-b' })
    await waitFor(() => expect(result.current.state.status).toBe('none'))
    await act(async () => { resolveFirst({ data: [row({ trip_id: 'trip-a' })], error: null }) })
    expect(result.current.state.status).toBe('none')
  })
})
