import { describe, it, expect } from 'vitest'
import {
  computeFramePadding, mobileControlRects, phoneStackFits, PIN_RADIUS, MAX_STACK_BUTTONS,
  MOBILE_CONTROL_INSET, MOBILE_CONTROL_SIZE, type Rect,
} from '@/components/map/frame-padding'

/* Amendment 3: the collision model uses the controls' MEASURED rects, not a fixed count. These
   tests drive computeFramePadding with rects shaped like the real stacks (phone: back + up to four
   circles; desktop: zoom +/−, 3D, Fit) and prove no framed pin — radius included — lands under one. */

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
const framedRect = (pad: ReturnType<typeof computeFramePadding>, W: number, H: number): Rect => ({
  x: pad.left - PIN_RADIUS, y: pad.top - PIN_RADIUS,
  w: W - pad.left - pad.right + 2 * PIN_RADIUS, h: H - pad.top - pad.bottom + 2 * PIN_RADIUS,
})

/** The expanded sheet's hide control: right-3, 32px below the sheet's top edge. */
function hideButton(W: number, H: number): Rect {
  const sheetTop = H - Math.round(H * 0.88)
  return { x: W - 12 - 44, y: sheetTop + 32, w: 44, h: 44 }
}

describe('computeFramePadding with measured controls', () => {
  it('matches the modelled pads exactly when the measured stack is where the model puts it', () => {
    const W = 390, H = 844
    const modelled = computeFramePadding({ width: W, height: H, obstruction: 380 })
    const measured = computeFramePadding({
      width: W, height: H, obstruction: 380, controls: mobileControlRects(W, MAX_STACK_BUTTONS),
    })
    expect(measured).toEqual(modelled)
  })

  it('MAX_STACK_BUTTONS is the new four (agent, Fit, 3D, Hotel)', () => {
    expect(MAX_STACK_BUTTONS).toBe(4)
  })

  for (const [W, H] of [[360, 640], [390, 844]] as const) {
    for (const safeTop of [0, 47]) {
      for (const hotels of [true, false]) {
        for (const webmcp of [true, false]) {
          for (const sheet of ['compact', 'expanded', 'hidden'] as const) {
            it(`${W}x${H} safe ${safeTop} hotels ${hotels ? 'on' : 'off'} webmcp ${webmcp ? 'on' : 'off'} sheet ${sheet}`, () => {
              // Expanded shows only the agent; otherwise agent?, Fit, 3D, Hotel?.
              const count = sheet === 'expanded'
                ? (webmcp ? 1 : 0)
                : (webmcp ? 1 : 0) + 2 + (hotels ? 1 : 0)
              const obstruction = sheet === 'hidden' ? 0
                : sheet === 'compact' ? Math.round(H * (H <= 700 ? 0.52 : 0.45))
                : Math.round(H * 0.88)
              const controls = mobileControlRects(W, count, safeTop)
              const pad = computeFramePadding({ width: W, height: H, obstruction, safeTop, controls })
              const framed = framedRect(pad, W, H)
              for (const c of controls) expect(overlaps(framed, c)).toBe(false)
              if (sheet === 'compact') {
                // The stack itself never sits on the compact sheet.
                const stackBottom = Math.max(...controls.map((c) => c.y + c.h))
                expect(stackBottom).toBeLessThan(H - obstruction)
              }
              if (sheet === 'expanded') {
                // The agent circle and the sheet's own Hide button never collide.
                for (const c of controls) expect(overlaps(c, hideButton(W, H))).toBe(false)
              }
            })
          }
        }
      }
    }
  }

  it('extends the cheapest pad when a measured control reaches into the framed area', () => {
    const W = 390, H = 844
    // A tall stack whose lowest button sits well inside the default right pad band.
    const intruder: Rect = { x: 250, y: 400, w: 44, h: 44 }
    const pad = computeFramePadding({ width: W, height: H, obstruction: 0, controls: [intruder] })
    expect(overlaps(framedRect(pad, W, H), intruder)).toBe(false)
  })

  describe('desktop: zoom +/−, 3D and Fit on the right', () => {
    for (const [W, H] of [[1024, 768], [1440, 900]] as const) {
      it(`${W}x${H}: no framed pin under the stack, left panel pad kept`, () => {
        const x = W - 16 - 44
        const controls: Rect[] = [0, 1, 2, 3].map((i) => ({ x, y: 16 + i * 52, w: 44, h: 44 }))
        const panelRight = W === 1024 ? 364 : 456      // the floating panel, measured live
        const pad = computeFramePadding({ width: W, height: H, obstruction: 0, controls, leftObstruction: panelRight })
        expect(pad.left).toBe(panelRight + 40)
        for (const c of controls) expect(overlaps(framedRect(pad, W, H), c)).toBe(false)
      })
    }
  })
})

describe('phoneStackFits', () => {
  it('a four-button stack fits above the compact sheet on every supported phone', () => {
    for (const [H, ratio] of [[640, 0.52], [844, 0.45], [932, 0.45]] as const) {
      for (const safeTop of [0, 47]) {
        expect(phoneStackFits({ buttons: 4, safeTop, viewportHeight: H, obstruction: Math.round(H * ratio) })).toBe(true)
      }
    }
  })

  it('does not fit on a very short viewport, so Hotel moves to the Stay chip', () => {
    expect(phoneStackFits({ buttons: 4, safeTop: 0, viewportHeight: 390, obstruction: Math.round(390 * 0.52) })).toBe(false)
    expect(phoneStackFits({ buttons: 3, safeTop: 0, viewportHeight: 390, obstruction: Math.round(390 * 0.52) })).toBe(true)
  })

  it('a hidden sheet (no obstruction) always fits', () => {
    expect(phoneStackFits({ buttons: 4, safeTop: 47, viewportHeight: 400, obstruction: 0 })).toBe(true)
  })

  it('uses the same geometry as mobileControlRects', () => {
    const rects = mobileControlRects(390, 4, 0)
    expect(rects.at(-1)!.y + rects.at(-1)!.h).toBe(MOBILE_CONTROL_INSET + 4 * MOBILE_CONTROL_SIZE + 3 * 8)
  })
})
