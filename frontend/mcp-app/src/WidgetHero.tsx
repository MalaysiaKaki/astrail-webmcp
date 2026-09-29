/**
 * The trip hero for the widget: panel/TripHero's markup and classes, as it renders with
 * `readOnly={false}` and `badge={null}`, built on the same props-only helpers (lib/trip/hero).
 *
 * Not TripHero itself: it imports `MissingDetails` from mobile/AboutThisTrip, whose module graph
 * reaches TripFeedbackPanel → lib/supabase/session and the feedback composer, none of which may
 * enter the widget bundle. `MissingDetails` is small and props-only, so it is mirrored here too.
 * If it ever moves to its own file, this component can be replaced by TripHero outright.
 */
import { useId, useState } from 'react'
import type { TripBundle } from '@/lib/trip/backend-types'
import { heroCovers, heroStats } from '@/lib/trip/hero'
import { tripDateRange, tripTitle } from '@/lib/trip/trip-presenters'
import { stopsMissingDetails } from '@/lib/trip/trip-stats'

/* Fixed, not random: a cluster that reshuffles on every render reads as a glitch (as TripHero). */
const TILT = ['-rotate-6', 'rotate-3', '-rotate-2', 'rotate-6'] as const

const NO_CAPTION = 'no caption evidence'

/** What the bounded view dropped (the response's truncation flags), so the hero never states an
 *  absence that is only an absence from this view (Codex F2). */
export type HeroOmissions = { inspiration: boolean; quotes: boolean }

/** TripHero's gaps list, minus what this view cannot know: with quotes cut, a quote-less stop may
 *  still have its caption in the saved trip, so "no caption evidence" is not claimed. */
function missingDetails(bundle: TripBundle, omitted: HeroOmissions) {
  const all = stopsMissingDetails(bundle)
  if (!omitted.quotes) return all
  return all
    .map((m) => ({ ...m, lacks: m.lacks.filter((l) => l !== NO_CAPTION) }))
    .filter((m) => m.lacks.length > 0)
}

export default function WidgetHero({ bundle, omitted = { inspiration: false, quotes: false }, action }: {
  bundle: TripBundle
  omitted?: HeroOmissions
  /** Beside the title: the host's fullscreen request, when the host offers it. */
  action?: React.ReactNode
}) {
  const { covers, reels, extra } = heroCovers(bundle)
  const stats = heroStats(bundle)
  const dates = tripDateRange(bundle.trip)
  const origin = bundle.trip.origin_city?.trim() || null
  const gaps = bundle.trip.status === 'saved_with_gaps'
  const missing = gaps ? missingDetails(bundle, omitted) : []
  const [gapsOpen, setGapsOpen] = useState(false)
  const gapsId = useId()
  return (
    <div data-testid="trip-hero" className="flex flex-col gap-3">
      <div className="flex min-w-0 items-center gap-4">
        <CoverCluster covers={covers} reels={reels} extra={extra} inspirationOmitted={omitted.inspiration} />
        <div className="min-w-0 flex-1">
          <h2 className="type-display text-[length:var(--t-title)] leading-[1.15] text-[var(--m-text)] [overflow-wrap:anywhere] line-clamp-2">
            {tripTitle(bundle.trip)}
          </h2>
          <p className="type-body mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[length:var(--t-meta)] leading-5 text-[var(--m-text-muted)]">
            <span className="tabular-nums">{dates}</span>
            {origin ? <span className="min-w-0 [overflow-wrap:anywhere]">from {origin}</span> : null}
          </p>
        </div>
        {action}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ul aria-label="Trip at a glance" className="contents">
          {stats.map((s) => (
            <li key={s.label} className="type-body inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--m-subcard)] px-3 text-[length:var(--t-meta)] text-[var(--m-text-muted)]">
              <span className="font-semibold tabular-nums text-[var(--m-text)]">{s.value}</span>
              {s.label.toLowerCase()}
            </li>
          ))}
        </ul>
        {gaps ? (
          <button
            type="button"
            aria-expanded={gapsOpen}
            aria-controls={gapsId}
            onClick={() => setGapsOpen((v) => !v)}
            className="type-body inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[var(--m-subcard)] px-3 text-[length:var(--t-meta)] font-semibold text-[var(--m-accent)] focus-visible:outline-none focus-visible:shadow-[var(--m-focus)]"
          >
            <span aria-hidden className="h-2 w-2 rounded-full bg-[var(--m-accent)]" />
            {missing.length > 0 ? `${missing.length} ${missing.length === 1 ? 'stop' : 'stops'} missing details` : 'Some details missing'}
          </button>
        ) : null}
      </div>
      {gaps && gapsOpen ? (
        <div id={gapsId}>
          <MissingDetails missing={missing} quotesOmitted={omitted.quotes} />
        </div>
      ) : null}
    </div>
  )
}

/** mobile/AboutThisTrip's MissingDetails, same copy and classes, plus a bounded-view variant. */
function MissingDetails({ missing, quotesOmitted }: {
  missing: ReturnType<typeof stopsMissingDetails>
  quotesOmitted: boolean
}) {
  if (missing.length === 0 && quotesOmitted) {
    return (
      <p className="type-body text-[14px] leading-snug text-[var(--m-text-muted)]">
        Every stop here has a map location. Caption quotes are not included in this view, so it
        cannot list which stops lack caption evidence; open the trip in Astrail for that.
      </p>
    )
  }
  if (missing.length === 0) {
    return (
      <p className="type-body text-[14px] leading-snug text-[var(--m-text-muted)]">
        Every stop here has a map location and its evidence. What Astrail could not find is elsewhere
        — the weather, places to eat, or a route between two stops.
      </p>
    )
  }
  return (
    <ul aria-label="Stops missing details" className="flex flex-col gap-2">
      {missing.map((m) => (
        <li key={m.id} className="m-subcard flex flex-col px-4 py-3">
          <span className="type-body text-[15px] font-semibold text-[var(--m-text)]">{m.name}</span>
          <span className="type-body text-[14px] text-[var(--m-text-muted)]">{m.lacks.join(', ')}</span>
        </li>
      ))}
    </ul>
  )
}

/** TripHero's CoverCluster: up to four Reel covers fanned, then "+N"; a failed cover drops out. */
function CoverCluster({ covers, reels, extra, inspirationOmitted }: {
  covers: string[]
  reels: number
  extra: number
  /** The view dropped some or all Reel rows: count what is here as a floor, never as "none". */
  inspirationOmitted: boolean
}) {
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set())
  const shown = covers.filter((c) => !failed.has(c))
  const more = extra + (covers.length - shown.length)
  const tiles = shown.length ? shown.length : Math.max(1, Math.min(3, reels))
  const noun = `${reels === 1 ? 'Reel' : 'Reels'} behind this trip`
  const label = inspirationOmitted
    ? (reels === 0 ? 'Reel covers not included in this view' : `At least ${reels} ${noun}`)
    : (reels === 0 ? 'No Reels recorded for this trip' : `${reels} ${noun}`)
  return (
    <div role="img" aria-label={label} className="relative flex shrink-0 items-center pl-1">
      {Array.from({ length: tiles }, (_, i) => (
        <span
          key={shown[i] ?? i}
          className={[
            'relative block h-14 w-12 overflow-hidden rounded-[12px] border-2 border-[var(--m-card)] bg-[var(--m-accent-wash)] shadow-[0_2px_8px_rgba(28,23,16,0.18)]',
            i > 0 ? '-ml-5' : '',
            TILT[i % TILT.length],
          ].join(' ')}
          style={{ zIndex: tiles - i }}
        >
          {shown[i] ? (
            <img
              src={shown[i]}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setFailed((f) => new Set(f).add(shown[i]))}
              className="h-full w-full object-cover"
            />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
              strokeLinejoin="round" aria-hidden className="absolute inset-0 m-auto h-5 w-5 text-[var(--m-accent)]">
              <rect x="4" y="3" width="16" height="18" rx="3" />
              <path d="m10 9 5 3-5 3Z" />
            </svg>
          )}
        </span>
      ))}
      {more > 0 ? (
        <span className="type-body relative -ml-3 inline-flex h-7 min-w-7 items-center justify-center self-end rounded-full bg-[var(--m-ink)] px-1.5 text-[length:var(--t-label)] font-semibold tabular-nums text-[var(--m-on-ink)] shadow-[0_0_0_2px_var(--m-card)]" style={{ zIndex: 10 }}>
          +{more}
        </span>
      ) : null}
    </div>
  )
}
