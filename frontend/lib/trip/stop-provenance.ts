import type { TripPlace } from '@/lib/trip/backend-types'

/**
 * Why a stop is on the trip, in the one line a phone row has room for.
 *
 * The evidence contract (guardrail #1) is that every stop shows where it came from. The frontend
 * holds `evidence_json.quote` (nullable) and `rationale` — no clock times, no slots — so the row
 * says one of four true things and never fills a gap with a plausible one:
 *   - a Reel stop: the caption quote, verbatim
 *   - a stop the traveller asked for: labelled as theirs, with their words when we hold them
 *   - an Astrail suggestion: its rationale
 *   - a Reel stop whose quote is missing: says there is no caption evidence
 */
export type StopProvenance =
  | { kind: 'reel'; label: 'From a Reel'; text: string }
  | { kind: 'requested'; label: 'You asked for this'; text: string | null }
  | { kind: 'suggested'; label: 'Astrail suggestion'; text: string | null }
  | { kind: 'none'; label: 'No caption evidence'; text: null }

const clean = (s: string | null | undefined): string | null => {
  const t = s?.trim()
  return t ? t : null
}

export function stopProvenance(tp: TripPlace): StopProvenance {
  const quote = clean(tp.evidence_json.quote)
  switch (tp.source_type) {
    case 'user_requested':
      return { kind: 'requested', label: 'You asked for this', text: quote }
    case 'agent_suggested':
      return { kind: 'suggested', label: 'Astrail suggestion', text: clean(tp.evidence_json.rationale) }
    default:
      return quote
        ? { kind: 'reel', label: 'From a Reel', text: quote }
        : { kind: 'none', label: 'No caption evidence', text: null }
  }
}
