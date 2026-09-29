import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import DateRangePicker, { popoverPlacement } from '@/components/create/DateRangePicker'

function openOn(startDate = '', endDate = '') {
  const onChange = vi.fn()
  render(<DateRangePicker startDate={startDate} endDate={endDate} onChange={onChange} />)
  fireEvent.click(screen.getByRole('button', { name: /trip dates/i }))
  return { onChange, dialog: screen.getByRole('dialog') }
}

describe('DateRangePicker', () => {
  it('shows a placeholder trigger when no range is set', () => {
    render(<DateRangePicker startDate="" endDate="" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /select trip dates/i })).toHaveTextContent('Add trip dates')
  })

  it('renders the committed range and night count on the trigger', () => {
    render(<DateRangePicker startDate="2026-08-01" endDate="2026-08-04" onChange={vi.fn()} />)
    expect(screen.getByText('Aug 1 → Aug 4')).toBeInTheDocument()
    expect(screen.getByText('3 nights')).toBeInTheDocument()
  })

  it('opens to the month of the committed start date', () => {
    const { dialog } = openOn('2026-08-01', '2026-08-04')
    expect(within(dialog).getByText('August 2026')).toBeInTheDocument()
  })

  it('commits a normalized [lo, hi] range regardless of click order', () => {
    const { onChange, dialog } = openOn('2026-08-01', '2026-08-31')
    // Click the 20th first, then the 5th — should still emit [05, 20].
    fireEvent.click(within(dialog).getByRole('button', { name: 'August 20, 2026' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'August 5, 2026' }))
    expect(onChange).toHaveBeenCalledWith('2026-08-05', '2026-08-20')
  })

  it('does not commit on the first click (range needs two endpoints)', () => {
    const { onChange, dialog } = openOn('2026-08-01', '2026-08-31')
    fireEvent.click(within(dialog).getByRole('button', { name: 'August 10, 2026' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument() // stays open
  })

  it('navigates months with the chevrons', () => {
    const { dialog } = openOn('2026-08-01', '2026-08-04')
    fireEvent.click(within(dialog).getByRole('button', { name: /next month/i }))
    expect(within(dialog).getByText('September 2026')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: /previous month/i }))
    fireEvent.click(within(dialog).getByRole('button', { name: /previous month/i }))
    expect(within(dialog).getByText('July 2026')).toBeInTheDocument()
  })

  it('closes on Escape without committing', () => {
    const { onChange, dialog } = openOn('2026-08-01', '2026-08-04')
    fireEvent.keyDown(within(dialog).getByRole('grid'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('disables days before minDate', () => {
    const onChange = vi.fn()
    // startDate pins the opening month to August 2026 deterministically.
    render(<DateRangePicker startDate="2026-08-15" endDate="2026-08-20" minDate="2026-08-10" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /trip dates/i }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'August 5, 2026' })).toBeDisabled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'August 5, 2026' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('selects a single-day (same-day) trip', () => {
    const { onChange, dialog } = openOn('2026-08-01', '2026-08-31')
    fireEvent.click(within(dialog).getByRole('button', { name: 'August 12, 2026' }))
    fireEvent.click(screen.getByRole('button', { name: 'August 12, 2026' }))
    expect(onChange).toHaveBeenCalledWith('2026-08-12', '2026-08-12')
  })

  it('selects a range by keyboard (arrows + Enter), rolling across a month boundary', () => {
    // Opens on August with focus seeded to the 10th (the committed start).
    const { onChange, dialog } = openOn('2026-08-10', '2026-08-10')
    const grid = within(dialog).getByRole('grid')
    fireEvent.keyDown(grid, { key: 'Enter' })       // anchor = Aug 10
    fireEvent.keyDown(grid, { key: 'ArrowDown' })   // +7 → Aug 17
    fireEvent.keyDown(grid, { key: 'ArrowRight' })  // +1 → Aug 18
    fireEvent.keyDown(grid, { key: 'Enter' })       // commit [Aug 10, Aug 18]
    expect(onChange).toHaveBeenCalledWith('2026-08-10', '2026-08-18')
  })

  it('arrow-navigates into the next month, updating the grid heading', () => {
    const { dialog } = openOn('2026-08-30', '2026-08-30')
    const grid = within(dialog).getByRole('grid')
    fireEvent.keyDown(grid, { key: 'ArrowDown' }) // Aug 30 + 7 → Sep 6
    expect(within(dialog).getByText('September 2026')).toBeInTheDocument()
  })

  const tabbableDay = (dialog: HTMLElement) =>
    within(dialog).getAllByRole('button')
      .find((b) => b.getAttribute('tabindex') === '0' && b.hasAttribute('data-iso'))
      ?.getAttribute('data-iso')

  it('moves real focus onto the day cell as arrows navigate', () => {
    const { dialog } = openOn('2026-08-10', '2026-08-10')
    expect(document.activeElement?.getAttribute('data-iso')).toBe('2026-08-10') // focused on open
    fireEvent.keyDown(within(dialog).getByRole('grid'), { key: 'ArrowRight' })
    expect(document.activeElement?.getAttribute('data-iso')).toBe('2026-08-11')
    expect(tabbableDay(dialog)).toBe('2026-08-11') // roving tabindex followed
  })

  it('keeps focus on a mouse-clicked day so keyboard continues from there', () => {
    // Regression: pick() must sync focusDay, else ArrowRight+Enter commits from the stale seed.
    const { onChange, dialog } = openOn('2026-08-01', '2026-08-01')
    fireEvent.click(within(dialog).getByRole('button', { name: 'August 20, 2026' })) // anchor + focus → 20
    fireEvent.keyDown(within(dialog).getByRole('grid'), { key: 'ArrowRight' })        // → 21
    fireEvent.keyDown(within(dialog).getByRole('grid'), { key: 'Enter' })             // commit
    expect(onChange).toHaveBeenCalledWith('2026-08-20', '2026-08-21')
  })

  it('carries a tabbable/focus day into the new month after a chevron click', () => {
    // Regression: without moving focusDay, the new month has no tabbable cell and Tab escapes.
    const { onChange, dialog } = openOn('2026-08-15', '2026-08-15')
    fireEvent.click(within(dialog).getByRole('button', { name: /next month/i }))
    expect(tabbableDay(dialog)).toBe('2026-09-15')
    const grid = within(dialog).getByRole('grid')
    fireEvent.keyDown(grid, { key: 'Enter' })      // anchor Sep 15
    fireEvent.keyDown(grid, { key: 'ArrowRight' }) // Sep 16
    fireEvent.keyDown(grid, { key: 'Enter' })      // commit
    expect(onChange).toHaveBeenCalledWith('2026-09-15', '2026-09-16')
  })

  it('PageDown advances exactly one month, even from a 31st (no month skip)', () => {
    const { dialog } = openOn('2026-01-31', '2026-01-31')
    fireEvent.keyDown(within(dialog).getByRole('grid'), { key: 'PageDown' })
    expect(within(dialog).getByText('February 2026')).toBeInTheDocument() // not March
  })

  it('opens clamped to minDate when the committed start is earlier', () => {
    const onChange = vi.fn()
    render(<DateRangePicker startDate="2026-07-01" endDate="2026-07-05" minDate="2026-08-10" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /trip dates/i }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('August 2026')).toBeInTheDocument() // not the disabled July
    const aug10 = within(dialog).getByRole('button', { name: 'August 10, 2026' })
    expect(aug10).toBeEnabled()
    expect(tabbableDay(dialog)).toBe('2026-08-10') // focus seeded to an enabled day
  })

  it('does not crash rendering a malformed date prop', () => {
    expect(() =>
      render(<DateRangePicker startDate="not-a-date" endDate="" onChange={vi.fn()} />),
    ).not.toThrow()
    expect(screen.getByRole('button', { name: /select trip dates/i })).toHaveTextContent('Add trip dates')
  })
})

/* C6: the calendar is portaled and fixed-positioned against the trigger. On a short viewport
   (844x390 landscape) with a six-week month, the top-placed picker used to run off the top of the
   screen: its header, month navigation and early dates were unreachable. It now picks the side with
   room, caps its height to that side, and scrolls inside with the month header pinned. */
describe('popoverPlacement', () => {
  const trigger = (top: number, bottom: number) => ({ top, bottom })

  it('keeps the preferred side when it has comfortable room, capped to it', () => {
    const p = popoverPlacement(trigger(700, 744), 900, 'top')
    expect(p).toEqual({ bottom: 900 - 700 + 8, maxHeight: 700 - 8 - 8 })
  })

  it('flips to the roomier side when the preferred one is cramped', () => {
    const p = popoverPlacement(trigger(120, 164), 900, 'top')
    expect(p).toEqual({ top: 164 + 8, maxHeight: 900 - 164 - 8 - 8 })
  })

  it('never lets the popover extend past the viewport on the chosen side', () => {
    for (const [top, bottom, vh, pref] of [[200, 244, 390, 'top'], [300, 344, 390, 'top'], [40, 84, 390, 'bottom'], [150, 194, 390, 'bottom']] as const) {
      const p = popoverPlacement(trigger(top, bottom), vh, pref)
      const topEdge = 'top' in p ? p.top! : vh - p.bottom! - p.maxHeight
      const bottomEdge = 'top' in p ? p.top! + p.maxHeight : vh - p.bottom!
      expect(topEdge, `${top}/${pref}`).toBeGreaterThanOrEqual(8)
      expect(bottomEdge, `${top}/${pref}`).toBeLessThanOrEqual(vh - 8)
    }
  })

  it('pins to the whole viewport height when neither side fits a full month (short landscape)', () => {
    // 667x375 with the trigger low in the sheet: 189px above would show barely two weeks.
    expect(popoverPlacement(trigger(205, 249), 375, 'top')).toEqual({ top: 8, maxHeight: 375 - 16 })
    expect(popoverPlacement(trigger(140, 184), 330, 'top')).toEqual({ top: 8, maxHeight: 330 - 16 })
  })
})

describe('DateRangePicker on a short viewport (844x390, six-week month)', () => {
  it('pins the calendar to the viewport height and scrolls inside it', () => {
    const vh = window.innerHeight
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 390 })
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 300, bottom: 344, left: 16, right: 336, width: 320, height: 44, x: 16, y: 300, toJSON: () => ({}),
    } as DOMRect)
    try {
      // May 2027 starts on a Saturday and spans six weeks.
      render(<DateRangePicker startDate="2027-05-01" endDate="2027-05-03" onChange={vi.fn()} placement="top" />)
      fireEvent.click(screen.getByRole('button', { name: /trip dates/i }))
      const dialog = screen.getByRole('dialog')
      // Neither side of a trigger at 300px fits a full month in 390px, so it takes the viewport.
      expect(dialog.style.maxHeight).toBe(`${390 - 16}px`)
      expect(dialog.style.top).toBe('8px')
      expect(dialog.style.overflowY).toBe('auto')
      // Month navigation stays in the DOM order first and is pinned while the grid scrolls.
      expect(within(dialog).getByRole('button', { name: /previous month/i }).closest('[data-picker-header]')).toHaveClass('sticky')
      expect(within(dialog).getByRole('button', { name: 'May 31, 2027' })).toBeInTheDocument()
    } finally {
      rectSpy.mockRestore()
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: vh })
    }
  })
})
