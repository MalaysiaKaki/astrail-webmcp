import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import WebMcpDock from '../WebMcpDock'
import { WebMcpRegistryProvider, useWebMcpRegistry } from '../WebMcpRegistry'
import { dockChipBottom, setSheetExpanded, setSheetObstruction } from '@/lib/trip/sheet-obstruction'

/* Phase 3 — the dock on a phone (plan "Dock and approvals on mobile", amendments 7 and 8).
   Folded, it is ONE chip of at least 44px that still carries the unread/change announcement and
   the unsupported state. Unfolded, it is a bounded overlay (max 80dvh, internal scroll, a
   reachable close) that is not offset by the trip sheet. Phones fold by LAYOUT default, never by
   a stored value; the stored value records explicit actions only. Desktop is pinned by the
   original WebMcpDock.test.tsx, which this file does not touch. */

const h = vi.hoisted(() => ({ path: '/app/trip/abc', mobile: true, listeners: new Set<() => void>() }))
vi.mock('next/navigation', () => ({ usePathname: () => h.path }))

const KEY = 'astrail:webmcp:dock-collapsed'
let api: ReturnType<typeof useWebMcpRegistry> | null = null

function Session({ supported = true, tools = 2 }: { supported?: boolean; tools?: number }) {
  const reg = useWebMcpRegistry()
  api = reg
  const { setSupported, report } = reg
  useEffect(() => {
    setSupported(supported)
    for (let i = 0; i < tools; i++) report({ name: `tool_${i}`, description: 'd', readOnly: true, registered: true })
  }, [supported, tools, setSupported, report])
  return null
}

const dock = (props: { supported?: boolean; tools?: number } = {}) =>
  render(
    <WebMcpRegistryProvider>
      <Session {...props} />
      <WebMcpDock />
    </WebMcpRegistryProvider>,
  )

function setMobile(next: boolean) {
  h.mobile = next
  act(() => { h.listeners.forEach((l) => l()) })
}

const container = () => document.querySelector<HTMLElement>('.fixed.z-40')!
const chip = () => screen.getByRole('button', { name: /show agent activity/i })
const overlay = () => screen.queryByRole('region', { name: 'Agent' })
const close = () => screen.getByRole('button', { name: /minimise agent activity/i })

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
afterEach(() => { act(() => { setSheetObstruction(0); setSheetExpanded(false) }) })

describe('WebMcpDock on a phone — one chip', () => {
  it('folds to exactly one button of at least 44px carrying the tool count', () => {
    dock()
    const buttons = within(container()).getAllByRole('button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]).toBe(chip())
    expect(chip().className).toMatch(/\bh-11\b/)
    expect(chip()).toHaveAccessibleName(/2 tools/)
    expect(screen.queryByText(/WebMCP active/)).toBeNull()
  })

  it('still announces what arrives while folded, including a change', async () => {
    dock()
    await act(async () => { api!.beginActivity('get_map_view'); api!.beginActivity('save_reels') })
    expect(chip()).toHaveAccessibleName(/2 new, including a change/)
    expect(chip().closest('[aria-live="polite"]')).not.toBeNull()
  })

  /* Phase 7: real phone browsers (Safari, Chrome, Arc) have no WebMCP, so a "No agent" pill was
     what EVERY normal visitor saw over the map. On a phone the dock renders nothing then; the
     desktop dock keeps its honest disconnected chip (pinned in WebMcpDock.test.tsx). */
  it('renders nothing on a phone when the browser has no WebMCP', () => {
    dock({ supported: false, tools: 0 })
    expect(screen.queryByRole('button', { name: /show agent activity/i })).toBeNull()
    expect(screen.queryByText(/No agent/)).toBeNull()
    expect(document.querySelector('.fixed.z-40')).toBeNull()
  })

  /* Codex p7 #2: hiding the chip must not remove the announcement. Activity arriving while the
     sheet is expanded is still spoken, from a visually hidden polite live region. */
  it('still announces activity that arrives while the chip is hidden by the expanded sheet', async () => {
    dock()
    act(() => { setSheetExpanded(true) })
    expect(screen.queryByRole('button', { name: /show agent activity/i })).toBeNull()
    await act(async () => { api!.beginActivity('get_map_view'); api!.beginActivity('save_reels') })
    const live = [...document.querySelectorAll('[aria-live="polite"]')]
      .find((el) => /2 new, including a change/.test(el.textContent ?? ''))
    expect(live).toBeDefined()
    expect(live!.className).toMatch(/sr-only/)
  })

  it('hides the folded chip while the trip sheet is expanded, and brings it back after', () => {
    dock()
    expect(chip()).toBeInTheDocument()
    act(() => { setSheetExpanded(true) })
    expect(screen.queryByRole('button', { name: /show agent activity/i })).toBeNull()
    act(() => { setSheetExpanded(false) })
    expect(chip()).toBeInTheDocument()
  })
})

describe('WebMcpDock on a phone — the overlay', () => {
  it('opens as a bounded, internally scrolling overlay with a reachable close', async () => {
    dock()
    await userEvent.click(chip())
    const o = overlay()!
    expect(o.className).toMatch(/max-h-\[80dvh\]/)
    expect(o.querySelector('[data-dock-scroll]')!.className).toMatch(/overflow-y-auto/)
    expect(close().className).toMatch(/\bh-11\b/)
    expect(within(o).getByText(/move stop 7 to day 3/)).toBeInTheDocument()
    await userEvent.click(close())
    expect(overlay()).toBeNull()
    expect(chip()).toBeInTheDocument()
  })

  it('is not offset by the sheet while open, and rides the sheet edge once folded again', async () => {
    setSheetObstruction(380)
    dock()
    expect(container().style.bottom).toBe(`${dockChipBottom(380, window.innerHeight)! - 16}px`)
    await userEvent.click(chip())
    expect(container().style.bottom).toBe('')
  })
})

describe('WebMcpDock on a phone — collapse semantics', () => {
  it('fresh storage: folded on a phone, open on desktop, and nothing is written', () => {
    const { unmount } = dock()
    expect(chip()).toBeInTheDocument()
    unmount()
    h.mobile = false
    dock()
    expect(screen.getByText(/move stop 7 to day 3/)).toBeInTheDocument()
    expect(window.localStorage.getItem(KEY)).toBeNull()
  })

  it('stored collapse: folded on both layouts', () => {
    window.localStorage.setItem(KEY, '1')
    const { unmount } = dock()
    expect(chip()).toBeInTheDocument()
    unmount()
    h.mobile = false
    dock()
    expect(screen.queryByText(/move stop 7 to day 3/)).toBeNull()
  })

  it('storage that throws: still folded on a phone', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    dock()
    expect(chip()).toBeInTheDocument()
  })

  it('mobile↔desktop with no choice follows the layout default', () => {
    dock()
    expect(chip()).toBeInTheDocument()
    setMobile(false)
    expect(screen.getByText(/move stop 7 to day 3/)).toBeInTheDocument()
    setMobile(true)
    expect(chip()).toBeInTheDocument()
  })

  it('an explicit choice holds across rotation and resize', async () => {
    dock()
    await userEvent.click(chip())
    setMobile(false)
    setMobile(true)
    expect(overlay()).not.toBeNull()
  })

  it('route /app → trip stays folded on a phone', () => {
    h.path = '/app'
    const view = dock()
    expect(chip()).toBeInTheDocument()
    h.path = '/app/trip/abc'
    view.rerender(
      <WebMcpRegistryProvider>
        <Session />
        <WebMcpDock />
      </WebMcpRegistryProvider>,
    )
    expect(chip()).toBeInTheDocument()
  })

  it('/app/trips with no sheet: the chip sits in the safe-area corner', () => {
    h.path = '/app/trips'
    dock()
    expect(chip()).toBeInTheDocument()
    expect(container().style.bottom).toBe('')
  })
})
