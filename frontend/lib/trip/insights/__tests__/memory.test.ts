import { describe, it, expect } from 'vitest'
import {
  MEMORY_SUMMARY_PREFIX, corroboratedPreferenceSource, heroPreferenceBadge, tripPreferenceModel,
} from '@/lib/trip/insights/memory'
import { TOKYO_TRIP } from '@/lib/trip/fixtures'
import type { GenerationEvent, Trip, TripBundle } from '@/lib/trip/backend-types'

const prefEvent = (source: unknown, over: Partial<GenerationEvent> = {}): GenerationEvent => ({
  id: `ev_${String(source)}`, trip_id: TOKYO_TRIP.trip.id, event_type: 'stage', stage: 'preferences',
  message: 'x', payload: source === undefined ? {} : { preference_source: source },
  created_at: '2026-08-01T09:00:00Z', ...over,
})

const bundle = (trip: Partial<Trip>, events: GenerationEvent[]): TripBundle => ({
  ...TOKYO_TRIP, trip: { ...TOKYO_TRIP.trip, ...trip }, events,
})

const MEMORY_SUMMARY = `${MEMORY_SUMMARY_PREFIX}walkable days; ramen; not too rushed`

describe('corroboratedPreferenceSource', () => {
  it('reads the persisted preferences event payload', () => {
    expect(corroboratedPreferenceSource([prefEvent('memory')])).toBe('memory')
    expect(corroboratedPreferenceSource([prefEvent('explicit')])).toBe('explicit')
    expect(corroboratedPreferenceSource([prefEvent('inferred_default')])).toBe('inferred_default')
  })
  it('is null when the event is missing, has no source, or names an unknown one', () => {
    expect(corroboratedPreferenceSource([])).toBeNull()
    expect(corroboratedPreferenceSource([prefEvent(undefined)])).toBeNull()
    expect(corroboratedPreferenceSource([prefEvent('telepathy')])).toBeNull()
    // Another stage carrying the key is not the pipeline's statement about preferences.
    expect(corroboratedPreferenceSource([prefEvent('memory', { stage: 'narrate' })])).toBeNull()
  })
  it('takes the last preferences event when a run repeated the stage', () => {
    expect(corroboratedPreferenceSource([prefEvent('explicit'), { ...prefEvent('memory'), id: 'b' }])).toBe('memory')
  })
})

describe('tripPreferenceModel', () => {
  it('splits Mem0 facts only with the known prefix AND a memory event', () => {
    const m = tripPreferenceModel(bundle({ preference_summary: MEMORY_SUMMARY, preference_sources: ['memory'] }, [prefEvent('memory')]))
    expect(m).toEqual({ kind: 'memory_facts', facts: ['walkable days', 'ramen', 'not too rushed'] })
  })

  it('keeps a known-prefix summary whole when the event does not corroborate memory', () => {
    const m = tripPreferenceModel(bundle({ preference_summary: MEMORY_SUMMARY, preference_sources: ['memory'] }, []))
    expect(m).toEqual({ kind: 'note', text: MEMORY_SUMMARY, source: null })
  })

  it('never splits a memory-corroborated summary that lacks the prefix (profile tags / notes)', () => {
    const profile = 'Travel style: slow.\nInterests: ramen; temples.'
    const m = tripPreferenceModel(bundle({ preference_summary: profile, preference_sources: ['memory'] }, [prefEvent('memory')]))
    expect(m).toEqual({ kind: 'note', text: profile, source: 'memory' })
  })

  it('shows a mixed memory + explicit summary as one note', () => {
    const mixed = 'Travel style: slow.\nThis trip: vegetarian; no hikes'
    const m = tripPreferenceModel(bundle({ preference_summary: mixed, preference_sources: ['memory', 'explicit'] }, [prefEvent('explicit')]))
    expect(m).toEqual({ kind: 'note', text: mixed, source: 'explicit' })
  })

  it('drops the "Using your preferences:" wrapper only when the event says explicit', () => {
    const m = tripPreferenceModel(bundle({ preference_summary: 'Using your preferences: halal food only', preference_sources: ['explicit'] }, [prefEvent('explicit')]))
    expect(m).toEqual({ kind: 'note', text: 'halal food only', source: 'explicit' })
  })

  it('shows an inferred-default summary as a note tagged inferred', () => {
    const text = 'No preferences provided — Astrail will infer a balanced first draft from your Reels.'
    const m = tripPreferenceModel(bundle({ preference_summary: text, preference_sources: ['inferred_default'] }, [prefEvent('inferred_default')]))
    expect(m).toEqual({ kind: 'note', text, source: 'inferred_default' })
  })

  it('is none when there is no summary', () => {
    expect(tripPreferenceModel(bundle({ preference_summary: null }, [prefEvent('memory')]))).toEqual({ kind: 'none' })
    expect(tripPreferenceModel(bundle({ preference_summary: '   ' }, []))).toEqual({ kind: 'none' })
  })

  it('drops blank facts after the prefix, and falls back to a note when none survive', () => {
    const m = tripPreferenceModel(bundle({ preference_summary: `${MEMORY_SUMMARY_PREFIX} ; ramen ;`, preference_sources: ['memory'] }, [prefEvent('memory')]))
    expect(m).toEqual({ kind: 'memory_facts', facts: ['ramen'] })
    const empty = tripPreferenceModel(bundle({ preference_summary: `${MEMORY_SUMMARY_PREFIX} ; `, preference_sources: ['memory'] }, [prefEvent('memory')]))
    expect(empty.kind).toBe('note')
  })

  it('the demo fixture (both sources claimed, no payload) is one neutral note', () => {
    const m = tripPreferenceModel(TOKYO_TRIP)
    expect(m).toEqual({ kind: 'note', text: TOKYO_TRIP.trip.preference_summary, source: null })
  })
})

describe('heroPreferenceBadge', () => {
  it('says "Planned around your taste" only when the event corroborates memory or explicit', () => {
    expect(heroPreferenceBadge(bundle({ preference_summary: MEMORY_SUMMARY, preference_sources: ['memory'] }, [prefEvent('memory')]))).toBe('Planned around your taste')
    expect(heroPreferenceBadge(bundle({ preference_summary: 'Using your preferences: x', preference_sources: ['explicit'] }, [prefEvent('explicit')]))).toBe('Planned around your taste')
  })
  it('falls back to "Planned with your preferences" when uncorroborated', () => {
    expect(heroPreferenceBadge(TOKYO_TRIP)).toBe('Planned with your preferences')
    expect(heroPreferenceBadge(bundle({ preference_summary: 'x', preference_sources: ['memory'] }, []))).toBe('Planned with your preferences')
  })
  it('is null for an inferred-default trip or one with no summary', () => {
    expect(heroPreferenceBadge(bundle({ preference_summary: 'No preferences provided', preference_sources: ['inferred_default'] }, [prefEvent('inferred_default')]))).toBeNull()
    expect(heroPreferenceBadge(bundle({ preference_summary: 'No preferences provided', preference_sources: ['inferred_default'] }, []))).toBeNull()
    expect(heroPreferenceBadge(bundle({ preference_summary: null, preference_sources: ['memory'] }, [prefEvent('memory')]))).toBeNull()
  })
})
