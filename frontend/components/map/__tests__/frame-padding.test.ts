import { describe, it, expect } from 'vitest'
import {
  computeFramePadding, mobileControlRects, DESKTOP_PANEL_GAP, MAX_STACK_BUTTONS, MOBILE_TOP_CLEARANCE, MOBILE_SHEET_GAP, PIN_RADIUS,
  type Rect,
} from '@/components/map/frame-padding'

describe('computeFramePadding', () => {
  /* A6 migration (was a fixed 480 left pad for the flush 440px rail): desktop clears the floating
     panel's MEASURED right edge plus DESKTOP_PANEL_GAP — 440 reproduces the old 480 exactly. */
  it('clears the measured left panel on desktop', () => {
    expect(computeFramePadding({ width: 1440, height: 900, obstruction: 0, leftObstruction: 440 }))
      .toEqual({ top: 80, right: 80, bottom: 80, left: 480 })
    expect(computeFramePadding({ width: 1440, height: 900, obstruction: 0, leftObstruction: 456 }).left)
      .toBe(456 + DESKTOP_PANEL_GAP)
  })

  it('uses the plain edge pad on desktop once the panel is collapsed (0)', () => {
    expect(computeFramePadding({ width: 1440, height: 900, obstruction: 0, leftObstruction: 0 }))
      .toEqual({ top: 80, right: 80, bottom: 80, left: 80 })
  })

  it('ignores a stale sheet obstruction on desktop — there is no sheet there', () => {
    expect(computeFramePadding({ width: 1024, height: 768, obstruction: 400, leftObstruction: 364 }))
      .toEqual({ top: 80, right: 80, bottom: 80, left: 404 })
  })

  it('ignores a stale panel obstruction on a phone — there is no panel there', () => {
    const phone = computeFramePadding({ width: 390, height: 844, obstruction: 380 })
    expect(computeFramePadding({ width: 390, height: 844, obstruction: 380, leftObstruction: 456 })).toEqual(phone)
  })

  it('keeps desktop popup room: the pin lands in the upper third', () => {
    const H = 720
    const pad = computeFramePadding({ width: 1280, height: H, obstruction: 0, popupRoom: true })
    expect(pad.top + (H - pad.top - pad.bottom) / 2).toBeLessThan(H / 3)
  })

  it('pads a phone by the sheet it actually has, not a fixed 42%', () => {
    const pad = computeFramePadding({ width: 390, height: 844, obstruction: 380 })
    expect(pad.bottom).toBe(380 + MOBILE_SHEET_GAP)
    expect(pad.top).toBe(MOBILE_TOP_CLEARANCE)
  })

  it('uses the whole screen once the sheet is hidden', () => {
    const pad = computeFramePadding({ width: 390, height: 844, obstruction: 0 })
    expect(pad.bottom).toBeLessThan(100)
  })

  it('lands a selected pin above the compact sheet and below the top bar', () => {
    const H = 844, obstruction = 380
    const pad = computeFramePadding({ width: 390, height: H, obstruction, popupRoom: true })
    const pinY = pad.top + (H - pad.top - pad.bottom) / 2
    expect(pinY).toBeGreaterThan(MOBILE_TOP_CLEARANCE)
    expect(pinY).toBeLessThan(H - obstruction)
  })

  it('never lets the pads consume the canvas, even under an 88dvh sheet', () => {
    const H = 640
    const pad = computeFramePadding({ width: 360, height: H, obstruction: Math.round(H * 0.88) })
    expect(pad.top + pad.bottom).toBeLessThanOrEqual(H * 0.7)
  })

  /* Amendment 5: the map chrome is a back button top-left and a stack of up to three 44px circles
     top-right. A pin framed anywhere inside the padded rect — including its drawn radius — must
     never sit under one of them, at every phone size the plan measures, sheet up or hidden. */
  describe('never frames a pin under the phone map controls', () => {
    const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
    const sizes = [[360, 640], [390, 844], [430, 932]] as const
    for (const [W, H] of sizes) {
      for (const obstruction of [0, Math.round(H * 0.45)]) {
        it(`${W}x${H}, sheet ${obstruction ? 'compact' : 'hidden'}`, () => {
          const pad = computeFramePadding({ width: W, height: H, obstruction })
          const framed: Rect = {
            x: pad.left - PIN_RADIUS, y: pad.top - PIN_RADIUS,
            w: W - pad.left - pad.right + 2 * PIN_RADIUS, h: H - pad.top - pad.bottom + 2 * PIN_RADIUS,
          }
          const controls = mobileControlRects(W, MAX_STACK_BUTTONS)
          expect(controls).toHaveLength(1 + MAX_STACK_BUTTONS)
          for (const c of controls) expect(overlaps(framed, c)).toBe(false)
          // And the band that is left is still a real map, not a sliver.
          expect(framed.h).toBeGreaterThan(H * 0.2)
        })
      }
    }

    it('places the stack flush right under the top inset, one row per button', () => {
      const [back, first, second, third] = mobileControlRects(390, 3)
      expect(back).toEqual({ x: 12, y: 12, w: 44, h: 44 })
      expect(first).toEqual({ x: 390 - 12 - 44, y: 12, w: 44, h: 44 })
      expect(second.y).toBe(first.y + 44 + 8)
      expect(third.y).toBe(second.y + 44 + 8)
    })
  })

  /* Codex final review #2: MobileMapControls sits at max(12px, env(safe-area-inset-top)), and
     viewport-fit=cover makes a nonzero inset real (47px on a notched iPhone). The pads must be
     derived from where the controls ACTUALLY are, or a framed pin lands under All trails. */
  describe('with a top safe-area inset (notched phone)', () => {
    const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
    const framedRect = (pad: ReturnType<typeof computeFramePadding>, W: number, H: number): Rect => ({
      x: pad.left - PIN_RADIUS, y: pad.top - PIN_RADIUS,
      w: W - pad.left - pad.right + 2 * PIN_RADIUS, h: H - pad.top - pad.bottom + 2 * PIN_RADIUS,
    })

    it('places the controls below the inset, as max(12px, inset) does in CSS', () => {
      const [back, first] = mobileControlRects(390, 3, 47)
      expect(back).toEqual({ x: 12, y: 47, w: 44, h: 44 })
      expect(first.y).toBe(47)
      expect(mobileControlRects(390, 1, 4)[0].y).toBe(12)          // a small inset stays at 12px
    })

    for (const [W, H] of [[390, 844], [430, 932], [360, 640]] as const) {
      for (const obstruction of [0, Math.round(H * 0.45)]) {
        it(`${W}x${H} with a 47px inset, sheet ${obstruction ? 'compact' : 'hidden'}: no framed pin under a control`, () => {
          const pad = computeFramePadding({ width: W, height: H, obstruction, safeTop: 47 })
          const framed = framedRect(pad, W, H)
          for (const c of mobileControlRects(W, MAX_STACK_BUTTONS, 47)) expect(overlaps(framed, c)).toBe(false)
        })
      }
    }

    it('would have failed before: the old fixed 76px top pad reaches under the 47px-inset back button', () => {
      const pad = computeFramePadding({ width: 390, height: 844, obstruction: 380 })   // no inset passed
      const back = mobileControlRects(390, 1, 47)[0]
      expect(overlaps(framedRect(pad, 390, 844), back)).toBe(true)                    // the reported bug
    })

    it('ignores the inset on desktop (no phone controls there)', () => {
      expect(computeFramePadding({ width: 1440, height: 900, obstruction: 0, safeTop: 47, leftObstruction: 440 }))
        .toEqual({ top: 80, right: 80, bottom: 80, left: 480 })
    })
  })

  it('trusts a zero-sized canvas and yields zero pads', () => {
    expect(computeFramePadding({ width: 0, height: 0, obstruction: 300 }))
      .toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
  })
})
