import { describe, it, expect, afterEach } from 'vitest'
import { act, render } from '@testing-library/react'
import {
  AgentTriggerSlot, getAgentTriggerSlot, setAgentTriggerSlot, useAgentTriggerSlot,
} from '@/lib/webmcp/agent-trigger-slot'

afterEach(() => { setAgentTriggerSlot(null) })

function Reader({ seen }: { seen: (el: HTMLElement | null) => void }) {
  seen(useAgentTriggerSlot())
  return null
}

describe('the agent trigger slot', () => {
  it('publishes the slot element while mounted and clears it on unmount', () => {
    const view = render(<AgentTriggerSlot className="x" />)
    const el = getAgentTriggerSlot()
    expect(el).toBeInstanceOf(HTMLElement)
    expect(el!.className).toContain('x')
    view.unmount()
    expect(getAgentTriggerSlot()).toBeNull()
  })

  it('re-renders readers when the slot appears and goes', () => {
    const seen: (HTMLElement | null)[] = []
    render(<Reader seen={(e) => seen.push(e)} />)
    expect(seen.at(-1)).toBeNull()
    const slot = render(<AgentTriggerSlot />)
    expect(seen.at(-1)).toBeInstanceOf(HTMLElement)
    slot.unmount()
    expect(seen.at(-1)).toBeNull()
  })

  it('does not let a stale unmount clear a newer slot', () => {
    const a = document.createElement('div')
    const b = document.createElement('div')
    act(() => { setAgentTriggerSlot(a) })
    act(() => { setAgentTriggerSlot(b) })
    act(() => { setAgentTriggerSlot(null, a) })   // a's cleanup, late
    expect(getAgentTriggerSlot()).toBe(b)
  })
})
