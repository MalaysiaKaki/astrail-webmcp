'use client'

import { useState } from 'react'
import type { TripBundle } from '@/lib/trip/backend-types'
import { heroCovers, heroStats } from '@/lib/trip/hero'
import { tripDateRange, tripTitle } from '@/lib/trip/trip-presenters'
import HeroPreferences, { type HeroPreferenceItems } from './HeroPreferences'

/* Fixed, not random: a cluster that reshuffles on every render reads as a glitch. */
const TILT = ['-rotate-6', 'rotate-3', '-rotate-2', 'rotate-6'] as const

/**
 * The desktop panel's hero (plan v2 §1): the trip as pictures first. A Placify-style stacked
 * cluster of the Reels behind it (up to four covers and "+N"), then the serif title, dates and
 * origin, stat chips, and the preferences it was planned with. The cluster is the one bold element
 * on the panel; everything around it stays quiet.
 *
 * No "missing details" badge here: in the hero it read as low confidence in the whole trip. That
 * information stays where it is explained, in About this trip.
 *
 * On a short desktop viewport (844x390 landscape) the cluster and the chips give their height
 * back to the list: the title line alone remains.
 */
export default function TripHero({ bundle, readOnly, preferences }: {
  bundle: TripBundle
  readOnly: boolean
  /** heroPreferenceItems(bundle): the preferences it was planned with, or null (no claim made). */
  preferences: HeroPreferenceItems | null
}) {
  const { covers, reels, extra } = heroCovers(bundle)
  const stats = heroStats(bundle)
  const dates = tripDateRange(bundle.trip)
  const origin = bundle.trip.origin_city?.trim() || null
  return (
    <div data-testid="trip-hero" className="flex flex-col gap-3">
      <div className="flex min-w-0 items-center gap-4">
        <CoverCluster covers={covers} reels={reels} extra={extra} />
        <div className="min-w-0 flex-1">
          <h2 className="type-display text-[length:var(--t-title)] leading-[1.15] text-[var(--m-text)] [overflow-wrap:anywhere] line-clamp-2">
            {tripTitle(bundle.trip)}
          </h2>
          <p className="type-body mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[length:var(--t-meta)] leading-5 text-[var(--m-text-muted)]">
            <span className="tabular-nums">{dates}</span>
            {origin ? <span>from {origin}</span> : null}
            {readOnly ? (
              <span className="shrink-0 rounded-full bg-[var(--m-card)] px-2 text-[length:var(--t-label)] font-semibold leading-5 text-[var(--m-accent)] shadow-[inset_0_0_0_1px_rgba(138,96,35,0.28)]">
                Sample<span className="sr-only"> trail — read-only</span>
              </span>
            ) : null}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 [@media(max-height:560px)]:hidden">
        <ul aria-label="Trip at a glance" className="contents">
          {stats.map((s) => (
            <li key={s.label} className="type-body inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--m-subcard)] px-3 text-[length:var(--t-meta)] text-[var(--m-text-muted)]">
              <span className="font-semibold tabular-nums text-[var(--m-text)]">{s.value}</span>
              {s.label.toLowerCase()}
            </li>
          ))}
        </ul>
      </div>
      {preferences ? (
        <div className="[@media(max-height:560px)]:hidden">
          <HeroPreferences preferences={preferences} />
        </div>
      ) : null}
    </div>
  )
}

/**
 * Up to four Reel covers fanned like photos pinned to a board, then "+N" for the Reels past them
 * (and for any Reel the cache holds no cover for). No covers at all: plain brand tiles, one per
 * Reel up to three, so a Library trip still reads as "made from Reels" without a fake picture.
 * A cover that fails to load drops out rather than showing a broken image.
 */
function CoverCluster({ covers, reels, extra }: { covers: string[]; reels: number; extra: number }) {
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set())
  const shown = covers.filter((c) => !failed.has(c))
  const more = extra + (covers.length - shown.length)
  const tiles = shown.length ? shown.length : Math.max(1, Math.min(3, reels))
  const label = reels === 0 ? 'No Reels recorded for this trip' : `${reels} ${reels === 1 ? 'Reel' : 'Reels'} behind this trip`
  return (
    <div role="img" aria-label={label} className="relative flex shrink-0 items-center pl-1 [@media(max-height:560px)]:hidden">
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
            // eslint-disable-next-line @next/next/no-img-element
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
