import { describe, it, expect, vi, afterEach } from 'vitest'
import { readSafeAreaTop, resetSafeAreaProbe } from '@/lib/trip/safe-area'

afterEach(() => { resetSafeAreaProbe(); vi.restoreAllMocks() })

const stubPadding = (px: string) => {
  const real = window.getComputedStyle
  return vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element) =>
    (el as HTMLElement).dataset?.safeAreaProbe !== undefined
      ? ({ paddingTop: px } as CSSStyleDeclaration)
      : real(el))
}

describe('readSafeAreaTop', () => {
  it('reads the resolved env(safe-area-inset-top) off one hidden probe element', () => {
    stubPadding('47px')
    expect(readSafeAreaTop()).toBe(47)
    const probes = document.querySelectorAll('[data-safe-area-probe]')
    expect(probes).toHaveLength(1)
    const p = probes[0] as HTMLElement
    expect(p.getAttribute('style')).toMatch(/padding-top:\s*env\(safe-area-inset-top/)
    expect(p.getAttribute('aria-hidden')).toBe('true')
    expect(p.getAttribute('style')).toMatch(/visibility:\s*hidden/)
  })

  it('reads once, then again only after a resize or rotation', () => {
    const spy = stubPadding('47px')
    readSafeAreaTop(); readSafeAreaTop(); readSafeAreaTop()
    const probeReads = () => spy.mock.calls.filter(([el]) => (el as HTMLElement).dataset?.safeAreaProbe !== undefined).length
    expect(probeReads()).toBe(1)
    spy.mockImplementation((el: Element) => ({ paddingTop: (el as HTMLElement).dataset?.safeAreaProbe !== undefined ? '59px' : '0px' }) as CSSStyleDeclaration)
    window.dispatchEvent(new Event('resize'))
    expect(readSafeAreaTop()).toBe(59)
    window.dispatchEvent(new Event('orientationchange'))
    expect(readSafeAreaTop()).toBe(59)
  })

  it('is 0 where env() does not resolve (desktop browsers, jsdom) or the value is junk', () => {
    expect(readSafeAreaTop()).toBe(0)                  // jsdom: env() is not a length
    resetSafeAreaProbe()
    stubPadding('auto')
    expect(readSafeAreaTop()).toBe(0)
  })
})
