'use client'

import type { TransportMode } from '@/lib/trip/backend-types'
import type { RouteLink } from '@/lib/trip/route-links'
import { fmtDuration } from '../TransportStrip'

/**
 * What joins two stop cards: a dotted connector under the cards' number badges, carrying the
 * travel leg between them as one meta row — the mode as an icon, then "3 min · 0.1 km".
 *
 * The connector's column (`pl-4` + `w-7`) sits exactly under a card's badge (card `px-4`, badge
 * `w-7`), so the dots read as the route running from one numbered stop to the next.
 */
export function Connector({ children }: { children?: React.ReactNode }) {
  return (
    <div data-connector className="flex items-stretch gap-3 pl-4">
      <span aria-hidden className="flex w-7 shrink-0 justify-center">
        <span data-connector-line className="border-l-2 border-dotted border-[rgba(28,23,16,0.24)]" />
      </span>
      {children ?? <span className="h-3" />}
    </div>
  )
}

const MODE_WORD: Record<TransportMode, string> = {
  walk: 'Walk', drive: 'Drive', cycle: 'Cycle', transit_hint: 'Transit', unknown: 'Travel',
}

/** One line-icon per mode. `data-mode` names it for tests; the word itself is for AT. */
export function ModeIcon({ mode }: { mode: TransportMode }) {
  const common = {
    'data-mode': mode, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
    className: 'h-[18px] w-[18px] shrink-0',
  }
  switch (mode) {
    case 'walk':
      return (
        <svg {...common}>
          <circle cx="13" cy="4.5" r="1.8" />
          <path d="m9.5 21 2.2-6.5L14 16v5M8 12.5 10.5 8l3.5.8 2 3.2 2.5 1M11.7 14.5l.8-4.3" />
        </svg>
      )
    case 'drive':
      return (
        <svg {...common}>
          <path d="M5 16V11.5L6.8 7A2 2 0 0 1 8.7 5.7h6.6A2 2 0 0 1 17.2 7L19 11.5V16" />
          <path d="M4 16h16v2.5H4zM4 11.5h16" />
          <circle cx="7.5" cy="13.8" r=".6" fill="currentColor" />
          <circle cx="16.5" cy="13.8" r=".6" fill="currentColor" />
        </svg>
      )
    case 'cycle':
      return (
        <svg {...common}>
          <circle cx="5.5" cy="16.5" r="3.5" />
          <circle cx="18.5" cy="16.5" r="3.5" />
          <path d="M5.5 16.5 9 9h6l3.5 7.5M9 9 12 16.5l3-7.5M8 6h3" />
        </svg>
      )
    case 'transit_hint':
      return <TrainIcon />
    default:
      return (
        <svg {...common}>
          <circle cx="6" cy="18" r="2" />
          <circle cx="18" cy="6" r="2" />
          <path d="M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7" />
        </svg>
      )
  }
}

/** A train, for the no-route leg: the fixture's (and the pipeline's) advice is public transit. */
function TrainIcon() {
  return (
    <svg data-mode="transit_hint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-[18px] w-[18px] shrink-0">
      <rect x="5" y="3" width="14" height="14" rx="3" />
      <path d="M5 11h14M9 17l-2 4M15 17l2 4" />
      <circle cx="9" cy="14" r="0.5" fill="currentColor" />
      <circle cx="15" cy="14" r="0.5" fill="currentColor" />
    </svg>
  )
}

export function LegConnector({ link }: { link: RouteLink }) {
  const { leg, from } = link
  const origin = from ? `from ${from} · ` : ''
  if (leg.status !== 'ok') {
    // One compact line, not a paragraph: the warning is the traveller's advice, the icon says
    // what it is about, and the full sentence stays in the DOM and the title for AT.
    return (
      <Connector>
        <p
          data-leg="no-route"
          title={leg.warning ?? undefined}
          className="type-body flex min-w-0 flex-1 items-center gap-2 py-2.5 text-[14px] leading-snug text-[var(--m-text-muted)]"
        >
          <TrainIcon />
          <span className="min-w-0 truncate">{origin}{leg.warning ?? 'No route found for this leg.'}</span>
        </p>
      </Connector>
    )
  }
  const timing = [
    fmtDuration(leg.duration_seconds),
    leg.distance_meters != null ? `${(leg.distance_meters / 1000).toFixed(1)} km` : '',
  ].filter(Boolean).join(' · ')
  const word = MODE_WORD[leg.transport_mode] ?? 'Travel'
  return (
    <Connector>
      <p data-leg="routed" className="type-body flex min-w-0 flex-1 items-center gap-2 py-2.5 text-[14px] leading-snug text-[var(--m-text-muted)]">
        <ModeIcon mode={leg.transport_mode} />
        {/* With timing the icon carries the mode on screen; without it, the word is all there is. */}
        <span className={timing ? 'sr-only' : ''}>{word} </span>
        {timing || origin ? <span className="min-w-0 truncate tabular-nums">{origin}{timing}</span> : null}
      </p>
    </Connector>
  )
}
