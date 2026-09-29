import { describe, it, expect, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { TOKYO_TRIP } from '@/lib/trip/fixtures'
import MapDayChip from '@/components/map/MapDayChip'
import { getPlacementObstacles } from '@/lib/trip/placement-obstacles'

// A10 item 3: the top-centre day chip is an obstacle the place card must not open under.
describe('MapDayChip', () => {
  it('publishes its rect as a place-card obstacle while mounted', () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1 })
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      { left: 800, top: 16, width: 160, height: 44, right: 960, bottom: 60, x: 800, y: 16, toJSON() {} } as DOMRect,
    )
    const view = render(<MapDayChip day={TOKYO_TRIP.days[0]} />)
    act(() => { window.dispatchEvent(new Event('resize')) })
    expect(getPlacementObstacles()).toEqual([{ x: 800, y: 16, w: 160, h: 44 }])
    view.unmount()
    expect(getPlacementObstacles()).toEqual([])
    spy.mockRestore()
    vi.unstubAllGlobals()
  })
})
