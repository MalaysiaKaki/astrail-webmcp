import { describe, it, expect } from 'vitest'
import { placePinLabels, LABEL_MIN_ZOOM, type LabelCandidate } from '../pin-labels'

const VIEW = { width: 1024, height: 768 }
const pin = (id: string, x: number, y: number, over: Partial<LabelCandidate> = {}): LabelCandidate =>
  ({ id, x, y, radius: 21, width: 120, selected: false, ...over })

const rectOf = (c: LabelCandidate, side: 'right' | 'left') => side === 'right'
  ? { left: c.x + c.radius - 4, right: c.x + c.radius - 4 + c.width }
  : { left: c.x - c.radius + 4 - c.width, right: c.x - c.radius + 4 }

describe('placePinLabels (amendments 7 and 10)', () => {
  it('puts a pill on the pin\'s right when it fits', () => {
    expect(placePinLabels([pin('a', 500, 300)], { ...VIEW, obstacles: [] })).toEqual({ a: 'right' })
  })

  it('flips to the left when the right side would cross the viewport edge', () => {
    expect(placePinLabels([pin('a', 980, 300)], { ...VIEW, obstacles: [] })).toEqual({ a: 'left' })
  })

  it('flips to the left when the right side would cross a control rect', () => {
    const controls = [{ x: 964, y: 16, w: 44, h: 200 }]
    const c = pin('a', 880, 100)
    expect(placePinLabels([c], { ...VIEW, obstacles: controls })).toEqual({ a: 'left' })
  })

  it('suppresses a pill that fits on neither side (the panel on the left, the edge on the right)', () => {
    const panel = [{ x: 0, y: 0, w: 460, h: 768 }]
    const c = pin('a', 540, 300, { width: 520 })
    expect(placePinLabels([c], { ...VIEW, obstacles: panel })).toEqual({ a: 'hidden' })
  })

  it('a left-flipped pill must clear the expanded panel\'s right edge', () => {
    const panel = [{ x: 0, y: 0, w: 460, h: 768 }]
    // Right side crosses the viewport edge; left side would run under the panel.
    const c = pin('a', 1000, 300, { width: 300 })
    expect(placePinLabels([c], { ...VIEW, obstacles: panel })).toEqual({ a: 'left' })
    const tight = pin('b', 600, 300, { width: 450 })
    expect(placePinLabels([tight], { ...VIEW, obstacles: panel })).toEqual({ b: 'hidden' })
  })

  it('suppresses the later of two overlapping unselected pills', () => {
    const r = placePinLabels([pin('first', 500, 300), pin('later', 520, 305)], { ...VIEW, obstacles: [] })
    expect(r).toEqual({ first: 'right', later: 'hidden' })
  })

  it('the selected pill always wins an overlap, whatever its order', () => {
    const r = placePinLabels([pin('first', 500, 300), pin('later', 520, 305, { selected: true })], { ...VIEW, obstacles: [] })
    expect(r).toEqual({ first: 'hidden', later: 'right' })
  })

  it('pills that do not overlap vertically both show', () => {
    const r = placePinLabels([pin('a', 500, 300), pin('b', 520, 360)], { ...VIEW, obstacles: [] })
    expect(r).toEqual({ a: 'right', b: 'right' })
  })

  it('every shown pill is fully on screen and non-overlapping (random scatter)', () => {
    let seed = 7
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
    const cands = Array.from({ length: 40 }, (_, i) => pin(`p${i}`, rnd() * VIEW.width, rnd() * VIEW.height, { width: 60 + rnd() * 140, selected: i === 13 }))
    const obstacles = [{ x: 0, y: 0, w: 380, h: 768 }, { x: 964, y: 16, w: 44, h: 200 }]
    const r = placePinLabels(cands, { ...VIEW, obstacles })
    const shown = cands.filter((c) => r[c.id] !== 'hidden').map((c) => ({ c, ...rectOf(c, r[c.id] as 'right' | 'left'), top: c.y - 14, bottom: c.y + 14 }))
    for (const s of shown) {
      expect(s.left).toBeGreaterThanOrEqual(8)
      expect(s.right).toBeLessThanOrEqual(VIEW.width - 8)
      expect(s.top).toBeGreaterThanOrEqual(0)
      expect(s.bottom).toBeLessThanOrEqual(VIEW.height)
      for (const o of obstacles) {
        const hit = s.left < o.x + o.w && s.right > o.x && s.top < o.y + o.h && s.bottom > o.y
        expect(hit).toBe(false)
      }
    }
    for (let i = 0; i < shown.length; i++) {
      for (let j = i + 1; j < shown.length; j++) {
        const a = shown[i], b = shown[j]
        expect(a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top).toBe(false)
      }
    }
  })

  it('labels start at zoom 11', () => { expect(LABEL_MIN_ZOOM).toBe(11) })
})
