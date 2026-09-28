import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { useScrolledPast } from '../useScrolledPast'

/* The phone header floats once the page has moved more than `threshold` px (plan amendment 8:
   scrollY > 8). Strictly greater, so a one-pixel rubber-band at the top never flips it. */

const scrollTo = (y: number) => {
  Object.defineProperty(window, 'scrollY', { configurable: true, value: y })
  window.dispatchEvent(new Event('scroll'))
}

afterEach(() => {
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
})

describe('useScrolledPast', () => {
  it('starts false at the top, so server and first client paint agree', () => {
    const { result } = renderHook(() => useScrolledPast(8))
    expect(result.current).toBe(false)
  })

  it('flips on the way down and back on the way up', () => {
    const { result } = renderHook(() => useScrolledPast(8))
    act(() => scrollTo(40))
    expect(result.current).toBe(true)
    act(() => scrollTo(3))
    expect(result.current).toBe(false)
  })

  it('treats the threshold itself as not past it', () => {
    const { result } = renderHook(() => useScrolledPast(8))
    act(() => scrollTo(8))
    expect(result.current).toBe(false)
    act(() => scrollTo(9))
    expect(result.current).toBe(true)
  })

  it('reads the position on mount, for a page restored or linked mid-scroll', () => {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 600 })
    const { result } = renderHook(() => useScrolledPast(8))
    expect(result.current).toBe(true)
  })

  it('stops listening on unmount', () => {
    const { result, unmount } = renderHook(() => useScrolledPast(8))
    unmount()
    act(() => scrollTo(100))
    expect(result.current).toBe(false)
  })
})
