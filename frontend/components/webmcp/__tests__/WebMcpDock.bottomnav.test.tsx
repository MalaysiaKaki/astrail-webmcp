import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useRef } from 'react'
import WebMcpDock from '../WebMcpDock'
import AgentConfirm from '../AgentConfirm'
import { WebMcpRegistryProvider, useWebMcpRegistry } from '../WebMcpRegistry'
import { setBottomNavHeight } from '@/lib/shell/bottom-nav'
import { DOCK_CHIP_HEIGHT } from '@/lib/trip/sheet-obstruction'
import { approvalBottomOverNav, dockBottomOverNav } from '@/lib/webmcp/dock-geometry'
import { clearControlRects, setControlRects } from '@/lib/trip/control-obstruction'

/* Plan amendment 6: on the shell routes the phone bottom tab bar owns the bottom of the screen.
   The dock rides one gap above it, folded AND open, and an approval card sits above both. The bar's
   height comes from Tab C's store (lib/shell/bottom-nav), driven here through setBottomNavHeight;
   its value already includes the float gap and the safe area. jsdom has no layout, so the geometry
   is asserted from the positions the components set, against a simulated bar rect. */

const h = vi.hoisted(() => ({ path: '/app', mobile: true }))
vi.mock('next/navigation', () => ({ usePathname: () => h.path }))

const VH = 844
const NAV = 90                              // bar top at 754: a 64px pill + 12px float + 14px inset
/** The bar's four tabs, as Tab C lays them out: a centred pill, four equal cells. */
function tabRects(nav: number) {
  const top = VH - nav, height = 64, width = 300, left = (390 - width) / 2
  return [0, 1, 2, 3].map((i) => ({ left: left + i * (width / 4), right: left + (i + 1) * (width / 4), top, bottom: top + height }))
}

function Session({ ask }: { ask?: string }) {
  const reg = useWebMcpRegistry()
  const fired = useRef(false)
  useEffect(() => {
    reg.setSupported(true)
    reg.report({ name: 'get_app_state', description: 'd', readOnly: true, registered: true })
    if (ask && !fired.current) { fired.current = true; void reg.requestConfirm(ask) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

const mount = (ask?: string) => render(
  <WebMcpRegistryProvider>
    <Session ask={ask} />
    <WebMcpDock />
    <AgentConfirm />
  </WebMcpRegistryProvider>,
)

/** The dock column's bottom edge (px above the viewport bottom): its `bottom` plus its p-4. */
const dockEdge = () => {
  const col = document.querySelector<HTMLElement>('.fixed.z-40')!
  return parseFloat(col.style.bottom) + 16
}

beforeEach(() => {
  h.path = '/app'
  h.mobile = true
  window.localStorage.clear()
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: VH })
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches: h.mobile && !query.includes('reduce'), media: query, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList)
})
afterEach(() => { act(() => setBottomNavHeight(0)); vi.restoreAllMocks() })

describe('the agent dock above the phone bottom tab bar', () => {
  it('geometry: one gap above the bar, never adding the safe area again', () => {
    expect(dockBottomOverNav(0)).toBeNull()
    expect(dockBottomOverNav(NAV)).toBe(NAV + 12)
    expect(approvalBottomOverNav(NAV)).toBe(NAV + 12 + DOCK_CHIP_HEIGHT + 12)
  })

  for (const path of ['/app', '/app/trips', '/app/settings']) {
    it(`${path}: the folded chip sits above the bar and covers none of its four tabs`, () => {
      h.path = path
      act(() => setBottomNavHeight(NAV))
      mount()
      const chipBottomEdge = dockEdge()                  // px above the viewport bottom
      expect(chipBottomEdge).toBe(NAV + 12)
      const chipRect = { top: VH - chipBottomEdge - DOCK_CHIP_HEIGHT, bottom: VH - chipBottomEdge }
      for (const tab of tabRects(NAV)) expect(chipRect.bottom).toBeLessThanOrEqual(tab.top)
    })
  }

  it('the OPEN overlay also stays above the bar, with its height budget shrunk to fit', async () => {
    act(() => setBottomNavHeight(NAV))
    mount()
    await userEvent.click(screen.getByRole('button', { name: /show agent activity/i }))
    const region = screen.getByRole('region', { name: 'Agent' })
    expect(dockEdge()).toBe(NAV + 12)
    expect(region.style.maxHeight).toContain(`${NAV + 12 + 16}px`)
    for (const tab of tabRects(NAV)) expect(VH - dockEdge()).toBeLessThanOrEqual(tab.top)
  })

  it('an approval card sits above the bar AND the folded chip, and on top of the dock', async () => {
    act(() => setBottomNavHeight(NAV))
    mount('Save these 3 reels')
    const dialog = await screen.findByRole('dialog')
    const cardBottom = parseFloat(dialog.style.bottom)
    expect(cardBottom).toBe(approvalBottomOverNav(NAV))
    expect(cardBottom).toBeGreaterThanOrEqual(dockEdge() + DOCK_CHIP_HEIGHT)   // above the chip's top
    expect(dialog.className).toMatch(/\bz-50\b/)                               // the dock is z-40
    expect(document.querySelector('.fixed.z-40')!.className).toMatch(/\bz-40\b/)
  })

  it('follows the bar as it re-measures, and returns to its corner when the bar goes (0)', () => {
    act(() => setBottomNavHeight(NAV))
    mount()
    expect(dockEdge()).toBe(NAV + 12)
    act(() => setBottomNavHeight(110))
    expect(dockEdge()).toBe(110 + 12)
    act(() => setBottomNavHeight(0))
    expect(document.querySelector<HTMLElement>('.fixed.z-40')!.style.bottom).toBe('')
  })

  it('leaves the approval card in its usual place when there is no bar', async () => {
    mount('Save these 3 reels')
    const dialog = await screen.findByRole('dialog')
    expect(dialog.style.bottom).toBe('')
  })

  /* A7: desktop over the trip map, the dock column is capped to the room under the MEASURED
     right-hand map controls, and the rail steps aside while the tool list is open. */
  it('desktop: caps the column under the measured control stack', async () => {
    h.mobile = false
    h.path = '/app/trip/abc'
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 })
    try {
      act(() => setControlRects('trip-stack-desktop', [0, 1, 2, 3].map((i) => ({ x: 964, y: 16 + i * 52, w: 44, h: 44 }))))
      mount()
      const col = document.querySelector<HTMLElement>('.fixed.z-40')!
      expect(col.style.maxHeight).toBe(`${768 - 216 - 16}px`)
      expect(col.style.getPropertyValue('--dock-room')).toBe(`${768 - 216 - 16}px`)
      await userEvent.click(screen.getByRole('button', { name: /WebMCP active/ }))
      expect(screen.getByText(/Tools an agent can use here/)).toBeInTheDocument()
    } finally {
      act(() => clearControlRects('trip-stack-desktop'))
    }
  })
})
