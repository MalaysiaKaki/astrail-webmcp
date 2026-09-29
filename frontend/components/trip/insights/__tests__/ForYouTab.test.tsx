import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ForYouTab from '@/components/trip/insights/ForYouTab'
import { MEMORY_SUMMARY_PREFIX } from '@/lib/trip/insights/memory'
import type { MemoryEventsReader } from '@/lib/trip/insights/memory-events'
import { TOKYO_TRIP } from '@/lib/trip/fixtures'
import type { GenerationEvent, TripBundle } from '@/lib/trip/backend-types'

const REAL_TRIP = '11111111-1111-1111-1111-111111111111'
const OWNER = 'owner-1'

function reader(results: { data: unknown[] | null; error: unknown }[]) {
  let i = 0
  const from = vi.fn(() => {
    const q = {
      eq: () => q, in: () => q, order: () => q,
      then: (res: (v: unknown) => unknown) => Promise.resolve(results[Math.min(i++, results.length - 1)]).then(res),
    }
    return { select: () => q }
  })
  return { from } as unknown as MemoryEventsReader & { from: ReturnType<typeof vi.fn> }
}

const prefEvent = (source: string): GenerationEvent => ({
  id: 'pe', trip_id: REAL_TRIP, event_type: 'stage', stage: 'preferences', message: 'm',
  payload: { preference_source: source }, created_at: '2026-09-20T09:00:00Z',
})

const realBundle = (over: Partial<TripBundle['trip']> = {}, events: GenerationEvent[] = []): TripBundle => ({
  ...TOKYO_TRIP,
  trip: { ...TOKYO_TRIP.trip, id: REAL_TRIP, user_id: OWNER, ...over },
  events,
})

const writeRow = (event_type = 'learned') => ({
  id: 'w1', user_id: OWNER, trip_id: REAL_TRIP, event_type,
  learned_facts_json: [{ fact: 'Vegetarian, no early starts' }], created_at: '2026-09-20T10:00:00Z',
})

describe('ForYouTab — what the trip was planned with', () => {
  it('shows Mem0 facts as chips only when prefix and event agree', async () => {
    const b = realBundle({ preference_summary: `${MEMORY_SUMMARY_PREFIX}walkable days; ramen`, preference_sources: ['memory'] }, [prefEvent('memory')])
    render(<ForYouTab bundle={b} readOnly={false} onRevealPlace={() => {}} memoryReader={reader([{ data: [], error: null }])} />)
    expect(screen.getByRole('heading', { name: 'What Astrail remembered about how you travel' })).toBeInTheDocument()
    const chips = screen.getAllByTestId('memory-fact')
    expect(chips.map((c) => c.textContent)).toEqual(['walkable days', 'ramen'])
    // A memory-driven trip adds nothing new, and says so.
    await screen.findByText(/used your saved memory, so it didn't add anything new/i)
  })

  it('shows an uncorroborated summary as recorded notes with usage unverified', () => {
    render(<ForYouTab bundle={TOKYO_TRIP} readOnly onRevealPlace={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Preference notes recorded on this trip' })).toBeInTheDocument()
    expect(screen.getByText(/can't confirm these notes were used/i)).toBeInTheDocument()
    expect(screen.getByText(TOKYO_TRIP.trip.preference_summary as string)).toBeInTheDocument()
    expect(screen.queryByTestId('memory-fact')).toBeNull()
  })

  it('a valid preferences event paired with stale profile prose gets no source tag or planned-with claim', () => {
    const stale = 'Travel style: slow.\nNotes: I love hikes.\nThis trip: vegetarian'
    const b = realBundle({ preference_summary: stale, preference_sources: ['memory', 'explicit'] }, [prefEvent('inferred_default')])
    render(<ForYouTab bundle={b} readOnly onRevealPlace={() => {}} />)
    const section = screen.getByRole('region', { name: 'Preference notes recorded on this trip' })
    expect(within(section).getByText(/Travel style: slow\./)).toBeInTheDocument()
    expect(section.textContent).not.toMatch(/Inferred from your Reels|From your memory|You told us|planned with/i)
  })

  it('a corroborated explicit summary is tagged and claimed as planned-with', () => {
    const b = realBundle({ preference_summary: 'Using your preferences: halal food only', preference_sources: ['explicit'] }, [prefEvent('explicit')])
    render(<ForYouTab bundle={b} readOnly onRevealPlace={() => {}} />)
    const section = screen.getByRole('region', { name: 'Preferences this trip was planned with' })
    expect(within(section).getByText('You told us')).toBeInTheDocument()
    expect(within(section).getByText('halal food only')).toBeInTheDocument()
  })
})

const WRITES_REGION = 'Preferences Astrail tried to add to your memory'
/** Every claim the rows cannot back: an intent row proves neither dispatch nor retention. */
const OVERCLAIM = /\b(sent|saved|confirmed|learned|taught|retained|remembered it)\b/i

describe('ForYouTab — memory write attempts', () => {
  it('an orphan intent (learned row) renders as a dated attempt with an unconfirmed outcome', async () => {
    render(<ForYouTab bundle={realBundle()} readOnly={false} onRevealPlace={() => {}} memoryReader={reader([{ data: [writeRow()], error: null }])} />)
    const section = screen.getByRole('region', { name: WRITES_REGION })
    await within(section).findByText('“Vegetarian, no early starts”')
    expect(within(section).getByText(/Recorded 20 Sept? 2026/)).toBeInTheDocument()
    expect(within(section).getByText(/Recorded when this trip was planned: Astrail tried to add these preferences to your memory\./)).toBeInTheDocument()
    expect(within(section).getByText(/Outcome not confirmed/)).toBeInTheDocument()
    expect(within(section).getByRole('link', { name: /See what Astrail remembers now/ })).toHaveAttribute('href', '/app/settings')
    expect(section.textContent).not.toMatch(OVERCLAIM)
  })

  it('a row the backend marked failed says so, still without claiming anything was saved', async () => {
    render(<ForYouTab bundle={realBundle()} readOnly={false} onRevealPlace={() => {}} memoryReader={reader([{ data: [writeRow('failed')], error: null }])} />)
    const section = screen.getByRole('region', { name: WRITES_REGION })
    await within(section).findByText(/Marked as failed/)
    expect(section.textContent).not.toMatch(OVERCLAIM)
  })

  it('none: honest empty state, and Check again picks up a late write', async () => {
    const r = reader([{ data: [], error: null }, { data: [writeRow()], error: null }])
    render(<ForYouTab bundle={realBundle({}, [prefEvent('explicit')])} readOnly={false} onRevealPlace={() => {}} memoryReader={r} />)
    await screen.findByText('No memory write attempt recorded for this trip.')
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }))
    await screen.findByText('“Vegetarian, no early starts”')
    expect(r.from).toHaveBeenCalledTimes(2)
  })

  it('unavailable: says so and offers Check again', async () => {
    render(<ForYouTab bundle={realBundle()} readOnly={false} onRevealPlace={() => {}} memoryReader={reader([{ data: null, error: { message: 'jwt expired' } }])} />)
    await screen.findByText(/Couldn't load this right now/)
    expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument()
    expect(screen.queryByText(/jwt/)).toBeNull()
  })

  it('demo: never queries, shows the fixture labelled Sample, no settings links', () => {
    const r = reader([{ data: [writeRow()], error: null }])
    render(<ForYouTab bundle={TOKYO_TRIP} readOnly onRevealPlace={() => {}} memoryReader={r} />)
    expect(r.from).not.toHaveBeenCalled()
    const section = screen.getByRole('region', { name: WRITES_REGION })
    expect(within(section).getByText('Sample')).toBeInTheDocument()
    expect(within(section).getByText(/Recorded when this trip was planned/)).toBeInTheDocument()
    expect(within(section).queryByRole('link')).toBeNull()
    expect(section.textContent).not.toMatch(OVERCLAIM)
    expect(screen.queryByRole('link', { name: /Manage what Astrail remembers/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Check again' })).toBeNull()
  })

  it('real trip: the Manage link goes to Settings', async () => {
    render(<ForYouTab bundle={realBundle()} readOnly={false} onRevealPlace={() => {}} memoryReader={reader([{ data: [], error: null }])} />)
    expect(screen.getByRole('link', { name: /Manage what Astrail remembers/ })).toHaveAttribute('href', '/app/settings')
    await waitFor(() => expect(screen.queryByText(/Checking/)).toBeNull())
  })
})

describe('ForYouTab — picked for you', () => {
  it('lists Astrail suggestions with rationale; each reveals its place', async () => {
    const onReveal = vi.fn()
    render(<ForYouTab bundle={TOKYO_TRIP} readOnly onRevealPlace={onReveal} />)
    const suggested = TOKYO_TRIP.places.filter((tp) => tp.source_type === 'agent_suggested')
    expect(suggested.length).toBeGreaterThan(0)
    for (const tp of suggested) {
      const btn = screen.getByRole('button', { name: new RegExp(tp.place.name) })
      if (tp.evidence_json.rationale) expect(btn).toHaveTextContent(tp.evidence_json.rationale)
      await userEvent.click(btn)
      expect(onReveal).toHaveBeenLastCalledWith(tp.place_id)
    }
  })

  it('shows trade-off notes', () => {
    render(<ForYouTab bundle={TOKYO_TRIP} readOnly onRevealPlace={() => {}} />)
    expect(screen.getByText(TOKYO_TRIP.trip.tradeoffs.notes[0].detail)).toBeInTheDocument()
  })

  it('says so when nothing was picked for you', () => {
    const b = { ...TOKYO_TRIP, places: TOKYO_TRIP.places.filter((tp) => tp.source_type !== 'agent_suggested'), trip: { ...TOKYO_TRIP.trip, tradeoffs: { notes: [], comparisons: [] } } }
    render(<ForYouTab bundle={b} readOnly onRevealPlace={() => {}} />)
    expect(screen.getByText(/Every stop on this trip came from your Reels or your requests/)).toBeInTheDocument()
  })
})
