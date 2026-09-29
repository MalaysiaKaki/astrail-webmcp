import type { Trip, TripBundle } from '@/lib/trip/backend-types'

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="flex flex-col" data-testid={`stat-${label}`}>
      <span className="type-display text-2xl leading-none tabular-nums text-[var(--starlight)]">{value}</span>
      <span className="type-label text-[length:var(--t-label)] uppercase tracking-wide text-[var(--faint)]">{label}</span>
    </div>
  )
}

function fmtDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// The where-line: destination · dates · from origin — trip.title is the headline above it.
function whereLine(trip: Trip): string {
  const dest = trip.inferred_destination ?? trip.destination_hint
  const dates = trip.start_date
    ? trip.end_date
      ? `${fmtDay(trip.start_date)} – ${fmtDay(trip.end_date)}`
      : fmtDay(trip.start_date)
    : null
  const from = trip.origin_city ? `from ${trip.origin_city}` : null
  return [dest, dates, from].filter(Boolean).join(' · ')
}

/* NO "SOURCES" STAT — deliberately, until it can be sourced.
   It read `bundle.inspiration.length`, which is ALWAYS 0: nothing writes
   `trip_inspiration_items` (grep for a producer — there is none), so every real trip
   showed "0 SOURCES" beside six places that plainly came from somewhere.

   The obvious substitute is wrong too. `evidence_json.source_url` is the RESEARCH
   citation that verified the place (mapcarta, tabelog), one per place — counting it
   yields exactly the place count and calls research "sources". The trip stores no
   reel_urls column either, so the number of Reels behind a trip is not derivable.

   Ship three true numbers rather than a fourth invented one. Restoring it needs
   `trip_inspiration_items` populated — the same migration that unblocks the real
   "not planned yet" list. */

/**
 * @param hideGapsBadge  The phone's About this trip says the same thing in traveller words
 *                       ("Some stops are missing details"), so it drops the pipeline-status badge.
 */
export default function OrchestratorSummary({ bundle, hideGapsBadge = false }: { bundle: TripBundle; hideGapsBadge?: boolean }) {
  const { trip } = bundle
  const withGaps = trip.status === 'saved_with_gaps' && !hideGapsBadge
  const where = whereLine(trip)
  const summary = trip.summary?.trim()

  return (
    <div className="surface rounded-xl p-4">
      <div className="flex items-start justify-between gap-3 max-md:flex-wrap">
        <div className="min-w-0">
          <h2 className="type-display text-[length:var(--t-card-title)] text-[var(--starlight)]">
            {trip.title ?? trip.inferred_destination ?? trip.destination_hint ?? 'Your trip'}
          </h2>
          {where ? <p className="type-body mt-0.5 text-[var(--muted)] text-[length:var(--t-meta)] leading-[1.45]">{where}</p> : null}
        </div>
        {withGaps ? (
          <span className="type-label inline-flex flex-none items-center gap-1.5 rounded-full bg-[var(--brass-soft)] px-2.5 py-1 text-[length:var(--t-label)] text-[var(--brass-bright)]">
            <span aria-hidden className="pulse-dot pulse-dot--warn" />
            Saved with gaps
          </span>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat value={bundle.places.length} label="places" />
        <Stat value={bundle.days.length} label="days" />
        <Stat value={bundle.transport_legs.length} label="legs" />
      </div>

      {summary ? (
        <div className="mt-4 border-t border-[var(--line)] pt-3">
          <p className="type-label text-[length:var(--t-label)] uppercase tracking-wide text-[var(--faint)]">Astrail’s read</p>
          <p className="type-body mt-1 text-[var(--starlight)] text-[length:var(--t-meta)] leading-[1.45]">{summary}</p>
        </div>
      ) : null}
    </div>
  )
}
