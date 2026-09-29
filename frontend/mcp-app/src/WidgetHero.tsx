/**
 * The trip hero for the widget: panel/TripHero's markup and classes (readOnly={false}), built on
 * the same props-only helpers (lib/trip/hero) and the same HeroPreferences line. Kept separate
 * because the widget adds two things TripHero has no reason to know: the host's fullscreen
 * `action`, and the bounded view's inspiration omission (a trimmed bundle is not "no Reels").
 *
 * No "missing details" badge, as in TripHero: in the hero it read as low confidence.
 */
import { useState } from 'react'
import type { TripBundle } from '@/lib/trip/backend-types'
import { heroCovers, heroStats } from '@/lib/trip/hero'
import { heroPreferenceItems } from '@/lib/trip/insights/memory'
import { tripDateRange, tripTitle } from '@/lib/trip/trip-presenters'
import HeroPreferences from '@/components/trip/panel/HeroPreferences'

/* Fixed, not random: a cluster that reshuffles on every render reads as a glitch (as TripHero). */
const TILT = ['-rotate-6', 'rotate-3', '-rotate-2', 'rotate-6'] as const

/** What the bounded view dropped (the response's truncation flags), so the hero never states an
 *  absence that is only an absence from this view (Codex F2). */
export type HeroOmissions = { inspiration: boolean }

export default function WidgetHero({ bundle, omitted = { inspiration: false }, action }: {
  bundle: TripBundle
  omitted?: HeroOmissions
  /** Beside the title: the host's fullscreen request, when the host offers it. */
  action?: React.ReactNode
}) {
  const { covers, reels, extra } = heroCovers(bundle)
  const stats = heroStats(bundle)
  const dates = tripDateRange(bundle.trip)
  const origin = bundle.trip.origin_city?.trim() || null
  // The MCP bundle carries preference_summary and preference_sources but never events, so this is
  // the helper's claimed-sources path: the same gate, chips and wording as the web hero.
  const preferences = heroPreferenceItems(bundle)
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
      </div>
      {preferences ? <HeroPreferences preferences={preferences} /> : null}
    </div>
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
