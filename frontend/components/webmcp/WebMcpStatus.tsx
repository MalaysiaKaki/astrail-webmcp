'use client'

import { useOptionalWebMcpRegistry } from './WebMcpRegistry'

/**
 * Makes an invisible capability visible.
 *
 * Users told us they could not tell where to click or what to do next. WebMCP does not fix that
 * by itself — an agent the user does not know exists is no more discoverable than a button they
 * cannot find. So the count is shown, and it CHANGES as tools come and go: opening a trip takes
 * it from 2 to 4, which explains page-scoped tools better than a paragraph could.
 */
export default function WebMcpStatus({
  open,
  onOpenChange,
  part = 'all',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Which piece to render. 'all' (default) is the panel above its chip, as always. The phone
   *  overlay renders 'panel' inside its scroll area and 'chip' in a fixed footer, so a long list
   *  can never push the chip against the overlay's bottom edge and clip it. */
  part?: 'all' | 'panel' | 'chip'
}) {
  // The light UI kit at every width since plan A7 (the night skin is retired), on the shared scale.
  const registry = useOptionalWebMcpRegistry()
  if (!registry) return null
  const setOpen = onOpenChange

  const { tools, supported } = registry
  const count = tools.length

  const panel = open && (
    <div className="pointer-events-auto w-full overflow-hidden m-card text-[var(--m-text)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--m-accent-wash)] px-3 py-2">
        <p className="text-[length:var(--t-body)] font-semibold text-[var(--m-text)]">
          {supported ? 'Tools an agent can use here' : 'Agent tools unavailable'}
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close tool list"
          className="m-btn-icon -mr-1 h-11 w-11"
        >
          ✕
        </button>
      </div>
      {/* Caps at 60% of the viewport and scrolls: the full list is already taller than a phone. */}
      <div className="max-h-[min(60dvh,calc(var(--dock-room,100dvh)-13rem))] overflow-y-auto overscroll-contain p-3 text-[length:var(--t-meta)]">
        {supported ? (
          <>
            <ul className="space-y-2">
              {tools.map((t) => (
                <li key={t.name} className="leading-snug m-subcard px-3 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <code className="text-[var(--m-text)]">{t.name}</code>
                    <span
                      className={[
                        'shrink-0 rounded px-1.5 py-0.5 text-[length:var(--t-label)] font-semibold',
                        t.readOnly ? 'bg-[var(--m-page)] text-[var(--m-text-muted)]' : 'bg-[var(--m-accent-wash)] text-[var(--m-accent)]',
                      ].join(' ')}
                    >
                      {t.readOnly ? 'reads' : 'changes'}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[var(--m-text-muted)]">
                    {t.description}
                  </p>
                </li>
              ))}
              {count === 0 && (
                <li className="text-[var(--m-text-muted)]">No tools registered on this page yet.</li>
              )}
            </ul>
            <p className="mt-3 border-t border-[var(--m-accent-wash)] pt-2 text-[var(--m-text-muted)]">
              Unsure where to start? Just ask the agent what you can do here.
            </p>
          </>
        ) : (
          <>
            <p className="leading-relaxed text-[var(--m-text)]">
              Astrail exposes its actions to AI agents through{' '}
              <span className="text-[var(--m-accent)]">WebMCP</span>. To use them, open this page in the{' '}
              <strong className="text-[var(--m-text)]">ChatGPT desktop app&apos;s built-in browser</strong>, or in{' '}
              <strong className="text-[var(--m-text)]">Chrome 149+</strong> with{' '}
              <code className="break-all text-[var(--m-accent)]">chrome://flags/#enable-webmcp-testing</code> enabled.
            </p>
            <p className="mt-2 text-[var(--m-text-muted)]">
              Everything on this page still works normally without it.
            </p>
          </>
        )}
      </div>
    </div>
  )
  const chip = (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      aria-label={supported ? `WebMCP active, ${count} tools` : 'WebMCP unavailable'}
      className={[
        'm-pill-badge pointer-events-auto text-[length:var(--t-meta)] font-semibold',
        supported ? 'text-[var(--m-accent)]' : 'text-[var(--m-text-muted)]',
      ].join(' ')}
    >
      <span
        aria-hidden
        className={['inline-block h-1.5 w-1.5 rounded-full', supported ? 'bg-[var(--m-accent)]' : 'bg-[var(--m-text-muted)]'].join(' ')}
      />
      {/* On a phone the trip panel is a full-width sheet, so a wide chip lands squarely on
          top of the day/leg counts. Compact to the number there and keep the words for
          screen readers; widen from sm: up where there is room beside the content. */}
      <span className="sm:hidden">{supported ? count : '—'}</span>
      <span className="hidden sm:inline">
        {supported ? `WebMCP active · ${count} tool${count === 1 ? '' : 's'}` : 'WebMCP unavailable'}
      </span>
    </button>
  )
  if (part === 'panel') return panel || null
  if (part === 'chip') return chip
  return (
    /* `pointer-events-none`, with `auto` on the two things that are actually painted.
       This box is 22rem wide and the chip inside it is not: at 1280 the chip measured 171px
       and at 390 it measured 47px, both right-aligned, which left 181px and 305px of
       transparent wrapper that still swallowed every click on the map behind it. An invisible
       catcher is worse than an opaque panel — there is nothing on screen to explain why the
       click did nothing. Same rule the dock's column already follows. */
    <div className="pointer-events-none flex w-[min(22rem,100%)] flex-col items-end gap-2">
      {panel}
      {chip}
    </div>
  )
}
