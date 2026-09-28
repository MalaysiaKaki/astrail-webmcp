import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useEffect, useState } from 'react'
import PhoneDock from '../PhoneDock'
import { NOTHING_CLEARED, type ClearedMark } from '../AgentActivityRail'
import { WebMcpRegistryProvider, useWebMcpRegistry } from '../WebMcpRegistry'

/* PhoneDock is phone-only by construction (WebMcpDock only ever mounts it inside its `if (phone)`
   branch), so unlike its three siblings it carries no `tone` prop of its own — its own JSX (the
   `region "Agent"` overlay wrapper, its header and its close button) is unconditionally the light
   phone UI kit, and it passes `tone="paper"` down to ExamplePrompts, AgentActivityRail and
   WebMcpStatus. The dark "night" look these three default to is proven byte-identical to before
   this prop existed in their OWN test files; this file is only about what PhoneDock itself paints
   and what it hands its children. */

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

  it('passes the paper tone to the prompts panel', async () => {
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
