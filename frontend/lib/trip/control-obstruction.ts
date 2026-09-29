'use client'

import { useEffect, useSyncExternalStore } from 'react'

/**
 * Where the map's floating controls actually are, in viewport pixels.
 *
 * The camera pads its framing so no pin lands under a control (components/map/frame-padding). It
 * used to model the controls as "a back button and N circles"; now the controls measure themselves
 * and publish their rects here, so a changed stack (3D added, Hotel dropped on a short phone, the
 * agent slot empty without WebMCP, the desktop stack) is padded for as it really renders.
 *
 * A module store, like sheet-obstruction, because the writers (the control stacks) and the reader
 * (TripMap, which drives a shared map) live in different subtrees. Keyed by owner, so two writers
 * (the back button and the stack) never overwrite each other, and each clears only its own entry.
 */

export type ControlRect = { x: number; y: number; w: number; h: number }

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

export function setControlRects(owner: string, rects: readonly ControlRect[]): void {
  const clean = rects
    .filter((r) => [r.x, r.y, r.w, r.h].every(Number.isFinite) && r.w > 0 && r.h > 0)
    .map((r) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) }))
  if (same(byOwner.get(owner), clean)) return
  if (clean.length) byOwner.set(owner, clean)
  else if (byOwner.has(owner)) byOwner.delete(owner)
  else return
  publish()
}

export function clearControlRects(owner: string): void {
  if (!byOwner.delete(owner)) return
  publish()
}

export function getControlRects(): ControlRect[] {
  return snapshot
}

export function subscribeControlRects(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function useControlRects(): ControlRect[] {
  return useSyncExternalStore(subscribeControlRects, getControlRects, () => EMPTY)
}

/** Measures every visible `[data-map-control]` element in (or being) `el`. */
export function measureControls(el: Element): ControlRect[] {
  const nodes = [
    ...(el.matches('[data-map-control]') ? [el] : []),
    ...Array.from(el.querySelectorAll('[data-map-control]')),
  ]
  return nodes.map((n) => {
    const r = n.getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height }
  })
}

/**
 * Keeps `owner`'s entry in step with the controls under `ref`: on mount, whenever `deps` change
 * (a button shown or hidden), when the subtree changes (the agent trigger is portalled in late),
 * and on resize. Cleared on unmount so the rects never outlive the route that drew them.
 */
export function useReportControls(
  ref: React.RefObject<Element | null>,
  owner: string,
  deps: readonly unknown[],
): void {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setControlRects(owner, measureControls(el)))
    }
    measure()
    const mo = typeof MutationObserver === 'function' ? new MutationObserver(measure) : null
    mo?.observe(el, { childList: true, subtree: true })
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
  useEffect(() => () => clearControlRects(owner), [owner])
}
