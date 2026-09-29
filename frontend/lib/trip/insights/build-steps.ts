import type { GenerationEvent, GenerationStage, TripBundle } from '@/lib/trip/backend-types'
import { normalizeReelUrl } from '@/lib/trip/parse-inspiration'

/**
 * "How Astrail built this", from the persisted `generation_events` (plan amendment 4).
 *
 * Two different kinds of truth, kept apart:
 *   - a step's STATE and message come from its own events (done, reused, warning, failed), or
 *     `not_recorded` when the trip holds the step's output but the log holds nothing for it;
 *   - a step's COUNT comes from the bundle and is labelled as what is on the trip NOW
 *     ("5 stops on this trip"). A trip can be edited after generation, and counts are never
 *     parsed out of message text, so no count claims to be a historical generation result.
 * There is no minimum number of steps: the timeline covers the evidence that exists.
 */
export type BuildStepKey =
  | 'reels' | 'places' | 'preferences' | 'dedup' | 'enrich' | 'days'
  | 'weather' | 'transport' | 'restaurants' | 'hotels' | 'summaries' | 'save'

export type BuildStepState = 'done' | 'reused' | 'warning' | 'failed' | 'not_recorded'

export type BuildStepCount = {
  /** null = not recorded (never shown as zero). */
  value: number | null
  label: string
}

export type BuildStep = {
  key: BuildStepKey
  title: string
  state: BuildStepState
  /** The stored message that best explains the state (last warning/error, else last update). */
  message: string | null
  /** Every distinct warning/error message for the step, in order. */
  warnings: string[]
  count: BuildStepCount | null
  /** A second true line about the step, e.g. where a Library trip's places came from. */
  context: string | null
}

export type ReelRef = { url: string; thumbnailUrl: string | null }
export type ReelProvenance = {
  /** The loader's reconstructed Reels, one per canonical URL. */
  behind: ReelRef[]
  /** Distinct URLs in the `create_trip` payload; null when that event was not recorded. */
  submittedCount: number | null
  /** The trip was built from places picked in the Library (`place_ids`), not pasted Reels. */
  fromLibrary: boolean
}

/** Rows that are plumbing, not steps. */
const HIDDEN_TYPES = new Set<GenerationEvent['event_type']>(['heartbeat', 'result'])
const HIDDEN_STAGES = new Set<string>(['create_trip'])

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** instagram.com/reels/X, www.instagram.com/reel/X/ and …/reel/X all name one Reel. */
export function canonicalReelKey(url: string): string {
  return (normalizeReelUrl(url) ?? url).replace(/\/+$/, '')
}

function createTripPayload(bundle: TripBundle): Record<string, unknown> | null {
  return bundle.events.find((e) => e.stage === 'create_trip')?.payload ?? null
}

export function reelProvenance(bundle: TripBundle): ReelProvenance {
  const seen = new Set<string>()
  const behind: ReelRef[] = []
  for (const item of bundle.inspiration) {
    if (item.item_type !== 'reel_url' || !item.normalized_reel_url) continue
    const key = canonicalReelKey(item.normalized_reel_url)
    if (seen.has(key)) continue
    seen.add(key)
    behind.push({ url: item.normalized_reel_url, thumbnailUrl: item.thumbnail_url ?? null })
  }

  const payload = createTripPayload(bundle)
  const urls = payload?.reel_urls
  const submittedCount = Array.isArray(urls)
    ? new Set(urls.filter((u): u is string => typeof u === 'string').map(canonicalReelKey)).size
    : null
  const placeIds = payload?.place_ids
  return { behind, submittedCount, fromLibrary: Array.isArray(placeIds) && placeIds.length > 0 }
}

type StepDef = {
  key: BuildStepKey
  title: string
  stages: readonly GenerationStage[]
  count?: (bundle: TripBundle) => BuildStepCount | null
  /** Bundle evidence that the step ran even when the log is silent about it. */
  hasOutput?: (bundle: TripBundle) => boolean
}

const STEPS: readonly StepDef[] = [
  {
    key: 'reels', title: 'Read your Reels', stages: ['cache_hit', 'scrape'],
    count: (b) => {
      const n = reelProvenance(b).behind.length
      return n > 0 ? { value: n, label: `${plural(n, 'Reel')} behind this trip` } : { value: null, label: 'Reels not recorded' }
    },
    hasOutput: (b) => reelProvenance(b).behind.length > 0,
  },
  {
    key: 'places', title: 'Found places', stages: ['extract', 'resolve'],
    count: (b) => {
      const n = b.places.filter((tp) => tp.source_type === 'reel_extracted').length
      return { value: n, label: `${plural(n, 'stop')} from Reels on this trip` }
    },
  },
  { key: 'preferences', title: 'Applied your preferences', stages: ['preferences'] },
  { key: 'dedup', title: 'Checked for duplicates', stages: ['dedup'] },
  { key: 'enrich', title: 'Added place details', stages: ['enrich'] },
  {
    key: 'days', title: 'Put your days in order', stages: ['narrate'],
    count: (b) => ({ value: b.days.length, label: `${plural(b.days.length, 'day')} on this trip` }),
    hasOutput: (b) => b.days.length > 0,
  },
  {
    key: 'weather', title: 'Checked weather', stages: ['weather'],
    hasOutput: (b) => b.days.some((d) => typeof d.weather_summary === 'string' && d.weather_summary.trim() !== ''),
  },
  {
    key: 'transport', title: 'Routed legs', stages: ['transport'],
    count: (b) => {
      const total = b.transport_legs.length
      if (total === 0) return null
      const ok = b.transport_legs.filter((l) => l.status === 'ok').length
      return { value: ok, label: `${ok} of ${plural(total, 'leg')} routed on this trip` }
    },
    hasOutput: (b) => b.transport_legs.length > 0,
  },
  {
    key: 'restaurants', title: 'Found places to eat', stages: ['restaurants'],
    count: (b) => ({ value: b.restaurants.length, label: `${plural(b.restaurants.length, 'place')} to eat on this trip` }),
    hasOutput: (b) => b.restaurants.length > 0,
  },
  {
    key: 'hotels', title: 'Looked for places to stay', stages: ['hotels'],
    count: (b) => ({ value: b.hotels.length, label: `${plural(b.hotels.length, 'stay')} on this trip` }),
    hasOutput: (b) => b.hotels.length > 0,
  },
  {
    key: 'summaries', title: 'Wrote day summaries', stages: ['summarize'],
    count: (b) => {
      const n = b.days.filter((d) => typeof d.summary === 'string' && d.summary.trim() !== '').length
      return { value: n, label: `${plural(n, 'day summary', 'day summaries')} on this trip` }
    },
    hasOutput: (b) => b.days.some((d) => typeof d.summary === 'string' && d.summary.trim() !== ''),
  },
  {
    key: 'save', title: 'Saved your stops', stages: ['save'],
    count: (b) => ({ value: b.places.length, label: `${plural(b.places.length, 'stop')} on this trip` }),
    hasOutput: (b) => b.places.length > 0,
  },
]

/** The raw event list behind "Show full log": every row except heartbeat/result/create_trip. */
export function fullLogEvents(bundle: TripBundle): GenerationEvent[] {
  return bundle.events.filter((e) => !HIDDEN_TYPES.has(e.event_type) && !HIDDEN_STAGES.has(e.stage))
}

function stepState(def: StepDef, events: GenerationEvent[], fromLibrary: boolean): BuildStepState {
  if (events.length === 0) return 'not_recorded'
  if (events.some((e) => e.event_type === 'error')) return 'failed'
  if (events.some((e) => e.event_type === 'warning')) return 'warning'
  if (def.key === 'reels' && (fromLibrary || events.every((e) => e.stage === 'cache_hit'))) return 'reused'
  return 'done'
}

function stepMessage(events: GenerationEvent[], state: BuildStepState): string | null {
  const wanted = state === 'failed' ? ['error'] : state === 'warning' ? ['warning'] : ['stage', 'decision']
  const last = [...events].reverse().find((e) => wanted.includes(e.event_type))
  return last?.message?.trim() || null
}

export function buildSteps(bundle: TripBundle): BuildStep[] {
  const log = fullLogEvents(bundle)
  const { fromLibrary, submittedCount } = reelProvenance(bundle)
  const reelsContext = fromLibrary
    ? 'Built from places in your Library'
    : submittedCount !== null ? `${plural(submittedCount, 'Reel')} submitted when you planned it` : null
  return STEPS.flatMap((def): BuildStep[] => {
    const events = log.filter((e) => (def.stages as readonly string[]).includes(e.stage))
    if (events.length === 0 && !def.hasOutput?.(bundle)) return []
    const state = stepState(def, events, fromLibrary)
    const warnings = [...new Set(events
      .filter((e) => e.event_type === 'warning' || e.event_type === 'error')
      .map((e) => e.message.trim())
      .filter(Boolean))]
    return [{
      key: def.key,
      title: def.title,
      state,
      message: stepMessage(events, state),
      warnings,
      count: def.count?.(bundle) ?? null,
      context: def.key === 'reels' ? reelsContext : null,
    }]
  })
}
