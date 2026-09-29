import { describe, it, expect } from 'vitest'
import { anchorRect, solveCardPlacement, type Box, type PlacementInput } from '@/components/map/card-placement'

/* A10 item 3: the desktop place card's placement against MEASURED chrome (Codex map-card review
   §2). Native Popup auto-anchoring only checks the container edges, never the panel, the control
   stack, the dock or the day chip, so the solver owns that. */

const VIEW = { w: 1440, h: 900 }
const PANEL: Box = { x: 0, y: 0, w: 472, h: 900 }            // the floating panel's strip
const STACK: Box = { x: 1380, y: 16, w: 44, h: 244 }          // zoom, zoom, 3D, Fit
const DOCK: Box = { x: 1070, y: 760, w: 354, h: 124 }         // bottom-right dock cards

function input(over: Partial<PlacementInput> = {}): PlacementInput {
  return {
    pin: { x: 900, y: 270 },
    card: { w: 360, natural: 420 },
    view: VIEW,
    obstacles: [PANEL, STACK, DOCK],
    offset: 30,
    margin: 12,
    minHeight: 260,
    current: null,
    panelRight: PANEL.w,
    ...over,
  }
}

const intersects = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

describe('anchorRect (Mapbox anchor semantics: the anchor names the card side touching the pin)', () => {
  it('"top" hangs the card below the pin, centred', () => {
    expect(anchorRect('top', { x: 500, y: 200 }, 360, 400, 30)).toEqual({ x: 320, y: 230, w: 360, h: 400 })
  })
  it('"bottom" stands the card above the pin', () => {
    expect(anchorRect('bottom', { x: 500, y: 600 }, 360, 400, 30)).toEqual({ x: 320, y: 170, w: 360, h: 400 })
  })
  it('"left" puts the card to the pin\'s right, vertically centred', () => {
    expect(anchorRect('left', { x: 500, y: 400 }, 360, 400, 30)).toEqual({ x: 530, y: 200, w: 360, h: 400 })
  })
  it('corner anchors use Mapbox\'s diagonal offset (offset / √2, rounded)', () => {
    expect(anchorRect('top-left', { x: 500, y: 200 }, 360, 400, 30)).toEqual({ x: 521, y: 221, w: 360, h: 400 })
  })
})

describe('solveCardPlacement', () => {
  it('prefers the card below the pin when the whole card fits there', () => {
    const r = solveCardPlacement(input())
    expect(r).toMatchObject({ kind: 'fit', anchor: 'top', maxHeight: 420 })
  })

  it('never overlaps the panel, the control stack or the dock, and stays inside the view', () => {
    for (const pin of [{ x: 520, y: 120 }, { x: 1300, y: 700 }, { x: 900, y: 820 }, { x: 1330, y: 120 }]) {
      const r = solveCardPlacement(input({ pin }))
      if (r.kind !== 'fit') continue
      for (const o of [PANEL, STACK, DOCK]) expect(intersects(r.rect, o)).toBe(false)
      expect(r.rect.x).toBeGreaterThanOrEqual(12)
      expect(r.rect.y).toBeGreaterThanOrEqual(12)
      expect(r.rect.x + r.rect.w).toBeLessThanOrEqual(VIEW.w - 12)
      expect(r.rect.y + r.rect.h).toBeLessThanOrEqual(VIEW.h - 12)
    }
  })

  it('flips above the pin near the bottom edge', () => {
    const r = solveCardPlacement(input({ pin: { x: 800, y: 700 } }))
    expect(r).toMatchObject({ kind: 'fit', anchor: 'bottom' })
  })

  it('goes to the side beside the panel rather than under it', () => {
    // Pin just right of the panel, mid height, card too tall for above or below.
    const r = solveCardPlacement(input({ pin: { x: 520, y: 450 }, card: { w: 360, natural: 560 } }))
    expect(r.kind).toBe('fit')
    if (r.kind === 'fit') expect(r.anchor).toBe('left')
  })

  it('bounds a tall card to the room it has (the body scrolls) rather than overflowing', () => {
    const r = solveCardPlacement(input({ card: { w: 360, natural: 2000 } }))
    expect(r.kind).toBe('fit')
    if (r.kind === 'fit') {
      expect(r.maxHeight).toBeLessThan(2000)
      expect(r.maxHeight).toBeGreaterThanOrEqual(260)
      expect(r.rect.h).toBe(r.maxHeight)
    }
  })

  it('keeps the current anchor while it still fits whole (no oscillation mid-move)', () => {
    // At y=450 both "top" (below) and "bottom" (above) fit a 300px card; the current one stays.
    const first = solveCardPlacement(input({ pin: { x: 900, y: 450 }, card: { w: 360, natural: 300 }, current: 'bottom' }))
    expect(first).toMatchObject({ kind: 'fit', anchor: 'bottom' })
  })

  it('asks for one bounded camera shift when no anchor fits where the pin is', () => {
    // Pin hard against the panel edge and the top: nothing fits, but moving the pin right does.
    const r = solveCardPlacement(input({ pin: { x: 470, y: 40 }, card: { w: 360, natural: 420 } }))
    expect(r.kind).toBe('shift')
    if (r.kind !== 'shift') return
    const moved = { x: 470 + r.dx, y: 40 + r.dy }
    const after = solveCardPlacement(input({ pin: moved }))
    expect(after.kind).toBe('fit')
    expect(Math.hypot(r.dx, r.dy)).toBeLessThanOrEqual(Math.max(VIEW.w, VIEW.h) / 2)
  })

  it('never shifts the pin under the panel to make room', () => {
    const r = solveCardPlacement(input({ pin: { x: 470, y: 40 } }))
    if (r.kind !== 'shift') return
    expect(470 + r.dx).toBeGreaterThan(PANEL.w)
  })

  it('answers none when the map beside the panel cannot hold the card and still show map (768)', () => {
    // 768 wide: the panel takes 356px. A 360px card would fit under the stack, but only by covering
    // all of what remains of the map: that is the sidebar's job. A camera move cannot add width.
    const r = solveCardPlacement(input({
      view: { w: 768, h: 900 },
      panelRight: 356,
      obstacles: [{ x: 0, y: 0, w: 356, h: 900 }, { x: 708, y: 16, w: 44, h: 244 }, { x: 398, y: 760, w: 354, h: 124 }],
      pin: { x: 540, y: 300 },
    }))
    expect(r.kind).toBe('none')
  })

  it('still anchors at 1024 beside the expanded panel', () => {
    const r = solveCardPlacement(input({
      view: { w: 1024, h: 768 },
      panelRight: 364,
      obstacles: [{ x: 0, y: 0, w: 364, h: 768 }, { x: 964, y: 16, w: 44, h: 244 }, { x: 654, y: 630, w: 354, h: 122 }],
      pin: { x: 690, y: 230 },
    }))
    expect(r.kind).toBe('fit')
  })

  it('answers none on a landscape phone-height desktop (844x390) with the day chip and dock', () => {
    const r = solveCardPlacement(input({
      view: { w: 844, h: 390 },
      panelRight: 356,
      obstacles: [{ x: 0, y: 0, w: 356, h: 390 }, { x: 784, y: 16, w: 44, h: 196 },
        { x: 520, y: 16, w: 150, h: 44 }, { x: 560, y: 300, w: 270, h: 74 }],
      pin: { x: 600, y: 180 },
    }))
    expect(r.kind).toBe('none')
  })

  it('answers none for a pin behind the camera or not projected (Mapbox returns MAX_VALUE)', () => {
    expect(solveCardPlacement(input({ pin: { x: Number.MAX_VALUE, y: Number.MAX_VALUE } })).kind).toBe('none')
    expect(solveCardPlacement(input({ pin: null })).kind).toBe('none')
    expect(solveCardPlacement(input({ pin: { x: NaN, y: 3 } })).kind).toBe('none')
  })
})
