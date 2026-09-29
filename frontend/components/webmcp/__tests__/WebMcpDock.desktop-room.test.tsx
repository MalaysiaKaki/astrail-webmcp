import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import WebMcpDock from '../WebMcpDock'
import { WebMcpRegistryProvider, useWebMcpRegistry } from '../WebMcpRegistry'
import { clearControlRects, setControlRects } from '@/lib/trip/control-obstruction'

/* Codex final-review fixes 3 and 4 (plan 2026-09-29-desktop-trip-page-v2).

   3. The desktop dock is capped to the room under the map controls, but a capped overflow-visible
      column does not make its children fit: at 844x390 (158px of room) the prompts card plus the
      footer spilled below the viewport. The dock is now ONE bounded scroll area (prompts, rail,
      tool list) above a fixed footer (Minimise and the status chip), like the phone overlay.
   4. The budget read window.innerHeight during render with no subscription, so a height-only
      resize (no control rect moves) left it stale. */

const h = vi.hoisted(() => ({ path: '/app/trip/demo' }))
vi.mock('next/navigation', () => ({ usePathname: () => h.path }))

function Session({ entries = 3 }: { entries?: number }) {
  const { setSupported, report, beginActivity, endActivity } = useWebMcpRegistry()
  useEffect(() => {
    setSupported(true)
    report({ name: 'get_itinerary', description: 'd', readOnly: true, registered: true })
    for (let i = 0; i < entries; i++) endActivity(beginActivity('get_itinerary'), 'done', 'read the trip')
  }, [entries, setSupported, report, beginActivity, endActivity])
  return null
}

const mount = () => render(
  <WebMcpRegistryProvider>
    <Session />
    <WebMcpDock />
  </WebMcpRegistryProvider>,
)

function viewport(w: number, hgt: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: w })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: hgt })
}

/** The desktop stack: four 44px controls from y=16, 52px apart, so it ends at 216. */
const STACK = (w: number) => [0, 1, 2, 3].map((i) => ({ x: w - 60, y: 16 + i * 52, w: 44, h: 44 }))

const column = () => document.querySelector<HTMLElement>('.fixed.z-40')!
const scrollArea = () => column().querySelector<HTMLElement>('[data-dock-scroll]')
const footer = () => column().querySelector<HTMLElement>('[data-dock-footer]')

beforeEach(() => {
  h.path = '/app/trip/demo'
  window.localStorage.clear()
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList)
})
afterEach(() => { act(() => clearControlRects('trip-stack-desktop')); vi.restoreAllMocks() })

describe('desktop dock: one bounded scroll area over a fixed footer (fix 3)', () => {
  it('at 844x390 every child sits in the scroll area and the footer stays outside it', async () => {
    viewport(844, 390)
    act(() => setControlRects('trip-stack-desktop', STACK(844)))
    mount()
    expect(column().style.maxHeight).toBe(`${390 - 216 - 16}px`)          // 158px of room

    const scroll = scrollArea()!
    const foot = footer()!
    expect(scroll).not.toBeNull()
    expect(foot).not.toBeNull()
    // The scroll area can shrink below its content and scrolls; the footer never shrinks.
    expect(scroll.className).toMatch(/\bmin-h-0\b/)
    expect(scroll.className).toMatch(/\boverflow-y-auto\b/)
    expect(foot.className).toMatch(/\bshrink-0\b/)
    expect(scroll.contains(foot)).toBe(false)

    // Prompts and activity scroll; Minimise and the status chip are in the footer.
    expect(scroll.contains(screen.getByText('Try asking the agent'))).toBe(true)
    expect(scroll.contains(screen.getByLabelText('Clear agent activity'))).toBe(true)
    expect(foot.contains(screen.getByRole('button', { name: /minimise/i }))).toBe(true)
    expect(foot.contains(screen.getByRole('button', { name: /WebMCP active/ }))).toBe(true)

    // The tool list opens INSIDE the scroll area, and its own cap cannot collapse to zero when
    // the budget is smaller than the old 13rem subtraction.
    await userEvent.click(screen.getByRole('button', { name: /WebMCP active/ }))
    const list = screen.getByText(/Tools an agent can use here/)
    expect(scroll.contains(list)).toBe(true)
    expect(foot.contains(screen.getByRole('button', { name: /WebMCP active/ }))).toBe(true)
    const listBody = scroll.querySelector<HTMLElement>('[data-tool-list-body]')!
    expect(listBody.className).not.toMatch(/calc\(var\(--dock-room,100dvh\)-13rem\)\)\]/)
  })

  it('folded, the footer still holds the pill and the chip', async () => {
    viewport(844, 390)
    act(() => setControlRects('trip-stack-desktop', STACK(844)))
    mount()
    await userEvent.click(screen.getByRole('button', { name: /minimise/i }))
    const foot = footer()!
    expect(foot.contains(screen.getByRole('button', { name: /show agent activity/i }))).toBe(true)
    expect(foot.contains(screen.getByRole('button', { name: /WebMCP active/ }))).toBe(true)
  })
})

describe('desktop dock: the budget follows the viewport height (fix 4)', () => {
  it('a height-only resize re-budgets the dock with no other state change', () => {
    viewport(1024, 900)
    act(() => setControlRects('trip-stack-desktop', STACK(1024)))
    mount()
    expect(column().style.maxHeight).toBe(`${900 - 216 - 16}px`)
    act(() => {
      viewport(1024, 500)
      window.dispatchEvent(new Event('resize'))
    })
    expect(column().style.maxHeight).toBe('268px')
    expect(column().style.getPropertyValue('--dock-room')).toBe('268px')
  })
})
