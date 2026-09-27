import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useRef } from 'react'
import AgentConfirm from '../AgentConfirm'
import { WebMcpRegistryProvider, useWebMcpRegistry, type PromptAnswer } from '../WebMcpRegistry'

/* Phase 3 (mobile): both approval cards fit the space they have — a bounded height, the
   request scrolling INSIDE the card, the actions outside that scroll so they stay reachable on a
   360x640 phone with the keyboard up — take focus when they open, and treat Escape as a decline.
   Dismissing must never authorize. */

type Variant = 'confirm' | 'prompt'

function Asker({ variant, summary, onAnswer }: {
  variant: Variant; summary: string; onAnswer: (v: boolean | PromptAnswer | 'unavailable') => void
}) {
  const { requestConfirm, requestPrompt } = useWebMcpRegistry()
  const fired = useRef(false)
  useEffect(() => {
    if (fired.current) return
    fired.current = true
    const p = variant === 'confirm'
      ? requestConfirm(summary)
      : requestPrompt(summary, { label: 'Different this trip?', placeholder: 'e.g. slower days' })
    void p.then(onAnswer)
  }, [variant, requestConfirm, requestPrompt, summary, onAnswer])
  return null
}

function ask(variant: Variant, summary = 'Plan a trip from 3 reels\nThis uses your trip allowance.') {
  const onAnswer = vi.fn()
  render(
    <WebMcpRegistryProvider>
      <Asker variant={variant} summary={summary} onAnswer={onAnswer} />
      <AgentConfirm />
    </WebMcpRegistryProvider>,
  )
  return onAnswer
}

describe.each<Variant>(['confirm', 'prompt'])('AgentConfirm (%s) on small screens', (variant) => {
  it('moves focus into the card when it opens', async () => {
    ask(variant)
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
  })

  it('treats Escape as a decline — dismissing never authorizes', async () => {
    const onAnswer = ask(variant)
    await screen.findByRole('dialog')
    if (variant === 'prompt') await userEvent.type(screen.getByLabelText(/different this trip/i), 'temples')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(onAnswer).toHaveBeenCalledTimes(1))
    expect(onAnswer).toHaveBeenCalledWith(variant === 'confirm' ? false : { approved: false, text: null })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('is bounded to the viewport and scrolls the request, never the actions', async () => {
    ask(variant, 'A very long request\n'.repeat(80))
    const dialog = await screen.findByRole('dialog')
    expect(dialog.className).toMatch(/max-h-/)
    const scroller = dialog.querySelector('[data-confirm-body]')!
    expect(scroller.className).toMatch(/overflow-y-auto/)
    const decline = screen.getByRole('button', { name: /not now/i })
    expect(scroller.contains(decline)).toBe(false)
    expect(decline.className).toMatch(/min-h-11/)
  })
})

/* Codex #5: the card takes focus when it opens, so it must give it back when it closes —
   otherwise Escape (or either action) leaves focus on <body> and the next Tab starts elsewhere. */
function Trigger({ variant }: { variant: Variant }) {
  const { requestConfirm, requestPrompt } = useWebMcpRegistry()
  return (
    <button
      type="button"
      onClick={() => {
        void (variant === 'confirm'
          ? requestConfirm('Plan a trip')
          : requestPrompt('Plan a trip', { label: 'Different this trip?', placeholder: 'x' }))
      }}
    >
      Ask
    </button>
  )
}

describe.each<Variant>(['confirm', 'prompt'])('AgentConfirm (%s) focus return', (variant) => {
  const open = async () => {
    render(
      <WebMcpRegistryProvider>
        <Trigger variant={variant} />
        <AgentConfirm />
      </WebMcpRegistryProvider>,
    )
    const ask = screen.getByRole('button', { name: 'Ask' })
    await userEvent.click(ask)                      // focus is on "Ask" when the card opens
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
    return ask
  }

  it('returns focus to the control that had it after Escape', async () => {
    const ask = await open()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(ask)
  })

  it('returns focus after the decline button closes the card', async () => {
    const ask = await open()
    await userEvent.click(screen.getByRole('button', { name: /not now/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(ask)
  })

  it('returns focus after the approve button closes the card', async () => {
    const ask = await open()
    await userEvent.click(screen.getByRole('button', { name: /approve|try what it remembers|use this instead/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(ask)
  })
})
