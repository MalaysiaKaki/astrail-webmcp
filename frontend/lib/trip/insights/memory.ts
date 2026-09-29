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
 * value the runner set from what it actually used. But the event alone does not describe the
 * STORED prose: if the runner's best-effort summary overwrite failed, the create-time
 * profile-plus-trip text (`compose_preference_summary`: "Travel style: … / This trip: …")
 * survives beside a valid event. So a source, and the "planned with" claim, attach only when the
 * summary is in the exact format the pipeline writes for THAT source
 * (backend/pipeline/preferences.py `build_preference_context`); anything else is a recorded note
 * whose use is unverified (`source: null`).
 */
export const MEMORY_SUMMARY_PREFIX = 'Using your saved travel preferences: '
const EXPLICIT_SUMMARY_PREFIX = 'Using your preferences: '
const INFERRED_DEFAULT_SUMMARY = 'No preferences provided — Astrail will infer a balanced first draft from your Reels.'

const SOURCES: readonly PreferenceSource[] = ['explicit', 'memory', 'inferred_default']

export type TripPreferenceModel =
  /** Mem0 facts the pipeline recalled, one chip each. */
  | { kind: 'memory_facts'; facts: string[] }
  /** The stored summary as one statement; `source` only when the event AND the summary's
   *  pipeline format agree, otherwise null (recorded text, use unverified). */
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
  if (source === 'inferred_default' && summary === INFERRED_DEFAULT_SUMMARY) {
    return { kind: 'note', text: summary, source }
  }
  return { kind: 'note', text: summary, source: null }
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

/** At most this many preference chips in the hero; the rest are counted in `more`. */
export const HERO_PREFERENCE_MAX_ITEMS = 3
const HERO_ITEM_MAX_CHARS = 32
const HERO_NOTE_FALLBACK_CHARS = 48
/** The exact labels backend/preferences.py compose_preference_summary writes, and nothing else. */
const COMPOSER_LABELS = ['Travel style:', 'Interests:', 'Notes:', 'This trip:'] as const
/**
 * Words that make a phrase a restriction. Splitting such prose can reverse it ("no peanuts,
 * shellfish" → a "Shellfish" chip), so a note containing any of them is kept as ONE intact chip.
 * "not" is deliberately absent ("not too rushed" is a preference, not a restriction), and so are
 * diets that are positives (vegan, vegetarian, halal, kosher).
 */
const RESTRICTION = /\b(no|avoid|avoiding|without|allergy|allergies|allergic|never|don't|dont|except|intolerant|intolerance)\b|-free\b|\bfree of\b/i

/** The hero's preference line: specific chips, or — when specifics cannot be vouched for — the
 *  generic badge text as a single chip whose statement is exactly that text. */
export type HeroPreferenceItems = { items: string[]; more: number; generic?: boolean }

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}

/** Trim, drop a trailing period, capitalise. Never splits and never removes words. */
function tidy(raw: string): string {
  const t = raw.trim().replace(/\.+$/, '').trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''
}

function withoutComposerLabel(segment: string): string {
  const t = segment.trim()
  const label = COMPOSER_LABELS.find((l) => t.startsWith(l))
  return label ? t.slice(label.length) : t
}

/** Case-insensitive de-duplication of FULL items (before any truncation), order kept. */
function uniqueCaseless(items: string[]): string[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = item.toLowerCase()
    if (!item || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** The pipeline's own lead-in ("Using your preferences: …"), which is framing, not a preference. */
function withoutPipelinePrefix(text: string): string {
  for (const prefix of [MEMORY_SUMMARY_PREFIX.trim(), EXPLICIT_SUMMARY_PREFIX.trim()]) {
    if (text.startsWith(prefix)) return text.slice(prefix.length).trim()
  }
  return text
}

/** Mem0 facts: each one a whole unit (never split inside a fact), de-duplicated in full. */
function factItems(facts: string[]): string[] {
  return uniqueCaseless(facts.map(tidy))
}

/**
 * A prose note as short phrases — only on boundaries the stored formats guarantee (newlines, ';',
 * sentence ends, commas; never "and", which joins one preference), with the composer's own labels
 * removed at the start of a segment. Null (keep the note whole) when it contains a restriction or
 * does not break into chip-sized pieces.
 */
function noteItems(body: string): string[] | null {
  if (RESTRICTION.test(body)) return null
  const items = uniqueCaseless(body.split(/\n|;|\.\s+|,/).map((seg) => tidy(withoutComposerLabel(seg))))
  return items.length > 0 && items.every((i) => i.length <= HERO_ITEM_MAX_CHARS) ? items : null
}

/**
 * The hero's preference chips: WHAT the trip was planned with, instead of a generic "planned
 * around your taste". Shown exactly when heroPreferenceBadge would claim personalisation (same
 * honesty gate), from the same stored model:
 *   - Mem0 facts one per chip (also when the eventless MCP path shows the memory-format summary);
 *   - an explicit note split conservatively (noteItems), or ONE intact truncated chip;
 *   - a persisted preferences event whose summary does NOT match that source's pipeline format
 *     (model source null: e.g. the overwrite failed and older profile prose survives) → the generic
 *     badge text only, since those specifics may not be what the run used.
 */
export function heroPreferenceItems(bundle: TripBundle): HeroPreferenceItems | null {
  const badge = heroPreferenceBadge(bundle)
  if (!badge) return null
  const model = tripPreferenceModel(bundle)
  const eventSource = corroboratedPreferenceSource(bundle.events)
  // `all` holds FULL, de-duplicated items; truncation is display-only, so `more` counts every
  // distinct preference even when two visible labels would truncate to the same text.
  let all: string[]
  let displayMax = HERO_ITEM_MAX_CHARS
  if (model.kind === 'memory_facts') {
    all = factItems(model.facts)
  } else if (model.kind === 'note') {
    if (eventSource !== null && model.source === null) return { items: [badge], more: 0, generic: true }
    if (model.text.startsWith(MEMORY_SUMMARY_PREFIX.trim())) {
      // Eventless (MCP / legacy) memory-format summary: the same facts the web hero shows.
      all = factItems(withoutPipelinePrefix(model.text).split(';'))
    } else {
      const body = withoutPipelinePrefix(model.text)
      const split = noteItems(body)
      all = split ?? [tidy(body.replace(/\s+/g, ' '))]
      if (!split) displayMax = HERO_NOTE_FALLBACK_CHARS
    }
  } else {
    return null
  }
  if (all.length === 0) return null
  return {
    items: all.slice(0, HERO_PREFERENCE_MAX_ITEMS).map((i) => truncate(i, displayMax)),
    more: Math.max(0, all.length - HERO_PREFERENCE_MAX_ITEMS),
  }
}
