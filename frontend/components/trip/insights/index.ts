/**
 * Trip insights: the FROZEN interface Tab A wires in (end of B8, plan amendments 1–5 and 8).
 *
 * Components
 *   <ForYouTab bundle readOnly onRevealPlace memoryReader? />
 *     - bundle: TripBundle. readOnly: the anonymous demo (`/app/trip/demo`): no memory_events
 *       query, the sample-labelled fixture instead, no Settings links, no Check again.
 *     - onRevealPlace(placeId): called with a stop's `place_id` from "Picked for you". Tab A
 *       passes its `revealPlace`, which selects the owning day, switches to the Trip tab, reopens
 *       a collapsed panel, exits Stay mode, and scrolls to the card or the undayed fallback.
 *     - Mount it only while the For you tab is open: each mount re-reads memory_events once
 *       (the write-back lands after the trip's result). Nothing is cached across mounts.
 *   <BuildTimeline bundle />
 *     - Pure render of the bundle; no callbacks. Includes the "Show full log" disclosure (the
 *       former AgentDecisionRail content, filtered).
 *
 * Libraries (lib/trip/insights), for the hero and anything else Tab A needs:
 *   - heroPreferenceBadge(bundle): 'Planned around your taste' | 'Planned with your preferences' | null
 *   - heroPreferenceItems(bundle): { items, more } | null — the hero's preference chips, same gate
 *   - tripPreferenceModel(bundle), corroboratedPreferenceSource(events)
 *   - reelProvenance(bundle): { behind: {url, thumbnailUrl}[], submittedCount: number | null, fromLibrary }
 *     (`behind` = cover cluster source, canonical-deduped; submittedCount null = not recorded)
 *   - buildSteps(bundle), fullLogEvents(bundle)
 *   - useTripMemoryWrites / fetchTripMemoryWrites and MemoryWritesState:
 *     loading | unavailable | none | recorded(writes) | sample(writes)
 */
export { default as ForYouTab } from './ForYouTab'
export type { ForYouTabProps } from './ForYouTab'
export { default as BuildTimeline } from './BuildTimeline'
export type { BuildTimelineProps } from './BuildTimeline'

/** The reveal contract (plan amendment 5). */
export type RevealPlace = (placeId: string) => void

export {
  MEMORY_SUMMARY_PREFIX, corroboratedPreferenceSource, heroPreferenceBadge, heroPreferenceItems, tripPreferenceModel,
} from '@/lib/trip/insights/memory'
export type { HeroPreferenceBadge, TripPreferenceModel } from '@/lib/trip/insights/memory'
export { buildSteps, canonicalReelKey, fullLogEvents, reelProvenance } from '@/lib/trip/insights/build-steps'
export type {
  BuildStep, BuildStepCount, BuildStepKey, BuildStepState, ReelProvenance, ReelRef,
} from '@/lib/trip/insights/build-steps'
export { fetchTripMemoryWrites, useTripMemoryWrites } from '@/lib/trip/insights/memory-events'
export type { MemoryEventsReader, MemoryWrite, MemoryWritesState } from '@/lib/trip/insights/memory-events'
