'use client'

import { useFeedbackComposer, type FeedbackComposer, type Signal, type Status } from './use-feedback-composer'
import { getAccessToken } from '@/lib/supabase/session'
import { ApiError, submitTripFeedback, type TripFeedbackDraft } from '@/lib/trip/api'
import type { TripFeedback } from '@/lib/trip/backend-types'

/* TripFeedbackPanel — one-shot trip-level feedback composer (plan T2). A mutually-exclusive
   signal (thumbs verdict OR a 1–5 star rating) plus an optional note become ONE POST via
   submitTripFeedback. The backend was designed for "rating a trip is ONE request" (3/min burst
   budget, latest-per-user analytics), so a signal and its note travel in the SAME row — three
   independently-firing controls would burn the budget and confirm contradictory signals.

   Confirmation is built from the persisted 201 row (never the request), so what the user sees
   is what was stored. A ref single-flight guard (not just the disabled attribute) stops a
   same-frame double submit, and a fingerprint of the last successful draft keeps an unchanged
   re-press from inserting a duplicate permanent row (there is no delete endpoint). */

// Mutually-exclusive selection: a thumb verdict, a star rating, or nothing.

// Pure, exported, unit-tested directly: the trim/null guard must have its own test separate from
// the Send predicate, or removing either leaves the other green (BUILD-LOOP §7). Returns null when
// there is nothing to send — a bare/whitespace note with no signal. The rating stays typed
// 1|2|3|4|5 (no number widening), which keeps every result assignable to TripFeedbackDraft.
export function buildDraft(signal: Signal | null, note: string): TripFeedbackDraft | null {
  const comment = note.trim()
  if (signal === 'thumbs_up' || signal === 'thumbs_down') {
    return comment ? { feedback_type: signal, comment } : { feedback_type: signal }
  }
  if (signal !== null) {
    return comment
      ? { feedback_type: 'rating', rating: signal.rating, comment }
      : { feedback_type: 'rating', rating: signal.rating }
  }
  return comment ? { feedback_type: 'free_text', comment } : null
}

// Semantic confirmation from the PERSISTED row, not the request (Codex r1 #3). Tests assert this
// text, never class names. " with note" is appended only when the stored row carries a comment.
function confirmedFromRow(row: TripFeedback): string {
  const withNote = row.comment ? ' with note' : ''
  if (row.feedback_type === 'thumbs_up') return `Saved: thumbs up${withNote}`
  if (row.feedback_type === 'thumbs_down') return `Saved: thumbs down${withNote}`
  if (row.feedback_type === 'rating') return `Saved: ${row.rating} of 5${withNote}`
  return 'Saved: note'
}

// One thumb path; the down variant is the same glyph rotated 180° (plan chrome note).
function ThumbIcon({ down }: { down?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={down ? 'rotate-180' : ''}
    >
      <path d="M7 10v10H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h3zm0 0 4.5-7a2 2 0 0 1 2 2.4L12.8 9h5.4a2 2 0 0 1 2 2.4l-1.2 6A2 2 0 0 1 17 19H7" />
    </svg>
  )
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3.5l2.6 5.27 5.82.85-4.21 4.1.99 5.79L12 16.77l-5.2 2.74.99-5.79-4.21-4.1 5.82-.85z" />
    </svg>
  )
}

/* The kit's controls (About this trip; the failed-trip screen) at every width since plan A8, which
   retired the desktop rail's pills. The pressed state stays on aria-pressed, which the kit's
   .m-btn-icon draws as an ink fill. 16px note text so iOS Safari does not zoom the page on focus. */
const KIT = {
  row: 'flex flex-wrap items-center gap-2',
  thumb: 'm-btn-icon disabled:cursor-not-allowed disabled:opacity-40',
  star: (filled: boolean) => [
    'grid h-11 w-11 place-items-center rounded-full transition-transform active:scale-90 motion-reduce:active:scale-100',
    'focus-visible:outline-none focus-visible:shadow-[var(--m-focus)] disabled:cursor-not-allowed disabled:opacity-40',
    filled ? 'text-[var(--m-accent)]' : 'text-[var(--m-text-muted)]',
  ].join(' '),
  note: 'w-full rounded-2xl border-0 bg-[var(--m-card)] px-4 py-3 text-[16px] leading-snug text-[var(--m-text)] shadow-[var(--m-shadow-1)] placeholder:text-[var(--m-text-muted)] focus-visible:outline-none focus-visible:shadow-[var(--m-focus)] disabled:opacity-40',
  send: 'm-btn-primary disabled:cursor-not-allowed disabled:opacity-40',
  confirmed: 'type-body text-[14px] text-[var(--m-text-muted)]',
}

/**
 * @param composer  State owned by a parent that outlives this panel (TripWorkspace, across the
 *                  phone/desktop switch). Omitted, the panel holds its own, as it always did.
 */
export default function TripFeedbackPanel({ tripId, composer }: {
  tripId: string
  composer?: FeedbackComposer
}) {
  const own = useFeedbackComposer(tripId)
  const c = composer ?? own
  const { signal, note, confirmed, lastSent, pending, status, inFlight } = c
  const setSignal = (v: Signal | null | ((p: Signal | null) => Signal | null)) =>
    c.update((prev) => ({ signal: typeof v === 'function' ? v(prev.signal) : v }))
  const setNote = (v: string) => c.update({ note: v })
  const setConfirmed = (v: string | null) => c.update({ confirmed: v })
  const setLastSent = (v: string | null) => c.update({ lastSent: v })
  const setPending = (v: boolean) => c.update({ pending: v })
  const setStatus = (v: Status) => c.update({ status: v })

  const ratingValue = typeof signal === 'object' && signal !== null ? signal.rating : null
  const draft = buildDraft(signal, note)
  const canSend = !pending && draft !== null && JSON.stringify(draft) !== lastSent

  function toggleThumb(kind: 'thumbs_up' | 'thumbs_down') {
    setSignal((prev) => (prev === kind ? null : kind))
  }

  async function send() {
    if (inFlight.current) return
    const submitted = buildDraft(signal, note)
    if (!submitted) return
    inFlight.current = true
    setPending(true)
    setStatus({ kind: 'sending', message: 'Sending…' }) // clears a stale "Noted — thanks." honestly
    let token: string
    try {
      token = await getAccessToken()
    } catch {
      // getAccessToken throws only when there is no session (session.ts).
      setStatus({ kind: 'error', message: 'Your session expired — sign in again.' })
      inFlight.current = false
      setPending(false)
      return
    }
    try {
      const { feedback } = await submitTripFeedback(tripId, submitted, token)
      // Trust the persisted row, not the request we sent (the 201 echoes what was stored).
      setConfirmed(confirmedFromRow(feedback))
      // Fingerprint the POST-CLEAR draft, not the submitted one: clearing the note below drops the
      // draft to a bare signal, and fingerprinting the *submitted* (noted) draft would leave that
      // bare draft looking "changed" — re-arming Send for a permanent bare duplicate (append-only,
      // no delete endpoint). buildDraft(signal, '') is that next bare draft; for a free_text send it
      // is null → `?? draft` keeps the submitted-draft fingerprint (Send is already off via draft===null).
      setLastSent(JSON.stringify(buildDraft(signal, '') ?? draft))
      setNote('')
      setStatus({ kind: 'ok', message: 'Noted — thanks.' })
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 429
          ? 'Feedback is limited to a few sends a minute — give it a moment.'
          : err instanceof ApiError && err.status === 401
            ? 'Your session expired — sign in again.'
            : 'Couldn\'t send that. Try again.'
      // note + signal selection both survive errors.
      setStatus({ kind: 'error', message })
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  return (
    <div aria-busy={pending} className="trip-feedback flex flex-col gap-3">
      <div className={KIT.row}>
        <button
          type="button"
          aria-label="Thumbs up"
          aria-pressed={signal === 'thumbs_up'}
          disabled={pending}
          onClick={() => toggleThumb('thumbs_up')}
          className={KIT.thumb}
        >
          <ThumbIcon />
        </button>
        <button
          type="button"
          aria-label="Thumbs down"
          aria-pressed={signal === 'thumbs_down'}
          disabled={pending}
          onClick={() => toggleThumb('thumbs_down')}
          className={KIT.thumb}
        >
          <ThumbIcon down />
        </button>

        <div role="radiogroup" aria-label="Rate this trail" className="ml-1 flex items-center gap-0.5">
          {([1, 2, 3, 4, 5] as const).map((n) => {
            const filled = ratingValue !== null && n <= ratingValue
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={ratingValue === n}
                aria-label={`${n} star${n === 1 ? '' : 's'}`}
                disabled={pending}
                onClick={() => setSignal({ rating: n })}
                className={KIT.star(filled)}
              >
                <StarIcon filled={filled} />
              </button>
            )
          })}
        </div>
      </div>

      <textarea
        aria-label="Feedback note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={2000}
        disabled={pending}
        rows={3}
        placeholder="Wrong place, bad route, missing gem — tell us."
        className={KIT.note}
      />

      <div className="flex items-center gap-3">
        <button type="button" onClick={() => void send()} disabled={!canSend} className={KIT.send}>
          {pending ? 'Sending…' : 'Send feedback'}
        </button>
        <p role="status" className="type-label text-[12px] text-[var(--m-text-muted)]">
          {status.kind === 'idle' ? '' : status.message}
        </p>
      </div>

      {confirmed && (
        <p className={KIT.confirmed}>{confirmed}</p>
      )}
    </div>
  )
}
