import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useEffect, useState } from 'react'
import PhoneDock from '../PhoneDock'
import { NOTHING_CLEARED, type ClearedMark } from '../AgentActivityRail'
import { WebMcpRegistryProvider, useWebMcpRegistry } from '../WebMcpRegistry'

/* PhoneDock is phone-only by construction (WebMcpDock only ever mounts it inside its `if (phone)`
   branch). Since plan A7 its children (ExamplePrompts, AgentActivityRail, WebMcpStatus) have one
   light-kit skin at every width, so there is no tone to pass down; this file is about what
   PhoneDock itself paints and how it lays its children out. */

vi.mock('next/navigation', () => ({ usePathname: () => '/app/trip/abc' }))

function Session() {
  const { setSupported, report, beginActivity, endActivity } = useWebMcpRegistry()
  useEffect(() => {
    setSupported(true)
    report({ name: 'get_app_state', description: 'Where you are', readOnly: true, registered: true })
    endActivity(beginActivity('move_place'), 'done', 'Moved "Senso-ji" to day 3.')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

function Harness() {
  const [toolsOpen, setToolsOpen] = useState(false)
  const [cleared, setCleared] = useState<ClearedMark>(NOTHING_CLEARED)
  return (
    <PhoneDock
      collapsed={false}
      chipBottom={null}
      overCanvas
      toolCount={1}
      unread={0}
      hasChange={false}
      onExpand={() => {}}
      onCollapse={() => {}}
      toolsOpen={toolsOpen}
      onToolsOpenChange={setToolsOpen}
      cleared={cleared}
      onClear={setCleared}
    />
  )
}

const open = () =>
  render(
    <WebMcpRegistryProvider>
      <Session />
      <Harness />
    </WebMcpRegistryProvider>,
  )

describe('PhoneDock — the overlay is the light phone UI kit', () => {
  it('paints the "Agent" region as a white kit card, not the dark glass surface', async () => {
    open()
    const region = await screen.findByRole('region', { name: 'Agent' })
    expect(region.className).toMatch(/\bm-card\b/)
    expect(region.className).not.toMatch(/bg-black/)
    // Structural guards a review could otherwise silently regress: the bounded-scroll contract
    // this overlay depends on (pinned in WebMcpDock.phone.test.tsx) is untouched by the restyle.
    expect(region.className).toMatch(/max-h-\[80dvh\]/)
  })

  it('uses a 44px kit icon button for the close control', async () => {
    open()
    const close = screen.getByRole('button', { name: /minimise agent activity/i })
    expect(close.className).toMatch(/\bm-btn-icon\b/)
    expect(close.className).toMatch(/\bh-11\b/)
  })

  it('shows the kit prompts panel in the overlay', async () => {
    open()
    const heading = await screen.findByText(/Try asking the agent/i)
    expect(heading.className).not.toMatch(/uppercase/)
  })

  it('passes the paper tone to the activity rail', async () => {
    open()
    const entry = await screen.findByText('MOVED')
    const card = entry.closest('.m-subcard')
    expect(card).not.toBeNull()
  })

  it('passes the paper tone to the WebMCP status chip', async () => {
    open()
    const chip = await screen.findByRole('button', { name: /webmcp active/i })
    expect(chip.className).toMatch(/\bm-pill-badge\b/)
  })
})

/* A4 follow-up: the tools/status chip sat at the END of the scrolling area, so a long prompts panel
   or tool list pushed it against the overlay's bottom edge and clipped it. It now lives in a fixed
   footer outside the scroll, with tools open or closed. */
describe('PhoneDock — the status chip is always fully inside the overlay', () => {
  const chip = () => screen.getByRole('button', { name: /WebMCP active/ })
  const region = () => screen.getByRole('region', { name: 'Agent' })
  const scroll = () => region().querySelector('[data-dock-scroll]')!
  const footer = () => region().querySelector('[data-dock-footer]')!

  it('sits in a non-scrolling footer, not at the end of the scroll area (tools closed)', async () => {
    open()
    await screen.findByRole('button', { name: /WebMCP active/ })
    expect(footer().contains(chip())).toBe(true)
    expect(scroll().contains(chip())).toBe(false)
    expect(footer().className).toMatch(/\bshrink-0\b/)
    expect(chip().className).toMatch(/\bm-pill-badge\b/)          // the kit's 44px pill
  })

  it('stays in the footer with the tool list open, while the list scrolls above it', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    open()
    await user.click(await screen.findByRole('button', { name: /WebMCP active/ }))
    const list = screen.getByRole('button', { name: 'Close tool list' }).closest('.m-card')!
    expect(scroll().contains(list)).toBe(true)
    expect(footer().contains(chip())).toBe(true)
    expect(chip()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('button', { name: /WebMCP active/ })).toHaveLength(1)
  })

  it('keeps the tool tags at the 12px floor on phones', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    open()
    await user.click(await screen.findByRole('button', { name: /WebMCP active/ }))
    const tag = screen.getByText('reads')
    expect(tag.className).not.toMatch(/text-\[(9|10|11)px\]/)
  })
})

/* A4 follow-up: the folded chip (routes with no map-stack slot) is the light kit pill too. */
describe('PhoneDock — folded chip', () => {
  it('is a light m-pill-badge, not the dark glass pill, and keeps its 44px height and name', () => {
    render(
      <WebMcpRegistryProvider>
        <PhoneDock collapsed chipBottom={null} overCanvas={false} toolCount={3} unread={2} hasChange
          onExpand={() => {}} onCollapse={() => {}} toolsOpen={false} onToolsOpenChange={() => {}}
          cleared={NOTHING_CLEARED} onClear={() => {}} />
      </WebMcpRegistryProvider>,
    )
    const b = screen.getByRole('button', { name: 'Show agent activity, 3 tools, 2 new, including a change' })
    expect(b.className).toMatch(/\bm-pill-badge\b/)
    expect(b.className).toMatch(/\bh-11\b/)
    expect(b.className).not.toMatch(/bg-black|#E8D5B0|#C9974E/)
  })
})

describe('PhoneDock — folded chip clears the map attribution', () => {
  const fold = (props: { overCanvas: boolean; chipBottom: number | null }) => render(
    <WebMcpRegistryProvider>
      <PhoneDock collapsed {...props} toolCount={3} unread={0} hasChange={false}
        onExpand={() => {}} onCollapse={() => {}} toolsOpen={false} onToolsOpenChange={() => {}}
        cleared={NOTHING_CLEARED} onClear={() => {}} />
    </WebMcpRegistryProvider>,
  )
  const column = () => screen.getByRole('button', { name: /Show agent activity/ }).closest('.fixed')!

  it('lifts above Mapbox\'s bottom-right attribution over a map with no sheet', () => {
    fold({ overCanvas: true, chipBottom: null })
    expect(column().className).toMatch(/pb-\[calc\(max\(1rem,env\(safe-area-inset-bottom\)\)\+44px\)\]/)
  })

  it('keeps the plain safe-area corner on a document route, and when riding the sheet', () => {
    const a = fold({ overCanvas: false, chipBottom: null })
    expect(column().className).not.toMatch(/\+44px/)
    a.unmount()
    fold({ overCanvas: true, chipBottom: 400 })
    expect(column().className).not.toMatch(/\+44px/)
  })
})
