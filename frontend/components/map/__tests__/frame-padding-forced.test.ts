import { describe, it, expect, afterEach } from 'vitest'
import { computeFramePadding } from '@/components/map/frame-padding'
import { forceTripLayout } from '@/lib/trip/use-trip-layout'

/* Task 2 seam: a forced phone layout reaches the camera padding on a wide canvas. */

afterEach(() => { forceTripLayout(null) })

const args = { width: 1280, height: 800, obstruction: 300, leftObstruction: 440 }

describe('computeFramePadding with a forced layout', () => {
  it('pads for the phone at 1280 wide when the mobile layout is forced', () => {
    forceTripLayout('mobile')
    const forced = computeFramePadding(args)
    forceTripLayout(null)
    expect(forced).toEqual(computeFramePadding({ ...args, width: 390 }))
    expect(forced).not.toEqual(computeFramePadding(args))
  })

  it('is unchanged by width with no override', () => {
    expect(computeFramePadding(args)).toEqual({ top: 80, right: 80, bottom: 80, left: 480 })
    expect(computeFramePadding({ ...args, width: 390 }).bottom).toBe(340)
  })
})
