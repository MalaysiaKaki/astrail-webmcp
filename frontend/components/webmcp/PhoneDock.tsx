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
 *     region (folded, the rail and its own live region are unmounted), and a visible "No agent"
 *     state when the browser has no WebMCP, because the dock is the only place the app says an
 *     agent can be attached at all.
 *   - OPEN: one bounded overlay (max 80dvh, scrolling inside, a 44px close at the top). It is not
 *     offset by the trip sheet: it is its own surface over the page, not a chip riding an edge.
 *
 * Owns no state. Folding, the tool list, clears and the unread watermark all belong to WebMcpDock,
 * so switching layouts across md keeps every one of them.
 */
export default function PhoneDock({
  collapsed, chipBottom, overCanvas, supported, toolCount, unread, hasChange,
  onExpand, onCollapse, toolsOpen, onToolsOpenChange, cleared, onClear,
}: {
  collapsed: boolean
  /** Folded chip position over the trip sheet (px above the viewport bottom), or null. */
  chipBottom: number | null
  overCanvas: boolean
  supported: boolean
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
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-end gap-2 p-4
                 pb-[max(1rem,env(safe-area-inset-bottom))]"
      style={{ maxHeight: '100dvh', bottom: chipBottom === null ? undefined : `${chipBottom - 16}px` }}
    >
      {collapsed ? (
        <div aria-live="polite" aria-label="Agent activity" className="pointer-events-none">
          <PhoneChip supported={supported} toolCount={toolCount} unread={unread} hasChange={hasChange} onExpand={onExpand} />
        </div>
      ) : (
        <section
          role="region"
          aria-label="Agent"
          className="pointer-events-auto flex max-h-[80dvh] w-full flex-col overflow-hidden rounded-2xl
                     border border-[#C9974E]/40 bg-black/85 text-white/90 shadow-2xl backdrop-blur"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 pl-4">
            <p className="text-[12px] uppercase tracking-wider text-[#E8D5B0]">Agent</p>
            <button
              type="button"
              onClick={onCollapse}
              aria-expanded
              aria-label="Minimise agent activity"
              className="flex h-11 w-11 items-center justify-center text-white/70 transition hover:text-white"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-5 w-5">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>
          <div data-dock-scroll className="phone-dock flex min-h-0 flex-1 flex-col items-end gap-2 overflow-y-auto overscroll-contain p-3">
            {overCanvas && !toolsOpen && <ExamplePrompts />}
            <AgentActivityRail compact={!overCanvas} cleared={cleared} onClear={onClear} />
            {/* Unsupported, the explanation IS the content — open it rather than make someone
                find a second control inside the overlay they just opened. */}
            <WebMcpStatus open={toolsOpen || !supported} onOpenChange={onToolsOpenChange} />
          </div>
        </section>
      )}
    </div>
  )
}

function PhoneChip({ supported, toolCount, unread, hasChange, onExpand }: {
  supported: boolean
  toolCount: number
  unread: number
  hasChange: boolean
  onExpand: () => void
}) {
  const news = unread === 0 ? '' : `, ${unread} new${hasChange ? ', including a change' : ''}`
  const label = supported
    ? `Show agent activity, ${toolCount} tool${toolCount === 1 ? '' : 's'}${news}`
    : 'Show agent activity, agent tools unavailable'
  return (
    <button
      type="button"
      onClick={onExpand}
      aria-expanded={false}
      aria-label={label}
      className={[
        'pointer-events-auto flex h-11 items-center gap-2 rounded-full border px-4 text-[13px] backdrop-blur transition',
        supported
          ? 'border-[#C9974E]/50 bg-black/70 text-[#E8D5B0]'
          : 'border-white/25 bg-black/60 text-white/70',
      ].join(' ')}
    >
      <span
        aria-hidden
        className={[
          'inline-block h-2 w-2 shrink-0 rounded-full',
          !supported ? 'bg-white/40' : hasChange ? 'bg-[#C9974E]' : unread > 0 ? 'bg-white/70' : 'bg-[#C9974E]/60',
        ].join(' ')}
      />
      {supported ? (
        <>
          Agent
          <span className="tabular-nums text-white/70">{unread > 0 ? `${unread} new` : toolCount}</span>
        </>
      ) : (
        'No agent'
      )}
    </button>
  )
}
