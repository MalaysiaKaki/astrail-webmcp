import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  clearControlRects, getControlRects, measureControls, setControlRects, subscribeControlRects,
} from '@/lib/trip/control-obstruction'

afterEach(() => { clearControlRects('a'); clearControlRects('b') })

describe('control-obstruction store', () => {
  it('flattens every owner\'s rects, and each owner clears only its own', () => {
    setControlRects('a', [{ x: 12, y: 12, w: 44, h: 44 }])
    setControlRects('b', [{ x: 334, y: 12, w: 44, h: 44 }, { x: 334, y: 64, w: 44, h: 44 }])
    expect(getControlRects()).toHaveLength(3)
    clearControlRects('a')
    expect(getControlRects()).toEqual([{ x: 334, y: 12, w: 44, h: 44 }, { x: 334, y: 64, w: 44, h: 44 }])
  })

  it('drops hidden (zero-size) and non-finite rects, and rounds', () => {
    setControlRects('a', [{ x: 1.4, y: 2.6, w: 44, h: 44 }, { x: 0, y: 0, w: 0, h: 0 }, { x: NaN, y: 0, w: 4, h: 4 }])
    expect(getControlRects()).toEqual([{ x: 1, y: 3, w: 44, h: 44 }])
  })

  it('notifies only on a real change, with a stable snapshot in between', () => {
    const l = vi.fn()
    const off = subscribeControlRects(l)
    setControlRects('a', [{ x: 1, y: 1, w: 4, h: 4 }])
    const snap = getControlRects()
    setControlRects('a', [{ x: 1, y: 1, w: 4, h: 4 }])
    expect(l).toHaveBeenCalledTimes(1)
    expect(getControlRects()).toBe(snap)
    off()
  })

  it('measures [data-map-control] elements, including the root itself', () => {
    const root = document.createElement('div')
    root.setAttribute('data-map-control', '')
    const child = document.createElement('button')
    child.setAttribute('data-map-control', '')
    root.append(child, document.createElement('span'))
    const rect = (x: number) => ({ left: x, top: 5, width: 44, height: 44 }) as DOMRect
    root.getBoundingClientRect = () => rect(1)
    child.getBoundingClientRect = () => rect(2)
    expect(measureControls(root).map((r) => r.x)).toEqual([1, 2])
  })
})
