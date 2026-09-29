'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MOCK_AUTH_ENABLED } from '@/lib/auth/mock-auth'
import { DEMO_MEMORY_TRIP_ID, DEMO_MEMORY_WRITES } from './demo-memory'

/**
 * "Preferences Astrail tried to add to your memory": a read of `memory_events` (plan
 * amendment 1). Local row type: the table has no mirror in backend-types.ts and this round does
 * not add one (migration 20260701131304, RLS `memory_events_select_own`).
 *
 * What a row means, and what it does not. The backend inserts `event_type='learned'` BEFORE the
 * Mem0 add is attempted (C11 intent-first), with the user's own explicit text in
 * `learned_facts_json`, then flips it to 'failed' if the add errors. Neither value proves an
 * outcome (backend/pipeline/preferences.py): an insert timeout can commit the row yet skip the
 * add, a crash leaves an orphan intent, and a failed mark-failed update leaves 'learned' after an
 * add that errored. So every row is a recorded write ATTEMPT with an unconfirmed outcome:
 *   - 'learned' = an attempt was recorded. Not "sent", not "saved".
 *   - 'failed'  = an attempt was recorded and the backend later marked it failed.
 *   - no row    = no attempt recorded (memory-only or inferred trip, memory off, or not yet: the
 *     write-back runs AFTER the terminal result, so an early read can be empty).
 */
export type MemoryEventRow = {
  id: string
  user_id: string
  trip_id: string | null
  event_type: string
  learned_facts_json: unknown
  created_at: string
}

export type MemoryWrite = {
  id: string
  /** The user's own words, verbatim (trimmed). Plain text only, never markup. */
  texts: string[]
  createdAt: string
  /** True for a 'failed' row. False does NOT mean saved: no row ever confirms the outcome. */
  markedFailed: boolean
}

export type MemoryWritesState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'none' }
  | { status: 'recorded'; writes: MemoryWrite[] }
  /** Demo only: the sample-labelled fixture. Never queried. */
  | { status: 'sample'; writes: readonly MemoryWrite[] }

type QueryResult = { data: unknown[] | null; error: unknown }
type Query = PromiseLike<QueryResult> & {
  eq(column: string, value: unknown): Query
  in(column: string, values: unknown[]): Query
  order(column: string, options?: { ascending?: boolean }): Query
}
/** The one PostgREST chain used here, so tests can inject a fake instead of the browser client. */
export type MemoryEventsReader = { from(table: string): { select(columns: string): Query } }

const WRITE_TYPES = ['learned', 'failed'] as const
const COLUMNS = 'id,user_id,trip_id,event_type,learned_facts_json,created_at'

function factTexts(json: unknown): string[] {
  if (!Array.isArray(json)) return []
  return json
    .map((f) => (f && typeof f === 'object' ? (f as { fact?: unknown }).fact : null))
    .filter((f): f is string => typeof f === 'string')
    .map((f) => f.trim())
    .filter(Boolean)
}

/** Rows to displayable writes. Filters by trip AND owner as well as RLS, so a policy slip can
 *  never put another user's words on this page. */
export function rowsToMemoryWrites(
  rows: readonly MemoryEventRow[],
  { tripId, ownerId }: { tripId: string; ownerId: string },
): MemoryWrite[] {
  return rows
    .filter((r) => r.trip_id === tripId && r.user_id === ownerId)
    .filter((r) => (WRITE_TYPES as readonly string[]).includes(r.event_type))
    .map((r) => ({ id: r.id, texts: factTexts(r.learned_facts_json), createdAt: r.created_at, markedFailed: r.event_type === 'failed' }))
    .filter((w) => w.texts.length > 0)
}

export async function fetchTripMemoryWrites(
  reader: MemoryEventsReader, tripId: string, ownerId: string,
): Promise<MemoryWritesState> {
  try {
    const { data, error } = await reader.from('memory_events').select(COLUMNS)
      .eq('trip_id', tripId)
      .in('event_type', [...WRITE_TYPES])
      .order('created_at', { ascending: true })
    if (error) return { status: 'unavailable' }
    const writes = rowsToMemoryWrites((data ?? []) as MemoryEventRow[], { tripId, ownerId })
    return writes.length > 0 ? { status: 'recorded', writes } : { status: 'none' }
  } catch {
    return { status: 'unavailable' }
  }
}

function initialState(sample: boolean, tripId: string): MemoryWritesState {
  if (sample) return tripId === DEMO_MEMORY_TRIP_ID ? { status: 'sample', writes: DEMO_MEMORY_WRITES } : { status: 'none' }
  return MOCK_AUTH_ENABLED ? { status: 'none' } : { status: 'loading' }
}

/**
 * Reads on mount (the For you tab opening) and on `checkAgain()`. Nothing is cached across
 * mounts, so reopening the tab re-queries once. With `sample` set (read-only demo) it never
 * queries: the demo has no account and the anonymous client would read nothing.
 */
export function useTripMemoryWrites({ tripId, ownerId, sample, reader }: {
  tripId: string
  ownerId: string
  sample: boolean
  /** Test seam; defaults to the authenticated browser client. */
  reader?: MemoryEventsReader
}): { state: MemoryWritesState; checkAgain: () => Promise<void> } {
  const [state, setState] = useState<MemoryWritesState>(() => initialState(sample, tripId))
  const seq = useRef(0)
  const skip = sample || MOCK_AUTH_ENABLED

  const load = useCallback(async () => {
    if (skip) return
    const mine = ++seq.current
    setState({ status: 'loading' })
    const client = reader ?? (createClient() as unknown as MemoryEventsReader)
    const next = await fetchTripMemoryWrites(client, tripId, ownerId)
    if (mine === seq.current) setState(next)
  }, [skip, reader, tripId, ownerId])

  useEffect(() => {
    if (skip) {
      seq.current++
      setState(initialState(sample, tripId))
      return
    }
    void load()
    // Invalidate an in-flight read when the trip changes or the tab unmounts.
    return () => { seq.current++ }
  }, [skip, sample, tripId, load])

  return { state, checkAgain: load }
}
