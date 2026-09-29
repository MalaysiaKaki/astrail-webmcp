import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import TripTabs from '../TripTabs'
import type { TripTab } from '@/lib/trip/reveal'

function Harness({ onTab }: { onTab?: (t: TripTab) => void }) {
  const [tab, setTab] = useState<TripTab>('trip')
  return <TripTabs tab={tab} onTab={(t) => { setTab(t); onTab?.(t) }} />
}

describe('TripTabs', () => {
  it('is a tablist of three tabs with one tab stop and 44px targets', () => {
    render(<Harness />)
    expect(screen.getByRole('tablist', { name: 'Trip sections' })).toBeInTheDocument()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Trip', 'For you', 'How it was built'])
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false'])
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1])
    for (const t of tabs) {
      expect(t.className).toMatch(/\bmin-h-11\b/)
      expect(t.getAttribute('aria-controls')).toMatch(/^trip-tabpanel-/)
    }
  })

  it('arrow keys, Home and End move the selection and the focus, wrapping', () => {
    const onTab = vi.fn()
    render(<Harness onTab={onTab} />)
    const list = screen.getByRole('tablist')
    fireEvent.keyDown(list, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'For you' })).toHaveAttribute('aria-selected', 'true')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'For you' }))
    fireEvent.keyDown(list, { key: 'End' })
    expect(screen.getByRole('tab', { name: 'How it was built' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(list, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'Trip' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(list, { key: 'ArrowLeft' })
    expect(screen.getByRole('tab', { name: 'How it was built' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(list, { key: 'Home' })
    expect(onTab).toHaveBeenLastCalledWith('trip')
    fireEvent.keyDown(list, { key: 'a' })
    expect(onTab).toHaveBeenCalledTimes(5)
  })
})
