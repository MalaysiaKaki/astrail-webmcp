'use client'

import { useCallback, useRef, useState, type MutableRefObject } from 'react'

/* Its own module, not TripFeedbackPanel's: TripWorkspace owns a composer, and several suites mock
   the panel module wholesale — a hook exported from it would vanish under those mocks. */

export type Signal = 'thumbs_up' | 'thumbs_down' | { rating: 1 | 2 | 3 | 4 | 5 }

export type Status =
  | { kind: 'idle' }
  | { kind: 'sending'; message: string }
  | { kind: 'ok'; message: string }
  | { kind: 'error'; message: string }

type ComposerFields = {
  signal: Signal | null
  note: string
  confirmed: string | null
  // Fingerprint of the last SUCCESSFULLY submitted draft; a matching current draft keeps Send off
  // so an unchanged re-press can't insert an identical permanent row (Codex r2 #1).
  lastSent: string | null
  pending: boolean
  status: Status
}

const EMPTY: ComposerFields = {
  signal: null, note: '', confirmed: null, lastSent: null, pending: false, status: { kind: 'idle' },
}

export type FeedbackComposer = ComposerFields & {
  update: (patch: Partial<ComposerFields> | ((prev: ComposerFields) => Partial<ComposerFields>)) => void
  // Synchronous single-flight guard: the `pending` state only styles/disables the UI, and the
  // disabled attribute has not re-rendered within a same-frame double click (Codex r1 ref lock).
  inFlight: MutableRefObject<boolean>
}

/**
 * The composer's state, liftable out of the panel.
 *
 * TripWorkspace renders the panel in one of two trees (the phone sheet's "About this trip", or
 * the desktop rail), and rotating across 768px swaps them — unmounting one composer and mounting
 * the other. Held by the workspace, the note, rating, confirmation, duplicate-send fingerprint and
 * an in-flight send all survive that switch; a send that resolves after the swap still lands in
 * whichever composer is on screen. Keyed by trip, so another trip always starts empty.
 */
export function useFeedbackComposer(tripId: string): FeedbackComposer {
  const [held, setHeld] = useState<{ tripId: string; fields: ComposerFields }>({ tripId, fields: EMPTY })
  const inFlight = useRef(false)
  const fields = held.tripId === tripId ? held.fields : EMPTY
  const update = useCallback<FeedbackComposer['update']>((patch) => {
    setHeld((prev) => {
      const base = prev.tripId === tripId ? prev.fields : EMPTY
      const next = typeof patch === 'function' ? patch(base) : patch
      return { tripId, fields: { ...base, ...next } }
    })
  }, [tripId])
  return { ...fields, update, inFlight }
}
