import { describe, it, expect } from 'vitest'
import { computeFramePadding, MOBILE_TOP_CLEARANCE, MOBILE_SHEET_GAP } from '@/components/map/frame-padding'

describe('computeFramePadding', () => {
  it('keeps the desktop pads exactly as they were (clear the 440px left panel)', () => {
    expect(computeFramePadding({ width: 1440, height: 900, obstruction: 0 }))
      .toEqual({ top: 80, right: 80, bottom: 80, left: 480 })
  })

  it('ignores a stale obstruction on desktop — there is no sheet there', () => {
    expect(computeFramePadding({ width: 1024, height: 768, obstruction: 400 }))
      .toEqual({ top: 80, right: 80, bottom: 80, left: 480 })
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

  it('trusts a zero-sized canvas and yields zero pads', () => {
    expect(computeFramePadding({ width: 0, height: 0, obstruction: 300 }))
      .toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
  })
})
