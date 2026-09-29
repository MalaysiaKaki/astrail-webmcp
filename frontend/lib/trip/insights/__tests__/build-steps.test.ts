import { describe, it, expect } from 'vitest'
import { buildSteps, fullLogEvents, reelProvenance, type BuildStep } from '@/lib/trip/insights/build-steps'
import { TOKYO_TRIP } from '@/lib/trip/fixtures'
import type { GenerationEvent, TripBundle, TripInspirationItem } from '@/lib/trip/backend-types'

let n = 0
const ev = (
  stage: GenerationEvent['stage'], event_type: GenerationEvent['event_type'] = 'stage',
  message = `${stage} ${event_type}`, payload: Record<string, unknown> = {},
): GenerationEvent => ({
  id: `e${++n}`, trip_id: TOKYO_TRIP.trip.id, event_type, stage, message, payload,
  created_at: new Date(Date.parse('2026-08-01T09:00:00Z') + n * 1000).toISOString(),
})

const withEvents = (events: GenerationEvent[], over: Partial<TripBundle> = {}): TripBundle => ({ ...TOKYO_TRIP, events, ...over })
const step = (steps: BuildStep[], key: BuildStep['key']) => steps.find((s) => s.key === key)

const reelRow = (id: string, url: string | null, thumb: string | null = null): TripInspirationItem => ({
  id, trip_id: TOKYO_TRIP.trip.id, item_type: url ? 'reel_url' : 'requested_place', source: 'manual_paste',
  normalized_reel_url: url, reel_cache_id: null, requested_place_text: url ? null : 'x',
  resolved_place_id: null, status: 'valid', thumbnail_url: thumb,
})

describe('reelProvenance', () => {
  it('dedupes the reconstructed inspiration by canonical URL and keeps covers', () => {
    const p = reelProvenance(withEvents([], {
      inspiration: [
        reelRow('a', 'https://www.instagram.com/reel/ABC/', '/a.jpg'),
        reelRow('b', 'https://instagram.com/reels/ABC'),
        reelRow('c', 'https://www.instagram.com/reel/XYZ'),
        reelRow('d', null),
      ],
    }))
    expect(p.behind).toEqual([
      { url: 'https://www.instagram.com/reel/ABC/', thumbnailUrl: '/a.jpg' },
      { url: 'https://www.instagram.com/reel/XYZ', thumbnailUrl: null },
    ])
  })

  it('reads submitted URLs from the create_trip payload only when that event exists', () => {
    const p = reelProvenance(withEvents([ev('create_trip', 'stage', 'Starting', { reel_urls: ['https://www.instagram.com/reel/A/', 'https://instagram.com/reel/A'] })]))
    expect(p.submittedCount).toBe(1)
    expect(p.fromLibrary).toBe(false)
  })

  it('absent create_trip event: submitted is not recorded (null), never a verified zero', () => {
    expect(reelProvenance(withEvents([])).submittedCount).toBeNull()
  })

  it('a Library trip submits zero Reels, which is valid', () => {
    const p = reelProvenance(withEvents([ev('create_trip', 'stage', 'Starting', { reel_urls: [], place_ids: ['p1', 'p2'] })]))
    expect(p).toMatchObject({ submittedCount: 0, fromLibrary: true })
  })

  it('a removed Saved Reel still counts (declared URL), with no cover', () => {
    const p = reelProvenance(withEvents([], { inspiration: [reelRow('derived-reel-0', 'https://www.instagram.com/reel/GONE', null)] }))
    expect(p.behind).toEqual([{ url: 'https://www.instagram.com/reel/GONE', thumbnailUrl: null }])
  })

  it('the demo: two Reels behind it, the typed request is not a Reel', () => {
    expect(reelProvenance(TOKYO_TRIP).behind).toHaveLength(2)
  })
})

describe('buildSteps', () => {
  it('cached run: the Reels step is reused, not done', () => {
    const steps = buildSteps(withEvents([ev('cache_hit', 'stage', 'Reused 2 Reels Astrail had already read')]))
    expect(step(steps, 'reels')).toMatchObject({ state: 'reused', message: 'Reused 2 Reels Astrail had already read' })
  })

  it('partly cached run (cache hit plus a scrape) is done', () => {
    const steps = buildSteps(withEvents([ev('cache_hit'), ev('scrape', 'stage', 'Reading 1 Reel')]))
    expect(step(steps, 'reels')?.state).toBe('done')
  })

  it('Library run: reused, with the Library context and zero submitted', () => {
    const steps = buildSteps(withEvents([
      ev('create_trip', 'stage', 'Starting your trip', { reel_urls: [], place_ids: ['p'] }),
      ev('cache_hit', 'stage', 'Using the 3 places you organized'),
    ]))
    const reels = step(steps, 'reels')
    expect(reels?.state).toBe('reused')
    expect(reels?.context).toBe('Built from places in your Library')
  })

  it('pasted-Reel run: submitted URLs shown as their own line only when the event recorded them', () => {
    const withPayload = buildSteps(withEvents([ev('create_trip', 'stage', 's', { reel_urls: ['https://www.instagram.com/reel/A/', 'https://www.instagram.com/reel/B/', 'https://www.instagram.com/reel/C/'] }), ev('scrape')]))
    expect(step(withPayload, 'reels')?.context).toBe('3 Reels submitted when you planned it')
    expect(step(buildSteps(withEvents([ev('scrape')])), 'reels')?.context).toBeNull()
  })

  it('warning: highlighted with the stored message, every warning kept', () => {
    const steps = buildSteps(withEvents([
      ev('transport', 'stage', 'Routing your days'),
      ev('transport', 'warning', 'Could not route A → B.'),
      ev('transport', 'warning', 'Could not route C → D.'),
    ]))
    expect(step(steps, 'transport')).toMatchObject({
      state: 'warning', message: 'Could not route C → D.', warnings: ['Could not route A → B.', 'Could not route C → D.'],
    })
  })

  it('error: failed', () => {
    const steps = buildSteps(withEvents([ev('extract', 'stage'), ev('extract', 'error', 'No verified places')]))
    expect(step(steps, 'places')).toMatchObject({ state: 'failed', message: 'No verified places' })
  })

  it('edited bundle: counts are the CURRENT contents, not what the log claimed', () => {
    const b = withEvents([ev('transport', 'decision', 'Computed 9 of 9 route legs.'), ev('save', 'stage', 'Saving your trip')])
    const steps = buildSteps(b)
    const ok = b.transport_legs.filter((l) => l.status === 'ok').length
    expect(step(steps, 'transport')?.count).toEqual({ value: ok, label: `${ok} of ${b.transport_legs.length} legs routed on this trip` })
    expect(step(steps, 'transport')?.message).toBe('Computed 9 of 9 route legs.')
    expect(step(steps, 'save')?.count?.label).toBe(`${b.places.length} stops on this trip`)
  })

  it('sparse log: bundle-backed steps appear as not recorded; evidence-free steps do not appear', () => {
    const b = withEvents([], { restaurants: [], hotels: [], days: TOKYO_TRIP.days.map((d) => ({ ...d, weather_summary: null, summary: null })) })
    const steps = buildSteps(b)
    expect(step(steps, 'save')).toMatchObject({ state: 'not_recorded', message: null })
    expect(step(steps, 'transport')?.state).toBe('not_recorded')
    expect(step(steps, 'weather')).toBeUndefined()
    expect(step(steps, 'restaurants')).toBeUndefined()
    expect(step(steps, 'dedup')).toBeUndefined()
  })

  it('weather shows its text only, never a count', () => {
    const steps = buildSteps(withEvents([ev('weather', 'stage', 'Checking the forecast')]))
    expect(step(steps, 'weather')).toMatchObject({ state: 'done', count: null, message: 'Checking the forecast' })
  })

  it('Reels with no provenance read "not recorded", not zero', () => {
    const steps = buildSteps(withEvents([ev('scrape')], { inspiration: [] }))
    expect(step(steps, 'reels')?.count).toEqual({ value: null, label: 'Reels not recorded' })
  })

  it('keeps the canonical order regardless of event order, and never shows heartbeat/result/create_trip', () => {
    const steps = buildSteps(withEvents([ev('save'), ev('save', 'heartbeat'), ev('scrape'), ev('save', 'result'), ev('create_trip')]))
    expect(steps.map((s) => s.key).indexOf('reels')).toBeLessThan(steps.map((s) => s.key).indexOf('save'))
    expect(step(steps, 'save')?.message).toBe('save stage')
    expect(steps.some((s) => /heartbeat|result|create_trip/.test(s.message ?? ''))).toBe(false)
  })

  it('the demo produces at least 6 steps', () => {
    expect(buildSteps(TOKYO_TRIP).length).toBeGreaterThanOrEqual(6)
  })
})

describe('fullLogEvents', () => {
  it('drops heartbeat, result and create_trip; keeps warnings, repeats and unknown stages', () => {
    const odd = { ...ev('scrape'), stage: 'teleport' as GenerationEvent['stage'] }
    const repeat1 = ev('scrape', 'stage', 'Reading 2 Reels')
    const repeat2 = ev('scrape', 'stage', 'Reading 2 Reels')
    const warn = ev('hotels', 'warning', 'No hotels')
    const log = fullLogEvents(withEvents([ev('create_trip'), repeat1, ev('save', 'heartbeat'), repeat2, warn, odd, ev('save', 'result')]))
    expect(log).toEqual([repeat1, repeat2, warn, odd])
  })
})
