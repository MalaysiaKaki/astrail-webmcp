'use client'

import type { TripBundle } from '@/lib/trip/backend-types'
import OrchestratorSummary from '../OrchestratorSummary'
import TripFeedbackPanel from '../TripFeedbackPanel'
import type { FeedbackComposer } from '../use-feedback-composer'
import { MissingDetails } from '../mobile/AboutThisTrip'

/**
 * The end of the desktop Trip tab (A10 item 5; plan v2 §6, About redistributed): the trip summary
 * and the feedback card, plus the read-only note on the sample. Everything else About held has a
 * home of its own on desktop: preferences and trade-offs in For you, the agent's decisions in How
 * it was built, the stats and the missing-details list in the hero. The phone keeps AboutThisTrip.
 */
export default function DesktopAbout({ bundle, readOnly, feedback }: {
  bundle: TripBundle
  readOnly: boolean
  feedback?: FeedbackComposer
}) {
  // Same explicit status allowlist as the phone's About (plan T3), not reachability.
  const showFeedback = !readOnly && (bundle.trip.status === 'complete' || bundle.trip.status === 'saved_with_gaps')
  return (
    <section aria-labelledby="desktop-about-heading" className="mt-8 flex flex-col gap-3">
      <h3 id="desktop-about-heading" className="type-display text-[20px] leading-tight text-[var(--m-text)]">About this trip</h3>
      {readOnly ? (
        <p className="t-meta px-1">
          A saved example, not an account. Nothing here can be changed or saved — plan your own trail to
          edit an itinerary.
        </p>
      ) : null}
      {/* The hero's missing-details badge hides with the hero's chips on a short viewport (844x390);
          the list is here then, so it is never out of reach. */}
      {bundle.trip.status === 'saved_with_gaps' ? (
        <div className="hidden [@media(max-height:560px)]:block">
          <h4 className="t-card-title mb-2 text-[var(--m-accent)]">Some stops are missing details</h4>
          <MissingDetails bundle={bundle} />
        </div>
      ) : null}
      <div className="m-card px-4 py-3.5">
        <OrchestratorSummary bundle={bundle} hideGapsBadge />
      </div>
      {showFeedback ? (
        <div className="m-card flex flex-col gap-2 px-4 py-3.5">
          <h4 className="t-card-title text-[var(--m-text)]">How was this trail?</h4>
          <TripFeedbackPanel key={bundle.trip.id} tripId={bundle.trip.id} composer={feedback} />
        </div>
      ) : null}
    </section>
  )
}
