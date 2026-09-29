'use client'

import type { Trip } from '@/lib/trip/backend-types'
import TripPreferenceNote from '../TripPreferenceNote'
import TradeoffPanel from '../TradeoffPanel'
import AgentDecisionRail from '../AgentDecisionRail'
import type { MobileTripViewProps } from '../mobile/MobileTripView'

/*
 * A9 INTERIM. Tab B is building the real For you and How it was built tabs
 * (components/trip/insights), wired in by A10. Until then these tabs show the existing,
 * already-honest components for the same questions, so neither tab is empty and nothing is
 * invented. Delete this file in A10.
 */

/**
 * Placeholder hero badge until B's memory helper corroborates the source (amendment 2): the neutral
 * wording whenever the trip stored a preference summary, and nothing when it did not. The stronger
 * "Planned around your taste" needs the persisted `preferences` event to confirm memory was used,
 * which is B's helper's job, so it is never claimed here.
 */
export function placeholderBadge(trip: Trip): string | null {
  return typeof trip.preference_summary === 'string' && trip.preference_summary.trim()
    ? 'Planned with your preferences'
    : null
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="type-display mb-3 mt-4 text-[length:var(--t-title)] leading-tight text-[var(--m-text)]">{children}</h3>
}

export function ForYouInterim(p: MobileTripViewProps) {
  const hasSummary = typeof p.bundle.trip.preference_summary === 'string' && p.bundle.trip.preference_summary.trim() !== ''
  const hasTradeoffs = (p.bundle.trip.tradeoffs?.notes ?? []).length > 0
  return (
    <div data-testid="for-you-interim">
      <Heading>What this trip was planned with</Heading>
      {hasSummary ? (
        <div className="m-card px-4 pt-4"><TripPreferenceNote trip={p.bundle.trip} /></div>
      ) : (
        <p className="type-body m-subcard px-4 py-4 text-[length:var(--t-body)] text-[var(--m-text-muted)]">
          No preferences were recorded for this trip.
        </p>
      )}
      {hasTradeoffs ? (
        <>
          <Heading>Trade-offs Astrail made</Heading>
          <TradeoffPanel tradeoffs={p.bundle.trip.tradeoffs} variant="notes" />
        </>
      ) : null}
    </div>
  )
}

export function BuildInterim(p: MobileTripViewProps) {
  return (
    <div data-testid="build-interim">
      <Heading>How Astrail built this</Heading>
      <AgentDecisionRail events={p.bundle.events} />
    </div>
  )
}
