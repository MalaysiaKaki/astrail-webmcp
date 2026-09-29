import type { TripPlace } from './backend-types'
import type { RouteLink } from './route-links'

// ── Estimated times ─────────────────────────────────────────────────────────────────────────
//
// Read this before adding a fallback to any of it.
//
// Astrail holds NO clock time and NO dwell duration. `TripPlace` has no duration field, `TripDay`
// has none, and the only `place_durations` in the schema hangs off `HotelSuggestion`, where it is
// the hotel-hub → place ROUTE duration (see selectors.ts::hubSpokeFeatures) — a travel time, not
// time spent at a place. Reading it as dwell would print "3 hrs here" against Disneyland from a
// number that actually measures the trip out from Shinjuku: a claim the page cannot support, on
// the one surface whose entire argument is that every claim is evidence-backed (guardrail #1).
//
// So a schedule can only ever be DERIVED, from durations we really hold, and only as far as they
// reach. The chain stops the moment the next number is unknown — a stop with no dwell keeps its
// arrival and loses its departure; an unrouted or missing leg ends the estimates for that day
// entirely. Even spacing to "fill the column" is the failure mode this shape exists to prevent.
//
// `dwellSeconds` therefore has no default and no fallback: no source is wired today, so nothing
// renders today. That is the honest output, not a gap to be papered over.
//
// TO THE NEXT PERSON: this is finished, not missing. The day the backend persists a real
// time-at-place — a `duration_seconds` on trip_places, or a `place_durations` on trip_days that
// means DWELL rather than the hotel-hub travel time above — the whole feature is one wiring line:
// pass that map to `deriveEstimatedTimes` from the stop list (StopTimeline) and render the result;
// the derivation is already tested (lib/trip/__tests__/estimated-times.test.ts). Moved here from
// the retired desktop ItineraryCards in plan A6 so the finished logic is not lost with its view. Do not rebuild it, and do not feed it the hotel's `place_durations`.

/** The one assumption on this surface, and it is stated in the UI rather than buried here. */
export const DAY_START_MINUTES = 9 * 60      // 09:00 local

export type StopEstimate = { start: number; end: number | null }

/** Whole minutes, matching what `fmtDuration` prints for the same leg, so the folded leg saying
    "3 min" and the clock advancing by 3 can never disagree. Null = we do not know. */
function knownTravelMinutes(link: RouteLink | null): number | null {
  if (!link || link.leg.status !== 'ok') return null
  const s = link.leg.duration_seconds
  return s !== null && Number.isFinite(s) ? Math.round(s / 60) : null
}

export function deriveEstimatedTimes(
  places: TripPlace[],
  above: (RouteLink | null)[],
  dwellSeconds: Map<string, number> | undefined,
  dayStartMinutes: number = DAY_START_MINUTES,
): (StopEstimate | null)[] {
  const none = places.map(() => null)
  // No dwell anywhere on the day means the 9:00 start is the ONLY number we would be printing —
  // an assumption with no data under it. An empty map is no data, not a day that starts at 9.
  const anyDwell = dwellSeconds !== undefined
    && places.some((p) => Number.isFinite(dwellSeconds.get(p.place_id)))
  if (!dwellSeconds || !anyDwell) return none

  const out: (StopEstimate | null)[] = []
  let cursor = dayStartMinutes
  let known = true
  for (let i = 0; i < places.length; i++) {
    if (i > 0) {
      const travel = knownTravelMinutes(above[i] ?? null)
      if (travel === null) known = false
      else cursor += travel
    }
    // Past midnight the wall clock would silently read as the same day. Stop instead.
    if (!known || cursor >= 24 * 60) { out.push(null); known = false; continue }
    const start = cursor
    const dwell = dwellSeconds.get(places[i].place_id)
    if (dwell === undefined || !Number.isFinite(dwell)) {
      out.push({ start, end: null })   // we know when you arrive, not when you leave
      known = false
      continue
    }
    cursor = start + Math.round(dwell / 60)
    out.push({ start, end: cursor })
  }
  return out.some((e) => e !== null) ? out : none
}

/** 24-hour and zero-padded, so a right-aligned column of them stays one column. */
export function fmtClock(minutes: number): string {
  const m = Math.round(minutes)
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
