import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useState } from 'react'
import WebMcpDock from '../WebMcpDock'
import { WebMcpRegistryProvider, useWebMcpRegistry } from '../WebMcpRegistry'
import { setSheetExpanded, setSheetObstruction } from '@/lib/trip/sheet-obstruction'
import { AgentTriggerSlot, setAgentTriggerSlot } from '@/lib/webmcp/agent-trigger-slot'

/* Amendment 2 — the agent trigger in the phone trip view's map control stack.
   The dock (shell-mounted) keeps every piece of state; the trip view only offers a slot, and the
   dock portals its trigger into it. Without a slot the folded chip is exactly as before (pinned by
   WebMcpDock.phone.test.tsx, which this file does not touch). */

const h = vi.hoisted(() => ({ path: '/app/trip/abc', mobile: true, listeners: new Set<() => void>() }))
vi.mock('next/navigation', () => ({ usePathname: () => h.path }))

let api: ReturnType<typeof useWebMcpRegistry> | null = null
let showSlot: ((v: boolean) => void) | null = null

function Session({ supported = true }: { supported?: boolean }) {
  const reg = useWebMcpRegistry()
  api = reg
  const { setSupported, report } = reg
  useEffect(() => {
    setSupported(supported)
    report({ name: 'tool_0', description: 'd', readOnly: true, registered: true })
    report({ name: 'tool_1', description: 'd', readOnly: true, registered: true })
  }, [supported, setSupported, report])
  return null
}

/** Stands in for the trip view: a map stack holding the slot, which can go away (navigation). */
function Stack() {
  const [on, setOn] = useState(true)
  showSlot = setOn
  return <div data-testid="stack">{on ? <AgentTriggerSlot className="empty:hidden" /> : null}</div>
}

const mount = (supported = true) =>
  render(
    <WebMcpRegistryProvider>
      <Session supported={supported} />
      <Stack />
      <WebMcpDock />
    </WebMcpRegistryProvider>,
  )

const stack = () => screen.getByTestId('stack')
const trigger = () => screen.getByRole('button', { name: /^(show|hide) agent activity/i })
const overlay = () => screen.queryByRole('region', { name: 'Agent' })

beforeEach(() => {
  api = null
  h.path = '/app/trip/abc'
  h.mobile = true
  h.listeners.clear()
  window.localStorage.clear()
  vi.restoreAllMocks()
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    get matches() { return h.mobile },
    media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: (_: string, l: () => void) => { h.listeners.add(l) },
    removeEventListener: (_: string, l: () => void) => { h.listeners.delete(l) },
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList)
})
afterEach(() => { act(() => { setSheetObstruction(0); setSheetExpanded(false); setAgentTriggerSlot(null) }) })

describe('the agent trigger in the trip map stack', () => {
  it('renders ONE kit icon button inside the slot, and no floating chip', () => {
    mount()
    expect(stack().contains(trigger())).toBe(true)
    expect(screen.getAllByRole('button', { name: /agent activity/i })).toHaveLength(1)
    expect(trigger().className).toMatch(/\bm-btn-icon\b/)
    expect(trigger()).toHaveAccessibleName(/2 tools/)
    expect(document.querySelector('.fixed.z-40')).toBeNull()
  })

  it('renders nothing (and leaves the slot empty) when the browser has no WebMCP', () => {
    mount(false)
    expect(screen.queryByRole('button', { name: /agent activity/i })).toBeNull()
    expect(stack().querySelector('[data-agent-trigger-slot]')!.childElementCount).toBe(0)
  })

  it('stays visible over the expanded sheet — the stack sits above it', () => {
    mount()
    act(() => { setSheetExpanded(true) })
    expect(stack().contains(trigger())).toBe(true)
  })

  it('carries an unread dot and says what arrived, and keeps a hidden live region speaking it', async () => {
    mount()
    await act(async () => { api!.beginActivity('get_map_view'); api!.beginActivity('save_reels') })
    expect(trigger()).toHaveAccessibleName(/2 new, including a change/)
    expect(trigger().querySelector('[data-unread-dot]')).not.toBeNull()
    const live = [...document.querySelectorAll('[aria-live="polite"]')]
      .find((el) => /2 new, including a change/.test(el.textContent ?? ''))
    expect(live).toBeDefined()
    expect(live!.className).toMatch(/sr-only/)
  })

  it('opens the dock overlay, stays put while open, and returns focus to itself on close', async () => {
    const user = userEvent.setup()
    mount()
    await user.click(trigger())
    expect(overlay()).not.toBeNull()
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')   // same place, same control
    await user.click(screen.getByRole('button', { name: /minimise agent activity/i }))
    expect(overlay()).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it('toggles the overlay closed from the trigger itself', async () => {
    const user = userEvent.setup()
    mount()
    await user.click(trigger())
    await user.click(trigger())
    expect(overlay()).toBeNull()
  })

  it('falls back to the folded chip when the slot goes away (navigation off the trip)', () => {
    mount()
    act(() => { showSlot!(false) })
    const chip = screen.getByRole('button', { name: /show agent activity/i })
    expect(chip.closest('.fixed.z-40')).not.toBeNull()
    expect(chip.className).toMatch(/\bh-11\b/)
  })

  it('keeps the fold across a rotation to desktop and back', async () => {
    const user = userEvent.setup()
    mount()
    await user.click(trigger())
    act(() => { h.mobile = false; h.listeners.forEach((l) => l()) })
    act(() => { h.mobile = true; h.listeners.forEach((l) => l()) })
    expect(overlay()).not.toBeNull()
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
  })
})
