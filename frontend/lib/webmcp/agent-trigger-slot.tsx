'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * Where the agent trigger should render, when a page offers a place for it.
 *
 * The dock (WebMcpDock) is mounted once by the /app shell and owns every piece of agent state —
 * fold, unread watermark, clears — so that state survives navigation and rotation. The phone trip
 * view wants the trigger in its map control stack instead of the dock's floating corner. Rather
 * than move state into the trip page, the trip page publishes an empty element here and the dock
 * portals its trigger into it. Routes without a slot (the /app home, loading, failed, generating)
 * keep the dock's own folded chip.
 *
 * A module store for the same reason as sheet-obstruction: the writer (trip page) and the reader
 * (shell dock) live in different subtrees and neither owns the other.
 */

let slot: HTMLElement | null = null
const listeners = new Set<() => void>()

export function getAgentTriggerSlot(): HTMLElement | null {
  return slot
}

/**
 * Publish (`el`) or clear (`null`) the slot. A clear names the element it is clearing (`owner`),
 * so a late cleanup from an outgoing slot cannot wipe the one that already replaced it.
 */
export function setAgentTriggerSlot(el: HTMLElement | null, owner?: HTMLElement): void {
  if (el === null && owner !== undefined && slot !== owner) return
  if (el === slot) return
  slot = el
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function useAgentTriggerSlot(): HTMLElement | null {
  return useSyncExternalStore(subscribe, getAgentTriggerSlot, () => null)
}

/** The element a page renders where it wants the trigger. Empty (and hidden) until filled. */
export function AgentTriggerSlot({ className }: { className?: string }) {
  const ref = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    setAgentTriggerSlot(el)
    return () => setAgentTriggerSlot(null, el)
  }, [])
  return <div ref={ref} data-agent-trigger-slot className={className} />
}
