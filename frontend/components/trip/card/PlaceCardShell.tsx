'use client'

import { useId } from 'react'
import { useOptionalWebMcpRegistry } from '@/components/webmcp/WebMcpRegistry'

export type CardCloseReason = 'escape' | 'button'

/**
 * The desktop map place card's frame (A10; Codex map-card review §1 and §5): a nonmodal dialog
 * named by its heading, a fixed header (where this place sits in the trip, prev/next, close) over
 * one bounded scroller, so close and navigation stay reachable however tall the body is. The
 * placement sets `--place-card-max-h` on the popup host; the body takes whatever that leaves.
 *
 * Escape is scoped to the card, not the document, and yields to a pending agent approval: the
 * approval card owns Escape (it declines), and one key press must never dismiss both.
 */
export default function PlaceCardShell({
  meta, title, subtitle, nav, onClose, children, label = 'place', inline = false,
}: {
  /** "Stop 3 of 5 · Day 1", "Where to eat · Ramen". */
  meta: string | null
  title: string
  /** The category and provenance line under the title. */
  subtitle?: React.ReactNode
  nav?: { prev: (() => void) | null; next: (() => void) | null } | null
  onClose: (reason: CardCloseReason) => void
  children: React.ReactNode
  /** For the close button's name: "Close stop details". */
  label?: string
  /** In the sidebar (the map cannot show it, Codex final #3): a region in the list, not a dialog;
   *  full width, no height budget, and no Escape (nothing floats over the page). */
  inline?: boolean
}) {
  const headingId = useId()
  const pending = useOptionalWebMcpRegistry()?.pending ?? null
  return (
    <div
      role={inline ? 'region' : 'dialog'}
      aria-labelledby={headingId}
      tabIndex={-1}
      data-place-card={inline ? undefined : ''}
      data-sidebar-detail={inline ? '' : undefined}
      onKeyDown={inline ? undefined : (e) => {
        if (e.key !== 'Escape' || pending) return
        e.stopPropagation()
        onClose('escape')
      }}
      className={[
        'm-card flex flex-col overflow-hidden text-left outline-none',
        inline ? 'mb-4 w-full scroll-mt-3 focus-visible:shadow-[var(--m-focus)]' : 'place-card w-[360px] max-w-full',
      ].join(' ')}
      style={inline ? undefined : { maxHeight: 'var(--place-card-max-h, 70vh)', boxShadow: 'var(--m-shadow-2)' }}
    >
      <div data-card-header className="flex shrink-0 flex-col gap-1 px-4 pb-3 pt-2">
        <div className="-mr-2 flex min-h-11 items-center gap-1">
          <p className="t-meta min-w-0 flex-1 truncate font-medium tabular-nums">{meta}</p>
          {nav ? (
            <>
              <IconButton label="Previous stop" onClick={nav.prev} d="M15 5 8 12l7 7" />
              <IconButton label="Next stop" onClick={nav.next} d="m9 5 7 7-7 7" />
            </>
          ) : null}
          <IconButton label={`Close ${label} details`} onClick={() => onClose('button')} d="M6 6l12 12M18 6 6 18" />
        </div>
        <h2 id={headingId} className="type-display line-clamp-2 text-[length:var(--t-title)] leading-[1.15] text-[var(--m-text)] [overflow-wrap:anywhere]">
          {title}
        </h2>
        {subtitle ? <p className="t-meta truncate">{subtitle}</p> : null}
      </div>
      <div data-card-body className="flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pb-4">
        {children}
      </div>
    </div>
  )
}

function IconButton({ label, onClick, d }: { label: string; onClick: (() => void) | null; d: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick ?? undefined}
      disabled={!onClick}
      className="m-btn-icon shrink-0 !shadow-none disabled:opacity-35"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round"
        strokeLinejoin="round" aria-hidden>
        <path d={d} />
      </svg>
    </button>
  )
}

/** A card link row inside a card (the day overview, the sidebar detail, See all). */
export function CardLink({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="m-card-link t-body font-semibold text-[var(--m-text)]">
      <span className="min-w-0 flex-1 truncate text-left">{children}</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round"
        strokeLinejoin="round" aria-hidden className="m-chevron">
        <polyline points="9 6 15 12 9 18" />
      </svg>
    </button>
  )
}

/** An optional part of the detail behind a disclosure (why it is here, more quotes, local name). */
export function CardDisclosure({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="group/d">
      <summary className="t-body flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-[var(--m-r-card)] font-medium text-[var(--m-text)] focus-visible:outline-none focus-visible:shadow-[var(--m-focus)] [&::-webkit-details-marker]:hidden">
        {summary}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round"
          strokeLinejoin="round" aria-hidden
          className="m-chevron transition-transform group-open/d:rotate-180 motion-reduce:transition-none">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </summary>
      <div className="flex flex-col gap-2 pb-1 pt-1">{children}</div>
    </details>
  )
}
