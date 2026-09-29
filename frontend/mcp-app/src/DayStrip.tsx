/**
 * The phone trip page's date strip (mobile/MobileTripView `DateStrip` + `StripCell`), same cells and
 * classes, with only the props it reads. The exported DateStrip takes the whole MobileTripViewProps
 * (map, sheet, feedback composer) and its module imports the phone sheet and map controls, so it is
 * mirrored rather than imported. Dropped from the original: the `max-height:700px` shrink, which is
 * about the phone sheet's height, not an iframe that sizes itself to its content.
 */
import { useEffect, useRef } from 'react'
import type { TripDay } from '@/lib/trip/backend-types'
import { dayLabel } from '@/lib/trip/day-labels'

export type ListView = 'stops' | 'stay'

const CELL = [
  'flex w-[52px] shrink-0 flex-col items-center justify-center gap-1 rounded-2xl h-[60px]',
  'transition-[transform,background-color] duration-[var(--m-dur-press)] active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100',
  'focus-visible:outline-none focus-visible:shadow-[var(--m-focus)]',
].join(' ')

function StripCell({ current, onClick, label, big, small }: {
  current: boolean
  onClick: () => void
  label: string
  big: React.ReactNode
  small: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-current={current ? 'true' : undefined}
      className={[CELL, current ? 'bg-[var(--m-accent-wash)] text-[var(--m-text)]' : 'text-[var(--m-text-muted)]'].join(' ')}
    >
      <span aria-hidden className="type-display text-[22px] leading-none">{big}</span>
      <span aria-hidden className="type-body text-[14px] leading-none font-medium [font-variant-caps:all-small-caps]">{small}</span>
    </button>
  )
}

/** Clearance past the strip's edge when revealing a cell: the strip's own px-4 gutter. */
const REVEAL_GUTTER = 16

/**
 * The strip's scrollLeft that brings `cell` fully into view, or the current one if it already is.
 * Horizontal only, by setting scrollLeft on the strip itself: scrollIntoView would also scroll the
 * host page vertically, which a widget must never do to the conversation around it.
 */
export function revealScrollLeft(strip: HTMLElement, cell: HTMLElement): number {
  const s = strip.getBoundingClientRect()
  const c = cell.getBoundingClientRect()
  if (c.left < s.left + REVEAL_GUTTER) return Math.max(0, strip.scrollLeft - (s.left + REVEAL_GUTTER - c.left))
  if (c.right > s.right - REVEAL_GUTTER) return strip.scrollLeft + (c.right - (s.right - REVEAL_GUTTER))
  return strip.scrollLeft
}

export default function DayStrip({ days, activeDayNumber, listView, showStay, onSelectDay, onStay }: {
  days: TripDay[]
  activeDayNumber: number | null
  listView: ListView
  /** Only when the trip has hotels, as on the phone. */
  showStay: boolean
  onSelectDay: (dayNumber: number) => void
  onStay: () => void
}) {
  const stripRef = useRef<HTMLDivElement>(null)
  // A focused or restored Day 12 would otherwise open with its cell offscreen (Codex F5). Runs on
  // mount and on every selection change, including the Stay cell.
  useEffect(() => {
    const strip = stripRef.current
    const cell = strip?.querySelector<HTMLElement>('[aria-current="true"]')
    if (strip && cell) strip.scrollLeft = revealScrollLeft(strip, cell)
  }, [activeDayNumber, listView])
  return (
    <div ref={stripRef} role="group" aria-label="Trip days" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
      {days.map((d) => {
        const label = dayLabel(d)
        return (
          <StripCell
            key={d.id}
            current={listView === 'stops' && d.day_number === activeDayNumber}
            onClick={() => onSelectDay(d.day_number)}
            label={label.name}
            big={label.big}
            small={label.small}
          />
        )
      })}
      {showStay ? (
        <StripCell
          current={listView === 'stay'}
          onClick={onStay}
          label="Stay"
          small="stay"
          big={(
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
              strokeLinecap="round" strokeLinejoin="round" className="h-[22px] w-[22px]">
              <path d="M3 18V7M3 14h18v4M21 14v-2.5A2.5 2.5 0 0 0 18.5 9H11v5" />
              <circle cx="7" cy="11" r="1.8" />
            </svg>
          )}
        />
      ) : null}
    </div>
  )
}
