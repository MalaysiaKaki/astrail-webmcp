import { describe, it, expect, afterEach, vi } from 'vitest'
import { useRef } from 'react'
import { act, render } from '@testing-library/react'
import {
  clearPlacementObstacles, getPlacementObstacles, setPlacementObstacles, useReportPlacementObstacles,
} from '@/lib/trip/placement-obstacles'
import { getControlRects } from '@/lib/trip/control-obstruction'
import { dockRoomUnderControls } from '@/lib/webmcp/dock-geometry'

/* A10 item 3: the dock and the day chip are obstacles for the place card ONLY (Codex review §5).
   They must never reach the control store: dockRoomUnderControls treats every right-half control
   rect as the stack, and the bottom-anchored dock's own rect would collapse its room to zero; the
   camera's frame padding reads that store too, so a dock there would re-frame on every expand. */

afterEach(() => {
  clearPlacementObstacles('dock')
  clearPlacementObstacles('day-chip')
})

describe('placement obstacles', () => {
  it('keeps each owner\'s rects apart and clears only its own', () => {
    setPlacementObstacles('dock', [{ x: 1000, y: 700, w: 350, h: 150 }])
    setPlacementObstacles('day-chip', [{ x: 600, y: 16, w: 160, h: 44 }])
    expect(getPlacementObstacles()).toHaveLength(2)
    clearPlacementObstacles('dock')
    expect(getPlacementObstacles()).toEqual([{ x: 600, y: 16, w: 160, h: 44 }])
  })

  it('never reaches the control store, so the dock\'s room is not computed from itself', () => {
    setPlacementObstacles('dock', [{ x: 1070, y: 760, w: 354, h: 124 }])
    expect(getControlRects()).toEqual([])
    expect(dockRoomUnderControls(getControlRects(), 1440, 900)).toBeNull()
  })

  it('drops empty and non-finite rects', () => {
    setPlacementObstacles('dock', [{ x: 0, y: 0, w: 0, h: 10 }, { x: NaN, y: 0, w: 5, h: 5 }])
    expect(getPlacementObstacles()).toEqual([])
  })

  it('a reporter measures the visible children of its element and clears them on unmount', () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1 })
    vi.stubGlobal('cancelAnimationFrame', () => {})
    function Chip() {
      const ref = useRef<HTMLDivElement>(null)
      useReportPlacementObstacles(ref, 'day-chip', [])
      return <div ref={ref} data-testid="chip" />
    }
    const view = render(<Chip />)
    const el = view.getByTestId('chip')
    el.getBoundingClientRect = () => ({ left: 600, top: 16, width: 160, height: 44, right: 760, bottom: 60, x: 600, y: 16, toJSON() {} }) as DOMRect
    act(() => { window.dispatchEvent(new Event('resize')) })
    expect(getPlacementObstacles()).toEqual([{ x: 600, y: 16, w: 160, h: 44 }])
    view.unmount()
    expect(getPlacementObstacles()).toEqual([])
    vi.unstubAllGlobals()
  })
})
