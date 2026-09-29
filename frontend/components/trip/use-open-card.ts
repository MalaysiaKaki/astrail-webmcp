'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CardOpener, OpenCard, OpenCardKind } from '@/lib/trip/place-card'
import type { PanelRequest } from './mobile/MobileTripView'

/**
 * The desktop place card's state (A10; Codex map-card review §3), held by TripWorkspace above both
 * layouts: the ONE open card (kind, id, request nonce, opener), separate from selection; whether
 * this request's detail fell back to the sidebar; the user's "Details in the sidebar" choice;
 * the map card's requests into the Trip tab; and where focus goes when the card closes.
 *
 * Focus returns to a LOGICAL opener, looked up by id after the commit: the pin (markers are
 * replaced on every redraw, so the element that was clicked may be gone), else the place's row in
 * the sidebar, else the selected tab. A close by a click on the map moves no focus.
 */
export function useOpenCard() {
  const [openCard, setOpenCard] = useState<OpenCard | null>(null)
  const [fallbackNonce, setFallbackNonce] = useState<number | null>(null)
  const [detailsHere, setDetailsHere] = useState(false)
  const [panelRequest, setPanelRequest] = useState<PanelRequest | null>(null)
  const [focusRequest, setFocusRequest] = useState<{ selectors: string[]; nonce: number } | null>(null)
  const nonceRef = useRef(0)
  const currentRef = useRef(openCard)
  currentRef.current = openCard

  const next = () => { nonceRef.current += 1; return nonceRef.current }

  const open = useCallback((kind: OpenCardKind, id: string, opener: CardOpener) => {
    setFallbackNonce(null)
    setOpenCard({ kind, id, nonce: next(), opener })
  }, [])

  const focusAfterCommit = useCallback((selectors: string[]) => {
    setFocusRequest({ selectors, nonce: next() })
  }, [])

  /** `reason` set (Escape, the close button): focus goes back to the logical opener. */
  const close = useCallback((reason?: 'escape' | 'button') => {
    const card = currentRef.current
    setOpenCard(null)
    if (!card || !reason) return
    focusAfterCommit(openerSelectors(card))
  }, [focusAfterCommit])

  /** Closes the open card only if it is still `which` (A12): a phone DOM card closed after a stop
   *  was chosen must not close the stop's card. No `which`: the card open now. */
  const closeIf = useCallback((which?: { kind: OpenCardKind; id: string }) => {
    const card = currentRef.current
    if (which && (!card || card.kind !== which.kind || card.id !== which.id)) return
    setOpenCard(null)
  }, [])

  const requestPanel = useCallback((target: PanelRequest['target'], day: number) => {
    setPanelRequest({ target, day, nonce: next() })
  }, [])

  useEffect(() => {
    if (!focusRequest) return
    const frame = requestAnimationFrame(() => {
      for (const sel of focusRequest.selectors) {
        const el = document.querySelector<HTMLElement>(sel)
        if (el) { el.focus({ preventScroll: false }); return }
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [focusRequest])

  return {
    openCard, open, close, closeIf,
    fallbackNonce, fallBack: setFallbackNonce,
    detailsHere, setDetailsHere,
    panelRequest, requestPanel,
    focusAfterCommit,
  }
}

const esc = (s: string) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s)

/** Where focus goes when `card` closes: its pin, its sidebar row, then the selected tab. */
export function openerSelectors(card: OpenCard): string[] {
  const id = esc(card.id)
  const tab = '[role="tab"][aria-selected="true"]'
  if (card.kind === 'stop') {
    const row = `[data-trip-scroll] [data-place-id="${id}"]`
    const pin = `[data-pin-place-id="${id}"]`
    return card.opener === 'pin' ? [pin, row, tab] : [row, pin, tab]
  }
  if (card.kind === 'eat') return [`[data-trip-scroll] [data-eat-place-id="${id}"]`, tab]
  return [`[data-trip-scroll] [data-hotel-id="${id}"]`, tab]
}
