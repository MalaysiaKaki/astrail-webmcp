'use client'

import { useEffect } from 'react'

/**
 * Brings a revealed place's card into view once it has mounted (lib/trip/reveal, amendment 5).
 *
 * A reveal can switch the tab, the day and the list in one render, so the card may not exist when
 * the request is made; this runs in the commit that mounted it, then waits one frame for layout.
 * The card is a listed stop (its <li>) or the undayed "Selected place" card (its <section>), both
 * found by `data-place-id` inside the panel's scroller. Keyed on the nonce, so revealing the same
 * place twice scrolls twice.
 */
export function useRevealScroll(request: { placeId: string; nonce: number } | null): void {
  useEffect(() => {
    if (!request) return
    const frame = requestAnimationFrame(() => {
      const scroller = document.querySelector<HTMLElement>('[data-trip-scroll]')
      const card = scroller?.querySelector(`[data-place-id="${CSS.escape(request.placeId)}"]`)
      const target = card?.closest('li, section') ?? card
      const reduce = typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches
      target?.scrollIntoView?.({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
    })
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.nonce])
}
