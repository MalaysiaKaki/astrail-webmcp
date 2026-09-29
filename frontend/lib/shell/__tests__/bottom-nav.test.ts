import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BOTTOM_NAV_SERVER_SNAPSHOT,
  getBottomNavHeight,
  measureBottomNav,
  setBottomNavHeight,
  subscribeBottomNavHeight,
} from '@/lib/shell/bottom-nav'

afterEach(() => setBottomNavHeight(0))

describe('bottom-nav store', () => {
  it('starts at 0, the same value the server renders with', () => {
    expect(BOTTOM_NAV_SERVER_SNAPSHOT).toBe(0)
    expect(getBottomNavHeight()).toBe(0)
  })

  it('rounds, and clamps junk (negative, NaN, Infinity) to 0', () => {
    setBottomNavHeight(84.6)
    expect(getBottomNavHeight()).toBe(85)
    for (const junk of [-5, Number.NaN, Number.POSITIVE_INFINITY]) {
      setBottomNavHeight(junk)
      expect(getBottomNavHeight()).toBe(0)
    }
  })

  it('notifies subscribers on a change only, and stops after unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeBottomNavHeight(listener)
    setBottomNavHeight(80)
    setBottomNavHeight(80)
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    setBottomNavHeight(90)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('measureBottomNav', () => {
  it('is the strip from the bar top edge to the viewport bottom (margin + safe area included)', () => {
    expect(measureBottomNav({ top: 760, height: 60 }, 844)).toBe(84)
  })

  it('is 0 when the bar is not laid out (display:none at >=768 reports a zero box)', () => {
    expect(measureBottomNav({ top: 0, height: 0 }, 844)).toBe(0)
  })

  it('never exceeds the viewport or goes negative', () => {
    expect(measureBottomNav({ top: -20, height: 60 }, 844)).toBe(844)
    expect(measureBottomNav({ top: 900, height: 60 }, 844)).toBe(0)
  })
})
