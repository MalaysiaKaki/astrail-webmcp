import { describe, expect, it } from 'vitest'
import { CONTROL_GAP, FRAME_PAD, dashboardPadding } from '@/components/trips/dashboard-camera'

const viewport = { w: 1440, h: 900 }
const win = { top: 0, bottom: 900, left: 636, right: 1440 }

describe('dashboardPadding', () => {
  it('pads the measured window by FRAME_PAD on every side', () => {
    expect(dashboardPadding(win, viewport, [])).toEqual({
      top: FRAME_PAD, bottom: FRAME_PAD, left: 636 + FRAME_PAD, right: FRAME_PAD,
    })
  })

  it('falls back to FRAME_PAD all round without a window', () => {
    expect(dashboardPadding(null, viewport, [])).toEqual({
      top: FRAME_PAD, bottom: FRAME_PAD, left: FRAME_PAD, right: FRAME_PAD,
    })
  })

  it('widens the right pad to clear a control stack inside the window', () => {
    // A 44px column at right-4: x = 1440 - 16 - 44 = 1380.
    const stack = [{ x: 1380, y: 16, w: 44, h: 44 }, { x: 1380, y: 68, w: 44, h: 44 }]
    expect(dashboardPadding(win, viewport, stack).right).toBe(1440 - 1380 + CONTROL_GAP)
  })

  it('ignores controls outside the window (another surface, the rail)', () => {
    expect(dashboardPadding(win, viewport, [{ x: 200, y: 16, w: 44, h: 44 }]).right).toBe(FRAME_PAD)
  })

  it('never shrinks the pad below FRAME_PAD for a control far from the edge', () => {
    const far = [{ x: 1000, y: 16, w: 44, h: 44 }]
    expect(dashboardPadding(win, viewport, far).right).toBe(1440 - 1000 + CONTROL_GAP)
    const nearEdge = [{ x: 1430, y: 16, w: 8, h: 44 }]
    expect(dashboardPadding(win, viewport, nearEdge).right).toBe(FRAME_PAD)
  })
})
