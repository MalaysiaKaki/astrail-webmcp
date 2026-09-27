'use client'

import { useSyncExternalStore } from 'react'

/**
 * How many pixels at the bottom of the viewport the mobile trip sheet covers.
 *
 * One number, shared by the three things that have to agree about it: the sheet (which measures
 * itself and writes it), the map camera (which pads the framed pins above it) and the agent dock
 * (whose folded chip sits on the sheet's top edge). Before this the camera assumed a fixed 42%
 * sheet and ignored the sheet's real height and its hidden state entirely.
 *
 * 0 means "nothing covers the map": the sheet is hidden, or there is no sheet at all (desktop,
 * /app/trips, loading and failed screens). The sheet resets it to 0 when it unmounts, so the value
 * never outlives the route that set it.
 *
 * A module-level store rather than context because its readers live in different subtrees — the
 * dock is mounted by the /app shell, the sheet by the trip page — and neither owns the other.
 */

let value = 0
const listeners = new Set<() => void>()

/** What the server renders with: no sheet has measured anything yet. */
export const SHEET_OBSTRUCTION_SERVER_SNAPSHOT = 0

export function getSheetObstruction(): number {
  return value
}

export function setSheetObstruction(px: number): void {
  const next = Number.isFinite(px) && px > 0 ? Math.round(px) : 0
  if (next === value) return
  value = next
  listeners.forEach((l) => l())
}

export function subscribeSheetObstruction(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function useSheetObstruction(): number {
  return useSyncExternalStore(
    subscribeSheetObstruction,
    getSheetObstruction,
    () => SHEET_OBSTRUCTION_SERVER_SNAPSHOT,
  )
}

/**
 * The covered strip for a sheet whose top edge is at `top`. Hidden is 0 by definition — while it
 * slides away its box still reports a position, and padding the camera for a sheet the user just
 * dismissed would keep the pins squeezed into the top of an empty screen.
 */
export function measureObstruction({ top, viewportHeight, hidden }: {
  top: number
  viewportHeight: number
  hidden: boolean
}): number {
  if (hidden) return 0
  return Math.min(viewportHeight, Math.max(0, viewportHeight - top))
}

/** Gap between the sheet's top edge and the agent chip that rides it. */
export const DOCK_CHIP_GAP = 12
/** The chip's hit area. */
export const DOCK_CHIP_HEIGHT = 44
/** Kept free at the top of the screen for the trip top bar (back, title, layer toggle). */
export const TOP_BAR_RESERVE = 80

/**
 * Where the folded agent chip's bottom edge sits, in px above the viewport bottom — or null when
 * nothing covers the map, which leaves the dock in its usual safe-area corner.
 *
 * On the sheet's top edge while the sheet is compact. Expanded on a short phone that edge is up
 * among the top bar's controls, so the chip stops below the bar's reserve and overlaps the sheet's
 * grab row instead (whose hide control is on the other side for exactly this reason).
 */
export function dockChipBottom(obstruction: number, viewportHeight: number): number | null {
  if (obstruction <= 0) return null
  const ceiling = viewportHeight - TOP_BAR_RESERVE - DOCK_CHIP_HEIGHT
  return Math.max(0, Math.min(obstruction + DOCK_CHIP_GAP, ceiling))
}
