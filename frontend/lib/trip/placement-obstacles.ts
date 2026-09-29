'use client'

import { useEffect, useSyncExternalStore } from 'react'
import type { ControlRect } from './control-obstruction'

/**
 * Chrome the desktop place card must not open under, in viewport pixels (A10; Codex map-card
 * review §5): the agent dock and the map's day chip.
 *
 * Deliberately NOT lib/trip/control-obstruction. That store feeds the camera's frame padding and
 * the dock's own room (dockRoomUnderControls counts every right-half rect as the control stack);
 * the bottom-anchored dock published there would collapse its own room to zero, and every dock
 * expansion would re-pad the camera. These rects are read by the card placement alone.
 *
 * Owner-keyed like the control store: each writer replaces and clears only its own entry.
 */

const byOwner = new Map<string, ControlRect[]>()
let snapshot: ControlRect[] = []
const listeners = new Set<() => void>()
const EMPTY: ControlRect[] = []

function publish() {
  snapshot = [...byOwner.values()].flat()
  listeners.forEach((l) => l())
}

function same(a: readonly ControlRect[] | undefined, b: readonly ControlRect[]): boolean {
  if (!a || a.length !== b.length) return false
  return a.every((r, i) => r.x === b[i].x && r.y === b[i].y && r.w === b[i].w && r.h === b[i].h)
}

export function setPlacementObstacles(owner: string, rects: readonly ControlRect[]): void {
  const clean = rects
    .filter((r) => [r.x, r.y, r.w, r.h].every(Number.isFinite) && r.w > 0 && r.h > 0)
    .map((r) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) }))
  if (same(byOwner.get(owner), clean)) return
  if (clean.length) byOwner.set(owner, clean)
  else if (byOwner.has(owner)) byOwner.delete(owner)
  else return
  publish()
}

export function clearPlacementObstacles(owner: string): void {
  if (!byOwner.delete(owner)) return
  publish()
}

export function getPlacementObstacles(): ControlRect[] {
  return snapshot
}

export function subscribePlacementObstacles(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function usePlacementObstacles(): ControlRect[] {
  return useSyncExternalStore(subscribePlacementObstacles, getPlacementObstacles, () => EMPTY)
}

/**
 * Keeps `owner`'s entry in step with what `select` picks under `ref` (default: the element
 * itself): on mount, on `deps`, on subtree changes, on resize. Cleared on unmount.
 */
export function useReportPlacementObstacles(
  ref: React.RefObject<Element | null>,
  owner: string,
  deps: readonly unknown[],
  select: (el: Element) => Element[] = (el) => [el],
): void {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setPlacementObstacles(owner, select(el).map((n) => {
        const r = n.getBoundingClientRect()
        return { x: r.left, y: r.top, w: r.width, h: r.height }
      })))
    }
    measure()
    const mo = typeof MutationObserver === 'function' ? new MutationObserver(measure) : null
    mo?.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'open'] })
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
    ro?.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(frame)
      mo?.disconnect()
      ro?.disconnect()
      window.removeEventListener('resize', measure)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, owner, ...deps])
  useEffect(() => () => clearPlacementObstacles(owner), [owner])
}
