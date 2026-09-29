'use client'

import Link from 'next/link'
import type { MemoryWrite, MemoryWritesState } from '@/lib/trip/insights/memory-events'
import { Chip, ChevronRight, SectionHeading, formatDay } from './parts'

export const MEMORY_WRITES_HEADING = 'Preferences you gave this trip, sent to your memory'

/**
 * The `memory_events` write attempts for this trip (plan amendment 1). A row proves the text was
 * SENT, not that Mem0 kept it, so the copy says "sent" and points at Settings for what Astrail
 * remembers now. Never "learned", never "retained".
 */
export default function MemoryWritesSection({ state, checkAgain, usedMemory, readOnly }: {
  state: MemoryWritesState
  checkAgain: () => void
  /** The pipeline corroborated a memory-driven run: nothing new is written for those. */
  usedMemory: boolean
  readOnly: boolean
}) {
  return (
    <section aria-labelledby="insights-memory-writes" className="flex flex-col gap-3">
      <SectionHeading id="insights-memory-writes">{MEMORY_WRITES_HEADING}</SectionHeading>
      <Body state={state} checkAgain={checkAgain} usedMemory={usedMemory} readOnly={readOnly} />
    </section>
  )
}

function Body({ state, checkAgain, usedMemory, readOnly }: {
  state: MemoryWritesState
  checkAgain: () => void
  usedMemory: boolean
  readOnly: boolean
}) {
  switch (state.status) {
    case 'loading':
      return (
        <div role="status" className="m-subcard t-meta px-4 py-3">Checking what this trip sent to your memory…</div>
      )
    case 'unavailable':
      return (
        <StateCard
          text="Couldn't load this right now. Your trip is fine; only this record didn't load."
          action={readOnly ? null : checkAgain}
        />
      )
    case 'none':
      return (
        <StateCard
          text="No memory write recorded for this trip."
          secondary={usedMemory
            ? "This trip used your saved memory, so it didn't add anything new."
            : 'Astrail sends your stated preferences after the trip finishes, so a new trip can take a moment.'}
          action={readOnly ? null : checkAgain}
        />
      )
    case 'recorded':
    case 'sample':
      return (
        <div className="flex flex-col gap-2">
          {state.status === 'sample' ? (
            <p className="t-meta flex flex-wrap items-center gap-2 px-1">
              <Chip tone="accent">Sample</Chip>
              <span>The example trip has no account, so this shows what a planned trip records.</span>
            </p>
          ) : null}
          <ul className="flex flex-col gap-2">
            {state.writes.map((w) => <WriteCard key={w.id} write={w} />)}
          </ul>
          <p className="t-meta px-1">Saved when this trip was planned.</p>
          {readOnly ? null : (
            <Link href="/app/settings" className="m-card-link t-body font-semibold">
              <span className="min-w-0">See what Astrail remembers now</span>
              <ChevronRight />
            </Link>
          )}
        </div>
      )
  }
}

function WriteCard({ write }: { write: MemoryWrite }) {
  const day = formatDay(write.createdAt)
  return (
    <li data-memory-write className="m-card flex flex-col gap-2 px-4 py-3.5">
      {write.texts.map((t, i) => (
        // Plain text: the user's own words, never markup (guardrail #11).
        <p key={i} className="t-body-lg whitespace-pre-line break-words text-[var(--m-text)]">{`“${t}”`}</p>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        {day ? <span className="t-meta">Sent {day}</span> : null}
        {write.confirmed ? null : <Chip tone="warn">Astrail couldn&apos;t confirm this was saved</Chip>}
      </div>
    </li>
  )
}

function StateCard({ text, secondary, action }: { text: string; secondary?: string; action: (() => void) | null }) {
  return (
    <div className="m-subcard flex flex-col items-start gap-3 px-4 py-3.5">
      <div className="flex flex-col gap-1">
        <p className="t-body font-semibold text-[var(--m-text)]">{text}</p>
        {secondary ? <p className="t-meta">{secondary}</p> : null}
      </div>
      {action ? (
        <button type="button" className="m-btn-secondary" onClick={() => action()}>Check again</button>
      ) : null}
    </div>
  )
}
