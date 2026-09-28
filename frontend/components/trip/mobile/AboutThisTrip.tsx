'use client'

import type { TripBundle } from '@/lib/trip/backend-types'
import { formatRoutedDistance, stopsMissingDetails, tripStats } from '@/lib/trip/trip-stats'
import OrchestratorSummary from '../OrchestratorSummary'
import TripPreferenceNote from '../TripPreferenceNote'
import TradeoffPanel from '../TradeoffPanel'
import AgentDecisionRail from '../AgentDecisionRail'
import TripFeedbackPanel from '../TripFeedbackPanel'
import type { FeedbackComposer } from '../use-feedback-composer'

/**
 * Everything the desktop rail shows ABOVE the stops, moved to the end of the phone list behind
 * one card-link disclosure (Placify's overview pattern): a 2×2 stat grid, then one card link per
 * section, each opening inline. Nothing is removed — only the order and the disclosure change — so
 * the first screen of the sheet is the route.
 *
 * Native <details> throughout, not conditional renders: the feedback composer keeps its draft
 * when its row (or the whole section) is closed and reopened.
 */
export default function AboutThisTrip({ bundle, readOnly, feedback }: {
  bundle: TripBundle
  readOnly: boolean
  feedback?: FeedbackComposer
}) {
  // Same explicit status allowlist as the desktop rail (plan T3), not reachability.
  const withGaps = bundle.trip.status === 'saved_with_gaps'
  const showFeedback = !readOnly && (bundle.trip.status === 'complete' || bundle.trip.status === 'saved_with_gaps')
  // Rows appear only when there is something behind them: a card link that opens onto nothing is
  // a dead control. The agent rail always has an honest answer ("No agent activity recorded").
  const hasPreferences = typeof bundle.trip.preference_summary === 'string' && bundle.trip.preference_summary.trim() !== ''
  const hasTradeoffs = (bundle.trip.tradeoffs?.notes ?? []).length > 0
  return (
    <details
      className="group/about mt-6 scroll-mt-2"
      // Opened at the foot of a long list, its content would unfold below the fold with nothing
      // on screen changing. Bring it up so opening it visibly does something.
      onToggle={(e) => {
        const el = e.currentTarget
        // Only About's OWN toggle. React hands the inner rows' toggles to this handler too
        // (target = the row), and scrolling About's heading up then pushed the row the user had
        // just opened out of view (Codex final review #1).
        if (e.target !== el) return
        if (!el.open) return
        const reduce = typeof window.matchMedia === 'function'
          && window.matchMedia('(prefers-reduced-motion: reduce)').matches
        el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
      }}
    >
      <summary className="m-card-link list-none [&::-webkit-details-marker]:hidden">
        <span className="type-display text-[20px] leading-tight text-[var(--m-text)]">About this trip</span>
        <Chevron group="about" />
      </summary>
      <div className="flex flex-col gap-3 pt-3">
        {readOnly ? (
          <p className="type-body px-1 text-[14px] leading-snug text-[var(--m-text-muted)]">
            A saved example, not an account. Nothing here can be changed or saved — plan your own
            trail to edit an itinerary.
          </p>
        ) : null}
        <StatGrid bundle={bundle} />
        <Row title="Trip summary">
          <OrchestratorSummary bundle={bundle} hideGapsBadge />
        </Row>
        {hasPreferences ? (
          <Row title="Your preferences"><TripPreferenceNote trip={bundle.trip} /></Row>
        ) : null}
        {hasTradeoffs ? (
          <Row title="Trade-offs"><TradeoffPanel tradeoffs={bundle.trip.tradeoffs} variant="notes" /></Row>
        ) : null}
        <Row title="How Astrail built this"><AgentDecisionRail events={bundle.events} /></Row>
        {withGaps ? (
          <Row title="Some stops are missing details" status><MissingDetails bundle={bundle} /></Row>
        ) : null}
        {showFeedback ? (
          <Row title="How was this trail?">
            <TripFeedbackPanel key={bundle.trip.id} tripId={bundle.trip.id} composer={feedback} variant="phone" />
          </Row>
        ) : null}
      </div>
    </details>
  )
}

function Chevron({ group }: { group: 'about' | 'row' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden
      className={[
        'm-chevron transition-transform motion-reduce:transition-none',
        group === 'about' ? 'group-open/about:rotate-180' : 'group-open/row:rotate-180',
      ].join(' ')}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

/** One section as a card link that opens inline. */
function Row({ title, status = false, children }: { title: string; status?: boolean; children: React.ReactNode }) {
  return (
    <details className="group/row">
      <summary className="m-card-link list-none [&::-webkit-details-marker]:hidden">
        {status ? <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-[var(--m-accent)]" /> : null}
        <span className={['type-body min-w-0 truncate text-[15px] font-semibold', status ? 'text-[var(--m-accent)]' : 'text-[var(--m-text)]'].join(' ')}>
          {title}
        </span>
        <Chevron group="row" />
      </summary>
      <div className="px-1 pb-1 pt-3">{children}</div>
    </details>
  )
}

const STATS = [
  { key: 'places', label: 'Places', d: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11ZM12 12.3a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6Z' },
  { key: 'days', label: 'Days', d: 'M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5ZM4 10h16M8 3v4M16 3v4' },
  { key: 'legs', label: 'Legs', d: 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM8 17h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7' },
  { key: 'distance', label: 'Routed distance', d: 'M3 17l6-6 4 4 8-8M15 7h6v6' },
] as const

/** Placify's overview stat cards: an icon and label, then the figure in the display serif. */
function StatGrid({ bundle }: { bundle: TripBundle }) {
  const s = tripStats(bundle)
  const value: Record<(typeof STATS)[number]['key'], string> = {
    places: String(s.places),
    days: String(s.days),
    legs: String(s.legs),
    distance: formatRoutedDistance(s.routedMeters),
  }
  return (
    <div data-stat-grid className="grid grid-cols-2 gap-3">
      {STATS.map((st) => (
        <div key={st.key} data-stat className="m-card flex flex-col gap-2 px-4 py-3.5">
          <span className="type-body flex items-center gap-1.5 text-[14px] text-[var(--m-text-muted)]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-4 w-4 shrink-0 text-[var(--m-accent)]">
              <path d={st.d} />
            </svg>
            <span data-stat-label className="truncate">{st.label}</span>
          </span>
          <span className="type-display text-[28px] leading-none tabular-nums text-[var(--m-text)]">{value[st.key]}</span>
        </div>
      ))}
    </div>
  )
}

function MissingDetails({ bundle }: { bundle: TripBundle }) {
  const missing = stopsMissingDetails(bundle)
  if (missing.length === 0) {
    return (
      <p className="type-body text-[14px] leading-snug text-[var(--m-text-muted)]">
        Every stop here has a map location and its evidence. What Astrail could not find is elsewhere
        — the weather, places to eat, or a route between two stops.
      </p>
    )
  }
  return (
    <ul className="flex flex-col gap-2">
      {missing.map((m) => (
        <li key={m.id} className="m-subcard flex flex-col px-4 py-3">
          <span className="type-body text-[15px] font-semibold text-[var(--m-text)]">{m.name}</span>
          <span className="type-body text-[14px] text-[var(--m-text-muted)]">{m.lacks.join(', ')}</span>
        </li>
      ))}
    </ul>
  )
}
