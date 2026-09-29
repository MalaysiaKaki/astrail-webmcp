'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'
import Link from 'next/link'
import { measurePanelObstruction, setPanelObstruction } from '@/lib/trip/panel-obstruction'
import { DateStrip, TripPanelBody, type MobileTripViewProps } from './MobileTripView'
import TripHero from '../panel/TripHero'
import { tripTitle } from '@/lib/trip/trip-presenters'
import TripTabs, { panelId, tabId } from '../panel/TripTabs'
import { BuildTimeline, ForYouTab, heroPreferenceItems } from '../insights'

/** Longer than the 300ms slide, so a measurement lands on the settled box. */
export const PANEL_SETTLE_MS = 340

export type FloatingTripPanelProps = MobileTripViewProps & {
  open: boolean
  onClose: () => void
  onOpen: () => void
}

/**
 * The desktop trip view (plan A6, rebuilt by the v2 plan): a floating kit panel on the left of a
 * full-bleed map. A fixed header — the back and hide controls, the hero (Reel covers, title,
 * dates, stat chips, the personalised badge) and the segmented tabs — over one scroller per tab.
 *
 *   Trip           the navigator (A10): the date strip, the day header (weather, summary), compact
 *                  stop rows with their legs, the day's places to eat, the day overview, and the
 *                  trip summary and feedback. A stop's detail is the place card at its pin on the
 *                  map; it expands here only when the map cannot show it, or on request.
 *   For you        Tab B's ForYouTab: what the trip was planned with, what it sent to memory, what
 *                  Astrail picked, the trade-offs. Mounted only while open (it re-reads memory).
 *   How it was     Tab B's BuildTimeline, with the full log.
 *   built
 *
 * The map and the agent tools live outside this panel (TripWorkspace), so switching tabs never
 * remounts the map or interrupts the camera. Only the open tab is mounted; the Trip tab's scroll
 * position is kept across a round trip through the others.
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
  const tripScroll = useKeptScroll(p.tab === 'trip')
  return (
    <div className="paper-scope mobile-trip pointer-events-none absolute inset-0">
      <aside
        ref={ref}
        id="trip-details-panel"
        aria-label="Trip details"
        inert={!p.open}
        // The panel clips (the kit's overflow:hidden); it never scrolls. A descendant's
        // scrollIntoView that its own scroller cannot satisfy (a short list of compact rows) would
        // otherwise scroll THIS box and slide the hero out of sight (A10 runtime finding).
        onScroll={(e) => { const el = e.currentTarget; if (el.scrollTop || el.scrollLeft) { el.scrollTop = 0; el.scrollLeft = 0 } }}
        className={[
          'ui-floating-panel pointer-events-auto absolute bottom-4 left-4 top-4 z-10 flex flex-col',
          'w-[clamp(340px,34vw,440px)]',
          'transition-transform duration-300 ease-out motion-reduce:transition-none',
          p.open ? 'translate-x-0' : '-translate-x-[calc(100%+24px)]',
        ].join(' ')}
      >
        <header className="flex shrink-0 flex-col gap-3 px-4 pb-3 pt-4 [@media(max-height:560px)]:gap-2 [@media(max-height:560px)]:pb-2 [@media(max-height:560px)]:pt-3">
          <div className="flex items-center justify-between gap-3">
            <Link href="/app/trips" aria-label="All trails" className="m-btn-icon shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="15 5 8 12 15 19" />
              </svg>
            </Link>
            {/* Short viewports (844x390 landscape): the hero gives its height back to the list and
                the title rides this row instead. Hidden from AT here: the hero's heading is the one
                heading, and it stays in the tree (visually hidden) at every height. */}
            <p aria-hidden className="type-display hidden min-w-0 flex-1 truncate text-[length:var(--t-title)] leading-tight text-[var(--m-text)] [@media(max-height:560px)]:block">
              {tripTitle(p.bundle.trip)}
            </p>
            <button
              ref={hideRef}
              type="button"
              onClick={() => { moveFocus.current = true; p.onClose() }}
              aria-label="Hide trip details and show the full map"
              // No aria-expanded here: the kit paints [aria-expanded="true"] as a pressed ink circle,
              // and this is an action, not a toggle state. The reopen button carries it (false).
              aria-controls="trip-details-panel"
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
          <div className="[@media(max-height:560px)]:sr-only">
            <TripHero bundle={p.bundle} readOnly={p.readOnly} preferences={heroPreferenceItems(p.bundle)} />
          </div>
          <TripTabs tab={p.tab} onTab={p.onTab} />
        </header>

        {p.tab === 'trip' ? (
          <div role="tabpanel" id={panelId('trip')} aria-labelledby={tabId('trip')} className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 px-4"><DateStrip {...p} /></div>
            <div
              id="trip-details-scroll"
              ref={tripScroll}
              data-trip-scroll
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-2"
            >
              <TripPanelBody {...p} dayHeader="card" />
            </div>
          </div>
        ) : (
          <div
            role="tabpanel"
            id={panelId(p.tab)}
            aria-labelledby={tabId(p.tab)}
            // A focusable panel is the WAI-ARIA default when its first content is not a control.
            tabIndex={0}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-1 focus-visible:outline-none focus-visible:shadow-[inset_var(--m-focus)]"
          >
            {p.tab === 'for-you'
              ? <ForYouTab bundle={p.bundle} readOnly={p.readOnly} onRevealPlace={p.onRevealPlace} />
              : <BuildTimeline bundle={p.bundle} />}
          </div>
        )}
      </aside>

      {!p.open ? (
        <button
          ref={reopenRef}
          type="button"
          onClick={() => { moveFocus.current = true; p.onOpen() }}
          aria-label="Show trip details"
          aria-expanded={false}
          aria-controls="trip-details-panel"
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

/**
 * The Trip tab's scroll position, kept while another tab is open (only the open tab is mounted).
 * Restored before paint on the way back; a reveal that lands in the same render scrolls after it.
 */
function useKeptScroll(mounted: boolean) {
  const top = useRef(0)
  const el = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    if (!mounted || !el.current) return
    const node = el.current
    node.scrollTop = top.current
    return () => { top.current = node.scrollTop }
  }, [mounted])
  return el
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
