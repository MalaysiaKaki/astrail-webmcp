import { describe, it, expect } from 'vitest'
import {
  MEMORY_SUMMARY_PREFIX, corroboratedPreferenceSource, heroPreferenceBadge, heroPreferenceItems, tripPreferenceModel,
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

  it('never splits, nor sources, a memory event paired with stale profile prose (overwrite failed)', () => {
    // compose_preference_summary's format: the pipeline's own summary never landed, so the
    // event's source says nothing about THIS text.
    const profile = 'Travel style: slow.\nInterests: ramen; temples.'
    const m = tripPreferenceModel(bundle({ preference_summary: profile, preference_sources: ['memory'] }, [prefEvent('memory')]))
    expect(m).toEqual({ kind: 'note', text: profile, source: null })
  })

  it('shows a mixed profile + trip summary as one unsourced note, whatever the event says', () => {
    const mixed = 'Travel style: slow.\nThis trip: vegetarian; no hikes'
    for (const source of ['explicit', 'memory', 'inferred_default']) {
      const m = tripPreferenceModel(bundle({ preference_summary: mixed, preference_sources: ['memory', 'explicit'] }, [prefEvent(source)]))
      expect(m).toEqual({ kind: 'note', text: mixed, source: null })
    }
  })

  it('does not source a summary whose prefix belongs to a different source than the event', () => {
    const explicitText = 'Using your preferences: halal food only'
    expect(tripPreferenceModel(bundle({ preference_summary: explicitText }, [prefEvent('memory')])))
      .toEqual({ kind: 'note', text: explicitText, source: null })
    expect(tripPreferenceModel(bundle({ preference_summary: MEMORY_SUMMARY }, [prefEvent('explicit')])))
      .toEqual({ kind: 'note', text: MEMORY_SUMMARY, source: null })
    expect(tripPreferenceModel(bundle({ preference_summary: 'Travel style: slow.' }, [prefEvent('inferred_default')])))
      .toEqual({ kind: 'note', text: 'Travel style: slow.', source: null })
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
    expect(empty).toMatchObject({ kind: 'note', source: null })
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

/* The hero's chips: WHAT the trip was planned with, under exactly heroPreferenceBadge's gate. */
describe('heroPreferenceItems', () => {
  const explicit = (text: string, events = [prefEvent('explicit')]) =>
    heroPreferenceItems(bundle({ preference_summary: `Using your preferences: ${text}`, preference_sources: ['explicit'] }, events))

  it('the demo fixture: three chips and "+1" ("not" is not a restriction)', () => {
    expect(TOKYO_TRIP.trip.preference_summary).toBe('Walkable days, ramen, not too rushed, mid-range budget.')
    expect(heroPreferenceItems(TOKYO_TRIP)).toEqual({ items: ['Walkable days', 'Ramen', 'Not too rushed'], more: 1 })
  })

  it('Mem0 facts, one whole chip each — the same with the event (web) and without it (MCP/legacy)', () => {
    const summary = `${MEMORY_SUMMARY_PREFIX}walkable days; ramen and gyoza; no peanuts and shellfish`
    const expected = { items: ['Walkable days', 'Ramen and gyoza', 'No peanuts and shellfish'], more: 0 }
    expect(heroPreferenceItems(bundle({ preference_summary: summary, preference_sources: ['memory'] }, [prefEvent('memory')]))).toEqual(expected)
    expect(heroPreferenceItems(bundle({ preference_summary: summary, preference_sources: ['memory'] }, []))).toEqual(expected)
  })

  it('an explicit note splits on commas, ";" and sentence ends — never on "and"', () => {
    expect(explicit('street food and night markets; temples, slow mornings.')).toEqual({
      items: ['Street food and night markets', 'Temples', 'Slow mornings'], more: 0,
    })
  })

  it.each([
    ['no peanuts and shellfish', 'No peanuts and shellfish'],
    ['Allergy: peanuts', 'Allergy: peanuts'],
    ['avoid crowds, museums', 'Avoid crowds, museums'],
    ['gluten-free food, markets', 'Gluten-free food, markets'],
    ["don't book early flights, cafes", "Don't book early flights, cafes"],
  ])('a restriction is never split or relabelled: %s', (note, chip) => {
    expect(explicit(note)).toEqual({ items: [chip], more: 0 })
  })

  it('strips only the composer\'s own labels, at the start of a segment', () => {
    const note = 'Travel style: food-led, walkable. Interests: ramen, markets\nThis trip: slow mornings'
    expect(heroPreferenceItems(bundle({ preference_summary: note, preference_sources: ['memory', 'explicit'] }, [])))
      .toEqual({ items: ['Food-led', 'Walkable', 'Ramen'], more: 2 })
    // Any other "Label:" stays: it may carry meaning ("Budget: tight").
    expect(explicit('Budget: tight, ramen')).toEqual({ items: ['Budget: tight', 'Ramen'], more: 0 })
  })

  it('a long prose note that does not split into short phrases → ONE truncated chip', () => {
    const prose = 'We would love to spend most evenings wandering the old town slowly, with plenty of time to sit in cafés'
    const got = heroPreferenceItems(bundle({ preference_summary: prose, preference_sources: ['explicit'] }, []))
    expect(got?.more).toBe(0)
    expect(got?.items).toHaveLength(1)
    expect(got!.items[0].length).toBeLessThanOrEqual(48)
    expect(got!.items[0]).toMatch(/^We would love to spend most evenings.*…$/)
  })

  it('de-duplicates case-insensitively', () => {
    expect(explicit('Ramen, ramen; RAMEN, sushi')).toEqual({ items: ['Ramen', 'Sushi'], more: 0 })
  })

  it('de-duplicates FULL facts before truncating, so "+N" counts every distinct one', () => {
    const facts = ['Prefer museums with accessible toilets', 'Prefer museums with accessible lifts', 'Vegetarian food', 'Quiet nights']
    const got = heroPreferenceItems(bundle({ preference_summary: `${MEMORY_SUMMARY_PREFIX}${facts.join('; ')}`, preference_sources: ['memory'] }, [prefEvent('memory')]))
    expect(got?.items).toHaveLength(3)
    expect(got?.more).toBe(1)
    expect(got?.items[0]).toMatch(/…$/)
  })

  it.each([
    ['stale profile prose beside a memory event', 'Travel style: slow.\nInterests: ramen; temples.', 'memory'],
    ['a mixed profile + trip summary beside an explicit event', 'Travel style: slow.\nThis trip: vegetarian; no hikes', 'explicit'],
  ])('an event whose summary it cannot vouch for → the generic badge only: %s', (_, summary, source) => {
    const b = bundle({ preference_summary: summary, preference_sources: ['memory', 'explicit'] }, [prefEvent(source)])
    expect(tripPreferenceModel(b)).toMatchObject({ kind: 'note', source: null })
    expect(heroPreferenceItems(b)).toEqual({ items: [heroPreferenceBadge(b)], more: 0, generic: true })
  })

  it.each([
    ['no stored summary', { preference_summary: null, preference_sources: ['explicit' as const] }, []],
    ['an inferred-default run', { preference_summary: 'No preferences provided — Astrail will infer a balanced first draft from your Reels.', preference_sources: [] }, [prefEvent('inferred_default')]],
    ['a summary no source claims', { preference_summary: 'Walkable days, ramen', preference_sources: [] }, []],
  ])('is null exactly when heroPreferenceBadge is: %s', (_, trip, events) => {
    const b = bundle(trip as Partial<Trip>, events as GenerationEvent[])
    expect(heroPreferenceBadge(b)).toBeNull()
    expect(heroPreferenceItems(b)).toBeNull()
  })
})
