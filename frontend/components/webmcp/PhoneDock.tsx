'use client'

import AgentActivityRail, { type ClearedMark } from './AgentActivityRail'
import ExamplePrompts from './ExamplePrompts'
import WebMcpStatus from './WebMcpStatus'

/**
 * The agent dock on a phone (below md).
 *
 * The desktop dock stacks up to four floating pieces in a corner; on a 390px screen those pieces
 * are nearly full width and land on the trip sheet. So a phone gets two states only:
 *
 *   - FOLDED: one 44px chip. It merges the folded pill and the WebMCP status chip, and keeps both
 *     jobs — the unread / "including a change" count in its accessible name, inside a polite live
 *     region (folded, the rail and its own live region are unmounted).
 *   - OPEN: one bounded overlay (max 80dvh, scrolling inside, a 44px close at the top). It is not
 *     offset by the trip sheet: it is its own surface over the page, not a chip riding an edge.
 *
 * Rendered only when the browser HAS WebMCP (WebMcpDock returns nothing on a phone without it:
 * every ordinary phone browser lacks it, and a "No agent" pill over the map told visitors
 * nothing they could act on).
 *
 * Owns no state. Folding, the tool list, clears and the unread watermark all belong to WebMcpDock,
 * so switching layouts across md keeps every one of them.
 */
export default function PhoneDock({
  collapsed, chipBottom, overCanvas, toolCount, unread, hasChange,
  onExpand, onCollapse, toolsOpen, onToolsOpenChange, cleared, onClear,
}: {
  collapsed: boolean
  /** Where the dock's bottom edge sits (px above the viewport bottom), or null for its corner:
   *  folded over the trip sheet, the chip rides the sheet's top edge; on a shell route with the
   *  bottom tab bar, the chip AND the open overlay sit above the bar (plan amendment 6). */
  chipBottom: number | null
  overCanvas: boolean
  toolCount: number
  unread: number
  hasChange: boolean
  onExpand: () => void
  onCollapse: () => void
  toolsOpen: boolean
  onToolsOpenChange: (open: boolean) => void
  cleared: ClearedMark
  onClear: (mark: ClearedMark) => void
}) {
  return (
    <div
      className={[
        'pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-end gap-2 p-4',
        // Folded over a map with no sheet under it (state screens, the trails canvas), the corner
        // is Mapbox's: its attribution button sits there, and the chip covered it. Lift clear.
        collapsed && overCanvas && chipBottom === null
          ? 'pb-[calc(max(1rem,env(safe-area-inset-bottom))+44px)]'
          : 'pb-[max(1rem,env(safe-area-inset-bottom))]',
      ].join(' ')}
      style={{
        maxHeight: chipBottom === null ? '100dvh' : `calc(100dvh - ${chipBottom - 16}px)`,
        bottom: chipBottom === null ? undefined : `${chipBottom - 16}px`,
      }}
    >
      {collapsed ? (
        <div aria-live="polite" aria-label="Agent activity" className="pointer-events-none">
          <PhoneChip toolCount={toolCount} unread={unread} hasChange={hasChange} onExpand={onExpand} />
        </div>
      ) : (
        <section
          role="region"
          aria-label="Agent"
          className="pointer-events-auto m-card flex max-h-[80dvh] w-full flex-col overflow-hidden text-[var(--m-text)]"
          style={{
            boxShadow: 'var(--m-shadow-2)',
            // Anchored above the tab bar, the overlay gets the room left above it (less the notch).
            ...(chipBottom === null ? {} : { maxHeight: `calc(100dvh - ${chipBottom + 16}px - env(safe-area-inset-top))` }),
          }}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--m-accent-wash)] py-2 pl-5 pr-2">
            <p className="text-[length:var(--t-body-lg)] font-semibold tracking-[-0.01em] text-[var(--m-text)]">Agent</p>
            <button
              type="button"
              onClick={onCollapse}
              aria-expanded
              aria-label="Minimise agent activity"
              className="m-btn-icon h-11 w-11"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-5 w-5">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>
          {/* Hidden when nothing is in it (a document route with no activity and the tool list
              shut): an empty padded box showed as two bare hairline rows (integration QA). */}
          <div data-dock-scroll className="phone-dock peer flex min-h-0 flex-1 flex-col items-end gap-2 overflow-y-auto overscroll-contain p-3 empty:hidden">
            {overCanvas && !toolsOpen && <ExamplePrompts />}
            <AgentActivityRail compact={!overCanvas} cleared={cleared} onClear={onClear} />
            <WebMcpStatus open={toolsOpen} onOpenChange={onToolsOpenChange} part="panel" />
          </div>
          {/* The tools chip is a footer, outside the scroll: at the end of the scroll area a long
              prompts panel or tool list pushed it against the overlay's bottom edge and clipped it. */}
          <div data-dock-footer className="flex shrink-0 justify-end border-t border-[var(--m-accent-wash)] px-3 py-2.5 peer-empty:border-t-0">
            <WebMcpStatus open={toolsOpen} onOpenChange={onToolsOpenChange} part="chip" />
          </div>
        </section>
      )}
    </div>
  )
}

function triggerLabel(toolCount: number, unread: number, hasChange: boolean): string {
  const news = unread === 0 ? '' : `, ${unread} new${hasChange ? ', including a change' : ''}`
  return `${toolCount} tool${toolCount === 1 ? '' : 's'}${news}`
}

/**
 * The agent trigger as a map control: a 44px kit circle in the trip view's right-hand stack
 * (portalled there by WebMcpDock through the agent trigger slot). It stays in the stack while the
 * overlay is open — pressing it again folds the overlay — so the control never jumps.
 *
 * The dot is the unread signal: brass for a change, ink for reads. The count and the
 * read/change distinction are in the accessible name, never only in the dot's colour.
 */
export function StackTrigger({ expanded, toolCount, unread, hasChange, onToggle, buttonRef }: {
  expanded: boolean
  toolCount: number
  unread: number
  hasChange: boolean
  onToggle: () => void
  buttonRef: React.Ref<HTMLButtonElement>
}) {
  const label = `${expanded ? 'Hide' : 'Show'} agent activity, ${triggerLabel(toolCount, unread, hasChange)}`
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={label}
      className="m-btn-icon pointer-events-auto relative h-11 w-11"
    >
      {/* A sparkle: the assistant, as distinct from every map control in the same stack. */}
      <svg data-icon="sparkle" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M10 3.5 11.6 8.4 16.5 10l-4.9 1.6L10 16.5l-1.6-4.9L3.5 10l4.9-1.6Z" />
        <path d="M18 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z" />
      </svg>
      {unread > 0 && !expanded ? (
        <span
          data-unread-dot
          aria-hidden
          className={[
            'absolute right-0.5 top-0.5 h-3 w-3 rounded-full border-2 border-[var(--m-card)]',
            hasChange ? 'bg-[var(--m-accent)]' : 'bg-[var(--m-ink)]',
          ].join(' ')}
        />
      ) : null}
    </button>
  )
}

function PhoneChip({ toolCount, unread, hasChange, onExpand }: {
  toolCount: number
  unread: number
  hasChange: boolean
  onExpand: () => void
}) {
  const label = `Show agent activity, ${triggerLabel(toolCount, unread, hasChange)}`
  return (
    <button
      type="button"
      onClick={onExpand}
      aria-expanded={false}
      aria-label={label}
      // The light kit pill (m-pill-badge), like the rest of the phone chrome; phone-only by
      // construction (only PhoneDock renders it).
      className="m-pill-badge pointer-events-auto h-11 text-[length:var(--t-body)] font-semibold tracking-[-0.01em]"
    >
      <span
        aria-hidden
        className={[
          'inline-block h-2 w-2 shrink-0 rounded-full',
          hasChange ? 'bg-[var(--m-accent)]' : unread > 0 ? 'bg-[var(--m-ink)]' : 'bg-[var(--m-text-muted)]',
        ].join(' ')}
      />
      Agent
      <span className="tabular-nums font-medium text-[var(--m-text-muted)]">{unread > 0 ? `${unread} new` : toolCount}</span>
    </button>
  )
}
