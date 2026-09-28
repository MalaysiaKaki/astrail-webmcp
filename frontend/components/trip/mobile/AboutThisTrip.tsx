'use client'

import type { TripBundle } from '@/lib/trip/backend-types'
import OrchestratorSummary from '../OrchestratorSummary'
import TripPreferenceNote from '../TripPreferenceNote'
import TradeoffPanel from '../TradeoffPanel'
import AgentDecisionRail from '../AgentDecisionRail'
import TripFeedbackPanel from '../TripFeedbackPanel'
import type { FeedbackComposer } from '../use-feedback-composer'

/**
 * Everything the desktop rail shows ABOVE the stops, moved to the end of the phone list behind
 * one disclosure. Nothing is removed — only the order and the default disclosure change — so the
 * first screen of the sheet is the route.
 *
 * A native <details>, not a conditional render: the feedback composer inside keeps its draft when
 * the section is closed and reopened.
 */
export default function AboutThisTrip({ bundle, readOnly, feedback }: {
  bundle: TripBundle
  readOnly: boolean
  feedback?: FeedbackComposer
}) {
  // Same explicit status allowlist as the desktop rail (plan T3), not reachability.
  const withGaps = bundle.trip.status === 'saved_with_gaps'
  const showFeedback = !readOnly && (bundle.trip.status === 'complete' || bundle.trip.status === 'saved_with_gaps')
  return (
    <details
      className="group mt-6 scroll-mt-2 border-t border-[var(--line)]"
      // Opened at the foot of a long list, its content would unfold below the fold with nothing
      // on screen changing. Bring it up so opening it visibly does something.
      onToggle={(e) => {
        const el = e.currentTarget
        if (!el.open) return
        const reduce = typeof window.matchMedia === 'function'
          && window.matchMedia('(prefers-reduced-motion: reduce)').matches
        el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
      }}
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-2 [&::-webkit-details-marker]:hidden">
        <span className="type-display text-[16px] text-[var(--starlight)]">About this trip</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden
          className="h-5 w-5 text-[var(--muted)] transition-transform group-open:rotate-180 motion-reduce:transition-none">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </summary>
      <div className="flex flex-col gap-4 pb-4">
        {readOnly ? (
          <p className="type-body text-[14px] text-[var(--muted)]">
            A saved example, not an account. Nothing here can be changed or saved — plan your own
            trail to edit an itinerary.
          </p>
        ) : null}
        {withGaps ? (
          <p className="type-body flex items-center gap-2 text-[14px] text-[var(--brass-bright)]">
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-[var(--brass)]" />
            Some stops are missing details
          </p>
        ) : null}
        <OrchestratorSummary bundle={bundle} hideGapsBadge />
        <TripPreferenceNote trip={bundle.trip} />
        <TradeoffPanel tradeoffs={bundle.trip.tradeoffs} variant="notes" />
        <section>
          <h3 className="type-display mb-2 text-[16px] text-[var(--starlight)]">How Astrail built this</h3>
          <AgentDecisionRail events={bundle.events} />
        </section>
        {showFeedback ? (
          <section>
            <h3 className="type-display mb-2 text-[16px] text-[var(--starlight)]">How was this trail?</h3>
            <TripFeedbackPanel key={bundle.trip.id} tripId={bundle.trip.id} composer={feedback} />
          </section>
        ) : null}
      </div>
    </details>
  )
}
