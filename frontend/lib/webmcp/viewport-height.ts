'use client'

import { useSyncExternalStore } from 'react'

/**
 * The viewport's height, as a subscription (Codex final-review fix 4).
 *
 * The desktop dock budgets its height from `innerHeight` minus the measured control stack. Read
 * during render, a height-only resize changed nothing React could see: the control rects are
 * top-anchored and unchanged, the layout breakpoint is width-based, so the dock kept its old
 * budget until some unrelated update. Subscribing to `resize` makes the height a real input.
 * 0 on the server; the dock treats that as "not measured".
 */
function subscribe(onChange: () => void): () => void {
  window.addEventListener('resize', onChange)
  return () => window.removeEventListener('resize', onChange)
}

const read = () => window.innerHeight
const server = () => 0

export function useViewportHeight(): number {
  return useSyncExternalStore(subscribe, read, server)
}
