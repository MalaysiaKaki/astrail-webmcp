import { describe, it, expect, afterEach } from 'vitest'
import { readSafeAreaTop, resetSafeAreaProbe } from '@/lib/trip/safe-area'

/* Task 2 seam: a host inset carried as --safe-top wins; env() stays the fallback. */

afterEach(() => { resetSafeAreaProbe(); document.documentElement.style.removeProperty('--safe-top') })

const probeStyle = () => (document.querySelector('[data-safe-area-probe]') as HTMLElement).getAttribute('style')

describe('safe-area probe', () => {
  it('reads var(--safe-top) with env(safe-area-inset-top) as its fallback', () => {
    readSafeAreaTop()
    expect(probeStyle()).toMatch(/padding-top:\s*var\(--safe-top,\s*env\(safe-area-inset-top,\s*0px\)\)/)
  })
})
