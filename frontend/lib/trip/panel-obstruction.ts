'use client'

import { useSyncExternalStore } from 'react'

/**
 * How many pixels at the LEFT of the viewport the desktop trip panel covers (plan amendment 8).
 *
 * The desktop counterpart of sheet-obstruction, and deliberately a separate store: the phone
 * sheet covers the bottom, the floating panel covers the left, and the camera, the dock and the
 * controls each care about exactly one of them. The panel measures its own right edge once it has
 * settled and writes it here; 0 means nothing covers the map's left side (the panel is collapsed,
 * or this is not a desktop trip page). The panel resets it to 0 on unmount, so the value never
 * outlives the route that set it.
 */

let value = 0
const listeners = new Set<() => void>()

export function getPanelObstruction(): number {
  return value
}

export function setPanelObstruction(px: number): void {
  const next = Number.isFinite(px) && px > 0 ? Math.round(px) : 0
  if (next === value) return
  value = next
  listeners.forEach((l) => l())
}

export function subscribePanelObstruction(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function usePanelObstruction(): number {
  return useSyncExternalStore(subscribePanelObstruction, getPanelObstruction, () => 0)
}

/**
 * The covered strip for a panel whose right edge is at `right` (viewport px). Collapsed is 0 by
 * definition — while it slides away its box still reports a position, and padding the camera for
 * a panel the user just put away would keep the pins squeezed to the right of an empty map.
 */
export function measurePanelObstruction({ right, viewportWidth, collapsed }: {
  right: number
  viewportWidth: number
  collapsed: boolean
}): number {
  if (collapsed) return 0
  return Math.min(viewportWidth, Math.max(0, right))
}
