import type { GenerationEvent, PreferenceSource, TripBundle } from '@/lib/trip/backend-types'

/**
 * What a trip was planned with, read so it never claims more than the pipeline recorded.
 *
 * Two stored facts, and neither is enough alone (plan amendment 2):
 *   - `trip.preference_summary` is prose. When the pipeline recalled Mem0 facts it is exactly
 *     `MEMORY_SUMMARY_PREFIX + facts.join('; ')` (backend/pipeline/preferences.py), but other
 *     writers (`compose_preference_summary`) put profile tags and notes in it under the SAME
 *     'memory' source, and those contain their own semicolons.
 *   - `trip.preference_sources` can claim both 'memory' and 'explicit' at once.
 * The persisted `preferences` generation event carries `payload.preference_source`, the one
 * value the runner set from what it actually used. So the summary is split into Mem0 fact chips
 * only when it has the prefix AND the event says memory; everything else is one note.
 */
export const MEMORY_SUMMARY_PREFIX = 'Using your saved travel preferences: '
const EXPLICIT_SUMMARY_PREFIX = 'Using your preferences: '

const SOURCES: readonly PreferenceSource[] = ['explicit', 'memory', 'inferred_default']

export type TripPreferenceModel =
  /** Mem0 facts the pipeline recalled, one chip each. */
  | { kind: 'memory_facts'; facts: string[] }
  /** The stored summary as one statement; `source` only when the event corroborates it. */
  | { kind: 'note'; text: string; source: PreferenceSource | null }
  | { kind: 'none' }

export type HeroPreferenceBadge = 'Planned around your taste' | 'Planned with your preferences'

/** The `preference_source` of the last persisted `preferences` event, or null when unrecorded. */
export function corroboratedPreferenceSource(events: readonly GenerationEvent[]): PreferenceSource | null {
  const last = [...events].reverse().find((e) => e.stage === 'preferences')
  const raw = last?.payload?.preference_source
  return SOURCES.includes(raw as PreferenceSource) ? (raw as PreferenceSource) : null
}

function storedSummary(bundle: TripBundle): string | null {
  const s = bundle.trip.preference_summary
  return typeof s === 'string' && s.trim() ? s.trim() : null
}

export function tripPreferenceModel(bundle: TripBundle): TripPreferenceModel {
  const summary = storedSummary(bundle)
  if (!summary) return { kind: 'none' }
  const source = corroboratedPreferenceSource(bundle.events)

  if (source === 'memory' && summary.startsWith(MEMORY_SUMMARY_PREFIX.trim())) {
    const facts = summary.slice(MEMORY_SUMMARY_PREFIX.trim().length)
      .split(';')
      .map((f) => f.trim())
      .filter(Boolean)
    if (facts.length > 0) return { kind: 'memory_facts', facts }
  }
  if (source === 'explicit' && summary.startsWith(EXPLICIT_SUMMARY_PREFIX)) {
    const text = summary.slice(EXPLICIT_SUMMARY_PREFIX.length).trim()
    if (text) return { kind: 'note', text, source }
  }
  return { kind: 'note', text: summary, source }
}

/** The hero's personalised badge, or null when no stated or remembered preference shaped it. */
export function heroPreferenceBadge(bundle: TripBundle): HeroPreferenceBadge | null {
  if (!storedSummary(bundle)) return null
  const source = corroboratedPreferenceSource(bundle.events)
  if (source === 'memory' || source === 'explicit') return 'Planned around your taste'
  if (source === 'inferred_default') return null
  const claimed = Array.isArray(bundle.trip.preference_sources) ? bundle.trip.preference_sources : []
  return claimed.includes('memory') || claimed.includes('explicit') ? 'Planned with your preferences' : null
}
