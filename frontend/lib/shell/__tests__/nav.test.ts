import { describe, expect, it } from 'vitest'
import { isNavActive, SHELL_TABS } from '@/lib/shell/nav'

describe('shell nav model', () => {
  it('has the four phone tabs in order', () => {
    expect(SHELL_TABS.map((t) => [t.label, t.href])).toEqual([
      ['Home', '/app'],
      ['Trails', '/app/trips'],
      ['Sample', '/app/trip/demo'],
      ['Settings', '/app/settings'],
    ])
  })

  it('matches Home on /app exactly, never on its children', () => {
    expect(isNavActive('/app', '/app')).toBe(true)
    expect(isNavActive('/app/trips', '/app')).toBe(false)
  })

  it('does not let /app/trip/demo light up Trails (prefix without a segment boundary)', () => {
    expect(isNavActive('/app/trip/demo', '/app/trips')).toBe(false)
    expect(isNavActive('/app/trip/demo', '/app/trip/demo')).toBe(true)
  })

  it('matches nested segments but not look-alike prefixes', () => {
    expect(isNavActive('/app/trips', '/app/trips')).toBe(true)
    expect(isNavActive('/app/trips/archive', '/app/trips')).toBe(true)
    expect(isNavActive('/app/tripsx', '/app/trips')).toBe(false)
    expect(isNavActive('/app/settings', '/app/settings')).toBe(true)
  })
})
