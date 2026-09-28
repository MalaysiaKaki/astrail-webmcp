import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { StrictMode } from 'react'
import { act, render, screen, fireEvent } from '@testing-library/react'
import { getSheetExpanded, getSheetObstruction, setSheetExpanded, setSheetObstruction } from '@/lib/trip/sheet-obstruction'
import MobileTripSheet, { SHEET_SETTLE_MS } from '@/components/trip/mobile/MobileTripSheet'

type SheetState = 'compact' | 'expanded' | 'hidden'

function renderSheet(state: SheetState, handlers: Partial<Record<'onToggleHeight' | 'onHide' | 'onReopen', () => void>> = {}) {
  const props = { onToggleHeight: vi.fn(), onHide: vi.fn(), onReopen: vi.fn(), ...handlers }
  const ui = (s: SheetState) => (
    <MobileTripSheet state={s} header={<p>Header</p>} {...props}>
      <p>Body</p>
    </MobileTripSheet>
  )
  const view = render(ui(state))
  return { ...view, props, setState: (s: SheetState) => view.rerender(ui(s)) }
}

describe('MobileTripSheet', () => {
  let top = 464
  beforeEach(() => {
    vi.useFakeTimers()
    top = 464
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      () => ({ top, bottom: 768, left: 0, right: 390, width: 390, height: 768 - top, x: 0, y: top, toJSON: () => ({}) }),
    )
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    setSheetObstruction(0)
    setSheetExpanded(false)
  })

  it('publishes whether it is expanded, and clears that on unmount', () => {
    const { setState, unmount } = renderSheet('compact')
    expect(getSheetExpanded()).toBe(false)
    setState('expanded')
    expect(getSheetExpanded()).toBe(true)
    setState('hidden')
    expect(getSheetExpanded()).toBe(false)
    setState('expanded')
    unmount()
    expect(getSheetExpanded()).toBe(false)
  })

  const settle = () => act(() => { vi.advanceTimersByTime(SHEET_SETTLE_MS + 10) })

  it('publishes the strip it covers once it settles', () => {
    renderSheet('compact')
    settle()
    expect(getSheetObstruction()).toBe(window.innerHeight - 464)
  })

  it('publishes 0 immediately on hide, without waiting for the slide', () => {
    const { setState } = renderSheet('compact')
    settle()
    setState('hidden')
    expect(getSheetObstruction()).toBe(0)
  })

  it('debounces rapid toggles into one settled measurement', () => {
    const { setState } = renderSheet('compact')
    settle()
    top = 92
    setState('expanded')
    top = 464
    setState('compact')
    top = 92
    setState('expanded')
    act(() => { vi.advanceTimersByTime(SHEET_SETTLE_MS - 50) })
    expect(getSheetObstruction()).toBe(window.innerHeight - 464)   // still the old, settled value
    settle()
    expect(getSheetObstruction()).toBe(window.innerHeight - 92)
  })

  it('re-measures when the sheet comes back from hidden', () => {
    const { setState } = renderSheet('hidden')
    settle()
    expect(getSheetObstruction()).toBe(0)
    setState('compact')
    settle()
    expect(getSheetObstruction()).toBe(window.innerHeight - 464)
  })

  it('resets to 0 on unmount so the value never outlives the route', () => {
    const { unmount } = renderSheet('compact')
    settle()
    unmount()
    expect(getSheetObstruction()).toBe(0)
  })

  it('survives a Strict Mode double mount with the right value', () => {
    render(
      <StrictMode>
        <MobileTripSheet state="compact" header={null} onToggleHeight={() => {}} onHide={() => {}} onReopen={() => {}}>
          <p>Body</p>
        </MobileTripSheet>
      </StrictMode>,
    )
    settle()
    expect(getSheetObstruction()).toBe(window.innerHeight - 464)
  })

  it('toggles height from a real button with ARIA state', () => {
    const { props } = renderSheet('compact')
    const grab = screen.getByRole('button', { name: /expand trip sheet/i })
    expect(grab).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(grab)
    expect(props.onToggleHeight).toHaveBeenCalled()
  })

  it('hides, and offers a reopen control only while hidden', () => {
    const { props, setState } = renderSheet('compact')
    fireEvent.click(screen.getByRole('button', { name: /hide trip sheet/i }))
    expect(props.onHide).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /show trip sheet/i })).toBeNull()
    setState('hidden')
    fireEvent.click(screen.getByRole('button', { name: /show trip sheet/i }))
    expect(props.onReopen).toHaveBeenCalled()
  })

  it('makes the hidden sheet inert so it drops out of tab order and AT', () => {
    const { setState } = renderSheet('compact')
    setState('hidden')
    expect(screen.getByTestId('mobile-trip-sheet')).toHaveAttribute('inert')
  })
})
