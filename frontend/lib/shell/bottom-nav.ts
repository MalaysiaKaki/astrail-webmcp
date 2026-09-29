'use client'

import { useSyncExternalStore } from 'react'

/**
 * How many pixels at the bottom of the viewport the phone tab bar covers. FROZEN API (web revamp
 * C1, amendment 6): the agent dock (Tab A) reads it to lift its folded chip above the bar on the
 * shell routes (/app, /app/trips, /app/settings).
 *
 * The value is the whole strip from the bar's top edge down to the viewport bottom, so it already
 * includes the bar's float gap and env(safe-area-inset-bottom). A reader places its own element at
 * `bottom = getBottomNavHeight() + its own gap` and must NOT add the safe area again.
 *
 * 0 means "no bar": >=768px (the bar is display:none there), trip routes (outside the shell, so
 * the bar never mounts), before the first measure, and after the bar unmounts. The bar writes it
 * on mount and on resize, and resets it to 0 when it unmounts.
 *
 * Same module-store shape as lib/trip/sheet-obstruction.ts, for the same reason: the writer (the
 * shell layout) and the reader (the dock in app/app/layout.tsx) are in different subtrees.
 */

let value = 0
const listeners = new Set<() => void>()

/** What the server renders with: no bar has measured anything yet. */
export const BOTTOM_NAV_SERVER_SNAPSHOT = 0

export function getBottomNavHeight(): number {
  return value
}

export function setBottomNavHeight(px: number): void {
  const next = Number.isFinite(px) && px > 0 ? Math.round(px) : 0
  if (next === value) return
  value = next
  listeners.forEach((l) => l())
}

export function subscribeBottomNavHeight(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function useBottomNavHeight(): number {
  return useSyncExternalStore(subscribeBottomNavHeight, getBottomNavHeight, () => BOTTOM_NAV_SERVER_SNAPSHOT)
}

/**
 * The covered strip for a bar whose box is `rect`. A zero-height box is a bar that is not laid out
 * (display:none at desktop widths), which covers nothing even though its top reads 0.
 */
export function measureBottomNav(rect: { top: number; height: number }, viewportHeight: number): number {
  if (rect.height <= 0) return 0
  return Math.min(viewportHeight, Math.max(0, viewportHeight - rect.top))
}
