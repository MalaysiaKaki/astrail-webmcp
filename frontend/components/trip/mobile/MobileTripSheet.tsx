'use client'

import { useEffect, useRef } from 'react'
import { measureObstruction, setSheetExpanded, setSheetObstruction } from '@/lib/trip/sheet-obstruction'

export type SheetState = 'compact' | 'expanded' | 'hidden'

/** Longer than the 300ms height/slide transition, so a measurement lands on the settled box. */
export const SHEET_SETTLE_MS = 340

/**
 * The phone's bottom sheet: two heights plus hidden, with the map above it.
 *
 * It is the one writer of the sheet-obstruction signal. It measures its own top edge once it has
 * settled — debounced, because a height transition fires a ResizeObserver callback every frame and
 * the camera should re-pad once, not thirty times — and publishes 0 immediately on hide and on
 * unmount. Hidden is 0 by definition; waiting for the slide to finish would keep the camera padded
 * for a sheet the user just put away.
 *
 * The grab area is a real 44px button (tap toggles height). Drag is deliberately not implemented:
 * a tap target with keyboard and ARIA parity is the acceptance bar; a drag handle is polish.
 */
export default function MobileTripSheet({
  state, onToggleHeight, onHide, onReopen, header, children,
}: {
  state: SheetState
  onToggleHeight: () => void
  onHide: () => void
  onReopen: () => void
  /** Pinned above the scrolling list: the day/Stay chips and the one-line stats. */
  header: React.ReactNode
  children: React.ReactNode
}) {
  const ref = useRef<HTMLElement>(null)
  const hidden = state === 'hidden'
  const expanded = state === 'expanded'
  useReportObstruction(ref, state)

  return (
    <>
      <section
        ref={ref}
        data-testid="mobile-trip-sheet"
        aria-label="Trip itinerary"
        inert={hidden}
        className={[
          'pointer-events-auto absolute inset-x-0 bottom-0 z-10 flex flex-col',
          'rounded-t-[22px] border-t border-[var(--line)] bg-[var(--paper-0)]',
          'shadow-[0_-10px_30px_rgba(10,13,20,0.22)]',
          'transition-[height,transform] duration-300 ease-out motion-reduce:transition-none',
          expanded ? 'h-[88dvh]' : 'h-[45dvh]',
          hidden ? 'translate-y-full' : 'translate-y-0',
        ].join(' ')}
      >
        <div className="relative shrink-0">
          {/* Full-width grab row. The hide control sits at the LEFT edge so the agent chip, which
              rides the sheet's top-right edge, never lands on it in the expanded state. */}
          <button
            type="button"
            onClick={onToggleHeight}
            aria-expanded={expanded}
            aria-controls="mobile-trip-sheet-body"
            aria-label={expanded ? 'Collapse trip sheet' : 'Expand trip sheet'}
            className="flex h-11 w-full items-center justify-center rounded-t-[22px] focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[var(--brass)]"
          >
            <span aria-hidden className="h-[5px] w-10 rounded-full bg-[var(--paper-line-2,var(--line))]" />
          </button>
          <button
            type="button"
            onClick={onHide}
            aria-label="Hide trip sheet and show the full map"
            className="absolute left-1 top-0 flex h-11 w-11 items-center justify-center rounded-full text-[var(--muted)] focus-visible:outline-2 focus-visible:outline-[var(--brass)]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-5 w-5">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
        <div className="shrink-0 px-4">{header}</div>
        <div
          id="mobile-trip-sheet-body"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-2 pb-[calc(24px+env(safe-area-inset-bottom))]"
        >
          {children}
        </div>
      </section>

      {hidden ? (
        <button
          type="button"
          onClick={onReopen}
          aria-label="Show trip sheet"
          className={[
            'pointer-events-auto absolute left-1/2 z-20 -translate-x-1/2',
            'bottom-[calc(16px+env(safe-area-inset-bottom))]',
            'type-label flex h-11 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--paper-0)] px-5',
            'text-[14px] text-[var(--starlight)] shadow-[0_4px_18px_rgba(10,13,20,0.28)]',
          ].join(' ')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-4 w-4">
            <polyline points="6 15 12 9 18 15" />
          </svg>
          Stops
        </button>
      ) : null}
    </>
  )
}

function useReportObstruction(ref: React.RefObject<HTMLElement | null>, state: SheetState) {
  const hidden = state === 'hidden'
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const el = ref.current
    const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null } }
    if (hidden || !el) {
      clear()
      setSheetObstruction(0)
      return clear
    }
    const measure = () => {
      timer.current = null
      setSheetObstruction(measureObstruction({
        top: el.getBoundingClientRect().top,
        viewportHeight: window.innerHeight,
        hidden: false,
      }))
    }
    const schedule = () => { clear(); timer.current = setTimeout(measure, SHEET_SETTLE_MS) }
    schedule()
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null
    ro?.observe(el)
    el.addEventListener('transitionend', schedule)
    window.addEventListener('resize', schedule)
    return () => {
      clear()
      ro?.disconnect()
      el.removeEventListener('transitionend', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [ref, state, hidden])

  // Whether the sheet is up over the whole screen (the dock hides its chip then).
  useEffect(() => { setSheetExpanded(state === 'expanded') }, [state])

  // Separate, mount-scoped: the values must not outlive the route that set them.
  useEffect(() => () => { setSheetObstruction(0); setSheetExpanded(false) }, [])
}
