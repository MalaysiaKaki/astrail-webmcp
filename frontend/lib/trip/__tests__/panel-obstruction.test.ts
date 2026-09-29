import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  getPanelObstruction, measurePanelObstruction, setPanelObstruction, subscribePanelObstruction,
} from '@/lib/trip/panel-obstruction'

afterEach(() => setPanelObstruction(0))

describe('panel-obstruction', () => {
  it('stores the covered left strip, rounded, and 0 for junk', () => {
    setPanelObstruction(456.4)
    expect(getPanelObstruction()).toBe(456)
    setPanelObstruction(NaN)
    expect(getPanelObstruction()).toBe(0)
    setPanelObstruction(-3)
    expect(getPanelObstruction()).toBe(0)
  })

  it('notifies only on change', () => {
    const l = vi.fn()
    const off = subscribePanelObstruction(l)
    setPanelObstruction(456); setPanelObstruction(456)
    expect(l).toHaveBeenCalledTimes(1)
    off()
  })

  it('measures the panel right edge, 0 when collapsed, clamped to the viewport', () => {
    expect(measurePanelObstruction({ right: 456, viewportWidth: 1440, collapsed: false })).toBe(456)
    expect(measurePanelObstruction({ right: 456, viewportWidth: 1440, collapsed: true })).toBe(0)
    expect(measurePanelObstruction({ right: 2000, viewportWidth: 1024, collapsed: false })).toBe(1024)
    expect(measurePanelObstruction({ right: -20, viewportWidth: 1024, collapsed: false })).toBe(0)
  })
})
