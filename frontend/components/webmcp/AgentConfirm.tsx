'use client'

import { useEffect, useRef, useState } from 'react'
import type { PendingPrompt } from './WebMcpRegistry'
import { useOptionalWebMcpRegistry } from './WebMcpRegistry'
import { useBottomNavHeight } from '@/lib/shell/bottom-nav'
import { approvalBottomOverNav } from '@/lib/webmcp/dock-geometry'

/**
 * How much the field will hold, matching the ceiling a stated preference already has.
 *
 * A courtesy, not the enforcement: `plan_trip_from_reels` trims and caps whatever this answers
 * with before it goes anywhere, because a card is not the only thing that can call it. Stopping
 * the typing is only so the limit is met while the user can still see what they wrote.
 */
const MAX_OVERRIDE = 280

/* Shared by both cards. Bounded to the space left above the dock and below the notch, as a
   column: the request scrolls INSIDE the card (`data-confirm-body`), the actions stay outside
   that scroll, so a long summary on a 360x640 phone with the keyboard up can never push Approve
   or Not now off screen.

   One surface at every width since plan A7: the light UI kit card (the night skin is retired). */
const CARD =
  'fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 mx-auto flex w-[min(28rem,calc(100%-2rem))] ' +
  'max-h-[calc(100dvh-6rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] flex-col ' +
  'm-card p-4 text-[length:var(--t-body)] text-[var(--m-text)] outline-none'
/** `m-card`'s own shadow is the lighter `--m-shadow-1`; this floating approval card wants the
 *  heavier `--m-shadow-2` the kit reserves for overlay panels, so it is set inline — an inline
 *  style always wins the cascade, unlike a plain Tailwind utility against the kit's unlayered CSS. */
const CARD_STYLE = { boxShadow: 'var(--m-shadow-2)' } as const
const BODY = 'min-h-0 overflow-y-auto overscroll-contain'
const APPROVE = 'm-btn-primary flex-1'
const DECLINE = 'm-btn-secondary flex-1'
const STACKED_APPROVE = 'm-btn-primary w-full whitespace-nowrap'
const STACKED_DECLINE = 'm-btn-secondary w-full whitespace-nowrap'
const HEADER = 'mb-2 flex items-center gap-2 text-[length:var(--t-meta)] font-semibold text-[var(--m-accent)]'
const DOT = 'inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--m-accent)]'
const SUMMARY = 'whitespace-pre-line leading-relaxed text-[var(--m-text)]'
const FIELD_LABEL = 'mb-1 block text-[length:var(--t-label)] text-[var(--m-text-muted)]'
const FIELD_INPUT =
  'w-full rounded-lg border border-[var(--m-accent-wash)] bg-[var(--m-page)] px-3 py-2 text-[var(--m-text)] max-md:text-base ' +
  'outline-none transition placeholder:text-[var(--m-text-muted)] focus:border-[var(--m-accent)]'

/**
 * The card's inline style: the overlay shadow, and — on a shell route with the phone bottom tab
 * bar — a bottom edge above both the bar and the folded agent chip riding it (plan amendment 6),
 * with the height budget shrunk to match. With no bar the class's own `bottom` stands.
 */
function useCardStyle(): React.CSSProperties {
  const bottom = approvalBottomOverNav(useBottomNavHeight())
  if (bottom === null) return CARD_STYLE
  return {
    ...CARD_STYLE,
    bottom: `${bottom}px`,
    maxHeight: `calc(100dvh - ${bottom + 16}px - env(safe-area-inset-top))`,
  }
}

/**
 * Focus lands on the card when it opens, so a keyboard or screen-reader user meets the request
 * rather than whatever they were on, and returns to that control when the card closes; Escape
 * DECLINES. Dismissal is never approval — the only way
 * to authorize is the approve button itself.
 */
function useCardBehaviour(decline: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  const declineRef = useRef(decline)
  declineRef.current = decline
  useEffect(() => {
    // Remember where focus was so closing the card (Escape, Approve or Not now all unmount it)
    // hands it back, instead of stranding keyboard users on <body>.
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') declineRef.current() }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (previous && previous !== document.body && previous.isConnected) previous.focus()
    }
  }, [])
  return ref
}

/**
 * The approval card an agent cannot skip.
 *
 * `plan_trip_from_reels` spends the user's ONE lifetime free trip plus real Apify and OpenAI
 * credit. Reversible actions get an undo; irreversible or costly ones get this. The summary is
 * rendered as TEXT, verbatim, so a prompt-injected Reel caption cannot dress itself up as
 * interface chrome or hide what is about to happen.
 */
export default function AgentConfirm() {
  const registry = useOptionalWebMcpRegistry()
  const pending = registry?.pending
  if (!pending) return null
  // Its own component, because the field is state and a hook cannot live past the return above.
  if (pending.kind === 'prompt') return <PreferenceCard pending={pending} />
  return <ConfirmCard summary={pending.summary} resolve={pending.resolve} />
}

function ConfirmCard({ summary, resolve }: { summary: string; resolve: (ok: boolean) => void }) {
  const ref = useCardBehaviour(() => resolve(false))
  const cardStyle = useCardStyle()
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Astrail wants your approval"
      ref={ref}
      tabIndex={-1}
      className={CARD}
      style={cardStyle}
    >
      <div data-confirm-body className={BODY}>
      <p className={HEADER}>
        <span aria-hidden className={DOT} />
        Astrail wants to
      </p>
      {/* Deliberately plain text, never innerHTML — this string can carry caption-derived content. */}
      <p className={SUMMARY}>{summary}</p>
      </div>
      <div className="mt-4 flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => resolve(true)}
          className={APPROVE}
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => resolve(false)}
          className={DECLINE}
        >
          Not now
        </button>
      </div>
    </div>
  )
}

/**
 * The same approval, for the one case where Astrail is about to lean on what it remembers.
 *
 * A remembered preference is a DEFAULT, not a mandate — preferences change per trip. Naming what
 * Astrail holds and offering only Approve left the user two answers to a three-answer question:
 * accept it, or abandon the trip. The field is the third.
 *
 * It starts EMPTY, and blank means "use what you remember". The remembered text is mem0 prose
 * that reached the store through the agent's own `preferences` argument; seeding it into the
 * input would let it be submitted back as the user's own stated words without anyone typing them
 * — and the backend treats a stated preference as explicit and remembers it.
 *
 * The chrome below is a deliberate copy of the card above rather than a shared wrapper. That card
 * is the gate six tools depend on, and the point of this change was that it does not move.
 */
function PreferenceCard({ pending }: { pending: PendingPrompt }) {
  const { summary, prompt, resolve } = pending
  const [text, setText] = useState('')
  /* The value the answer actually carries, so the button can name what pressing it does. A
     button reading "try what it remembers" above a FILLED field describes the opposite.

     "Try", not "Use", on the blank branch — and that word is load-bearing rather than timid.
     The card names memories read with `get_all`; the pipeline then runs its own semantic search
     which can miss, time out, or fail and fall back to inferred defaults in silence
     (backend/pipeline/preferences.py:105-125). A button promising "use" is a promise the run
     gets to break after the user has already spent on it. The typed branch CAN say "use",
     because an explicit preference wins outright and nothing downstream vetoes it. */
  const override = text.trim().slice(0, MAX_OVERRIDE) || null
  const ref = useCardBehaviour(() => resolve({ approved: false, text: null }))
  const cardStyle = useCardStyle()

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Astrail wants your approval"
      ref={ref}
      tabIndex={-1}
      className={CARD}
      style={cardStyle}
    >
      <div data-confirm-body className={BODY}>
      <p className={HEADER}>
        <span aria-hidden className={DOT} />
        Astrail wants to
      </p>
      {/* Deliberately plain text, never innerHTML — this string can carry caption-derived content. */}
      <p className={SUMMARY}>{summary}</p>
      <label className="mt-3 block">
        <span className={FIELD_LABEL}>{prompt.label}</span>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={prompt.placeholder}
          maxLength={MAX_OVERRIDE}
          className={FIELD_INPUT}
        />
      </label>
      </div>
      {/* Stacked full width, primary first: side by side at 390 the primary label wrapped to two
          lines ("Try what it / remembers"). The plain confirm card's short pair stays in a row. */}
      <div className="mt-4 flex shrink-0 flex-col gap-2">
        <button
          type="button"
          onClick={() => resolve({ approved: true, text: override })}
          className={STACKED_APPROVE}
        >
          {override ? 'Use this instead' : 'Try what it remembers'}
        </button>
        <button
          type="button"
          /* `text: null`, whatever is in the field. Declining is a refusal to start, not a
             preference stated on the way out — and a declined run must carry nothing forward. */
          onClick={() => resolve({ approved: false, text: null })}
          className={STACKED_DECLINE}
        >
          Not now
        </button>
      </div>
    </div>
  )
}
