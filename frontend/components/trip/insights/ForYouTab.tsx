'use client'

import type { PreferenceSource, TripBundle } from '@/lib/trip/backend-types'
import { tripPreferenceModel } from '@/lib/trip/insights/memory'
import { useTripMemoryWrites, type MemoryEventsReader } from '@/lib/trip/insights/memory-events'
import MemoryWritesSection from './MemoryWritesSection'
import PickedForYou from './PickedForYou'
import { Chip, SectionHeading, SettingsCardLink } from './parts'

export interface ForYouTabProps {
  bundle: TripBundle
  /** The read-only demo: no memory query, the sample fixture instead, no Settings links. */
  readOnly: boolean
  /** "Picked for you" items call this with the stop's `place_id` (the frozen revealPlace contract). */
  onRevealPlace: (placeId: string) => void
  /** Test seam for the `memory_events` read; defaults to the authenticated browser client. */
  memoryReader?: MemoryEventsReader
}

const SOURCE_TAG: Record<PreferenceSource, string> = {
  memory: 'From your memory',
  explicit: 'You told us',
  inferred_default: 'Inferred from your Reels',
}

/**
 * The For you tab: what this trip was planned with, what it sent to memory, and what Astrail
 * picked. Mount it only while the tab is open: mounting is what re-queries `memory_events`
 * (the write-back lands after the trip's result, so an early read can be empty).
 */
export default function ForYouTab({ bundle, readOnly, onRevealPlace, memoryReader }: ForYouTabProps) {
  const model = tripPreferenceModel(bundle)
  const { state, checkAgain } = useTripMemoryWrites({
    tripId: bundle.trip.id, ownerId: bundle.trip.user_id, sample: readOnly, reader: memoryReader,
  })
  return (
    <div data-for-you-tab className="flex flex-col gap-8">
      <PlannedWith model={model} />
      <MemoryWritesSection
        state={state}
        checkAgain={() => { void checkAgain() }}
        usedMemory={model.kind === 'memory_facts'}
        readOnly={readOnly}
      />
      <PickedForYou bundle={bundle} onRevealPlace={onRevealPlace} />
      {readOnly ? null : <SettingsCardLink>Manage what Astrail remembers</SettingsCardLink>}
    </div>
  )
}

function PlannedWith({ model }: { model: ReturnType<typeof tripPreferenceModel> }) {
  if (model.kind === 'memory_facts') {
    return (
      <section aria-labelledby="insights-planned-with" className="flex flex-col gap-3">
        <SectionHeading id="insights-planned-with" sub="Recalled from your memory when this trip was planned.">
          What Astrail remembered about how you travel
        </SectionHeading>
        <ul className="flex flex-wrap gap-2">
          {model.facts.map((fact, i) => (
            <li key={i} className="m-card flex min-h-11 max-w-full items-center gap-2 rounded-[var(--m-r-pill)] py-2 pl-2 pr-4">
              <Chip tone="accent">Memory</Chip>
              <span data-testid="memory-fact" className="t-body min-w-0 break-words text-[var(--m-text)]">{fact}</span>
            </li>
          ))}
        </ul>
      </section>
    )
  }
  // Uncorroborated stored prose (e.g. stale profile text beside the event) is shown as a record,
  // never as what the trip was planned with, and without a source tag.
  const verified = model.kind === 'note' && model.source !== null
  return (
    <section aria-labelledby="insights-planned-with" className="flex flex-col gap-3">
      {verified || model.kind === 'none' ? (
        <SectionHeading id="insights-planned-with">Preferences this trip was planned with</SectionHeading>
      ) : (
        <SectionHeading id="insights-planned-with" sub="Astrail can't confirm these notes were used to plan it.">
          Preference notes recorded on this trip
        </SectionHeading>
      )}
      {model.kind === 'note' ? (
        <div className="m-card flex flex-col items-start gap-2 px-4 py-3.5">
          {model.source ? <Chip tone="accent">{SOURCE_TAG[model.source]}</Chip> : null}
          {/* Plain text, whitespace kept: profile summaries are multi-line (guardrail #11). */}
          <p className="t-body-lg whitespace-pre-line break-words text-[var(--m-text)]">{model.text}</p>
        </div>
      ) : (
        <p className="m-subcard t-meta px-4 py-3">No preferences were recorded for this trip.</p>
      )}
    </section>
  )
}
