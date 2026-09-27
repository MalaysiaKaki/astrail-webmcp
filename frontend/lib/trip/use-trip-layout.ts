'use client'

import { useSyncExternalStore } from 'react'

/**
 * Which trip layout this viewport gets: the phone view (map + stop sheet) or the desktop rail.
 *
 * The split is Tailwind's `md` (768px), the same line the rest of the trip page already draws, so
 * 844x390 landscape (>= 768 wide) gets the desktop layout by design.
 *
 * `null` means "not known yet" and is what the server and the hydration pass render with. The
 * workspace turns that into a CSS-gated shell (the desktop tree, hidden below `md`) so desktop
 * paints its panel straight from the server HTML exactly as before, and a phone shows no desktop
 * flash: the panel is display:none there until the client snapshot picks the mobile tree. On a
 * client-side navigation there is no server pass, so the right branch renders first time.
 */
export type TripLayout = 'mobile' | 'desktop'

export const MOBILE_QUERY = '(max-width: 767.98px)'

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const mql = window.matchMedia(MOBILE_QUERY)
  mql.addEventListener?.('change', onChange)
  return () => mql.removeEventListener?.('change', onChange)
}

function getSnapshot(): TripLayout {
  // No matchMedia (old test envs, exotic embeds) falls back to desktop: the layout that has
  // always existed, rather than one nothing has ever rendered in that environment.
  if (typeof window.matchMedia !== 'function') return 'desktop'
  return window.matchMedia(MOBILE_QUERY).matches ? 'mobile' : 'desktop'
}

function getServerSnapshot(): TripLayout | null {
  return null
}

export function useTripLayout(): TripLayout | null {
  return useSyncExternalStore<TripLayout | null>(subscribe, getSnapshot, getServerSnapshot)
}
