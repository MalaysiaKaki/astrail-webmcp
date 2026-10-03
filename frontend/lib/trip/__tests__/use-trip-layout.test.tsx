import { describe, it, expect, afterEach, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { forceTripLayout, getForcedTripLayout, useTripLayout } from '@/lib/trip/use-trip-layout'

/* Task 2 seam: the widget forces the phone layout whatever the host iframe's width. */

function stubViewport(mobile: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: mobile, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }))
}

function Reader() { return <span data-testid="layout">{useTripLayout()}</span> }

afterEach(() => { forceTripLayout(null); vi.unstubAllGlobals() })

describe('forceTripLayout', () => {
  it('re-renders a mounted reader at a 1280px viewport without a resize, and null restores', () => {
    stubViewport(false)
    render(<Reader />)
    expect(screen.getByTestId('layout')).toHaveTextContent('desktop')
    act(() => { forceTripLayout('mobile') })
    expect(screen.getByTestId('layout')).toHaveTextContent('mobile')
    act(() => { forceTripLayout(null) })
    expect(screen.getByTestId('layout')).toHaveTextContent('desktop')
  })

  it('getForcedTripLayout returns the override only, never the viewport result', () => {
    stubViewport(true)
    expect(getForcedTripLayout()).toBeNull()
    forceTripLayout('desktop')
    expect(getForcedTripLayout()).toBe('desktop')
    forceTripLayout(null)
    expect(getForcedTripLayout()).toBeNull()
  })
})
