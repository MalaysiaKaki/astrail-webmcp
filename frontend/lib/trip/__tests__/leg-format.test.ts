import { describe, it, expect } from 'vitest'
import { fmtDuration } from '@/lib/trip/leg-format'

describe('fmtDuration', () => {
  it('prints minutes under an hour, rounded', () => {
    expect(fmtDuration(150)).toBe('3 min')
    expect(fmtDuration(29)).toBe('0 min')
  })
  it('prints hours and minutes from an hour up', () => {
    expect(fmtDuration(3600)).toBe('1h 0m')
    expect(fmtDuration(3900)).toBe('1h 5m')
  })
  it('prints nothing for an unknown duration', () => {
    expect(fmtDuration(null)).toBe('')
  })
})
