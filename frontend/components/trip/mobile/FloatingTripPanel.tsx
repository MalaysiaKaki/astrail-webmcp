'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { measurePanelObstruction, setPanelObstruction } from '@/lib/trip/panel-obstruction'
import { DateStrip, SheetHeading, TripPanelBody, type MobileTripViewProps } from './MobileTripView'
import { tripDateRange, tripTitle } from '@/lib/trip/trip-presenters'

/** Longer than the 300ms slide, so a measurement lands on the settled box. */
export const PANEL_SETTLE_MS = 340

export type FloatingTripPanelProps = MobileTripViewProps & {
  open: boolean
  onClose: () => void
  onOpen: () => void
}

/**
 * The desktop trip view (plan A6): the phone sheet's content model in a floating kit panel on the
 * left of a full-bleed map — serif heading, date strip, day sub-header, stop cards with their legs,
 * About this trip, and the Stay view. The SAME components as the phone (MobileTripView's pieces),
 * so the two widths cannot drift apart; only the container differs.
 *
 * It is the one writer of the left-obstruction signal (lib/trip/panel-obstruction): its measured
 * right edge once settled, 0 the moment it collapses and on unmount. The camera pads by it.
 *
 * Collapse slides the panel out and leaves a kit "Stops" button in its corner; the panel is inert
 * while hidden, so neither the pointer nor the tab order can reach it.
 */
export default function FloatingTripPanel(p: FloatingTripPanelProps) {
  const ref = useRef<HTMLElement>(null)
  useReportPanel(ref, p.open)
  // Keyboard continuity: collapsing makes the panel inert, which drops focus to <body>. The press
  // that moved it hands focus to its twin (hide ⇄ reopen), so Tab picks up where the user was.
  const hideRef = useRef<HTMLButtonElement>(null)
  const reopenRef = useRef<HTMLButtonElement>(null)
  const moveFocus = useRef(false)
  useEffect(() => {
    if (!moveFocus.current) return
    moveFocus.current = false
    ;(p.open ? hideRef : reopenRef).current?.focus()
  }, [p.open])
  return (
    <div className="paper-scope mobile-trip pointer-events-none absolute inset-0">
      <aside
        ref={ref}
        id="trip-details-panel"
        aria-label="Trip details"
        inert={!p.open}
        className={[
          'ui-floating-panel pointer-events-auto absolute bottom-4 left-4 top-4 z-10 flex flex-col',
          'w-[clamp(340px,34vw,440px)]',
          'transition-transform duration-300 ease-out motion-reduce:transition-none',
          p.open ? 'translate-x-0' : '-translate-x-[calc(100%+24px)]',
        ].join(' ')}
      >
        <div className="flex shrink-0 items-start gap-3 px-4 pb-2 pt-4">
          <Link href="/app/trips" aria-label="All trails" className="m-btn-icon shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="15 5 8 12 15 19" />
            </svg>
          </Link>
          <div className="min-w-0 flex-1 pt-0.5">
            <SheetHeading title={tripTitle(p.bundle.trip)} dates={tripDateRange(p.bundle.trip)} readOnly={p.readOnly} />
          </div>
          <button
            ref={hideRef}
            type="button"
            onClick={() => { moveFocus.current = true; p.onClose() }}
            aria-label="Hide trip details and show the full map"
            // No aria-expanded here: the kit paints [aria-expanded="true"] as a pressed ink circle,
            // and this is an action, not a toggle state. The reopen button carries it (false).
            aria-controls="trip-details-scroll"
            className="m-btn-icon shrink-0"
          >
            {/* A panel sliding out to the left: "put the list away", not "close the trip". */}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
              <path d="M9.5 4.5v15M15.5 9.5 13 12l2.5 2.5" />
            </svg>
          </button>
        </div>
        <div className="shrink-0 px-4"><DateStrip {...p} /></div>
        <div
          id="trip-details-scroll"
          data-trip-scroll
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-2"
        >
          <TripPanelBody {...p} />
        </div>
      </aside>

      {!p.open ? (
        <button
          ref={reopenRef}
          type="button"
          onClick={() => { moveFocus.current = true; p.onOpen() }}
          aria-label="Show trip details"
          aria-expanded={false}
          aria-controls="trip-details-scroll"
          className="m-btn-primary pointer-events-auto absolute left-4 top-4 z-20"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-4 w-4">
            <polyline points="9 6 15 12 9 18" />
          </svg>
          Stops
        </button>
      ) : null}
    </div>
  )
}

function useReportPanel(ref: React.RefObject<HTMLElement | null>, open: boolean) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const el = ref.current
    const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null } }
    if (!open || !el) {
      clear()
      setPanelObstruction(0)
      return clear
    }
    const measure = () => {
      timer.current = null
      setPanelObstruction(measurePanelObstruction({
        right: el.getBoundingClientRect().right,
        viewportWidth: window.innerWidth,
        collapsed: false,
      }))
    }
    const schedule = () => { clear(); timer.current = setTimeout(measure, PANEL_SETTLE_MS) }
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
  }, [ref, open])
  useEffect(() => () => setPanelObstruction(0), [])
}
