import { describe, it, expect } from 'vitest'
import { SITE_VIEWPORT } from '@/lib/site-viewport'

describe('SITE_VIEWPORT', () => {
  // Without `cover`, iOS letterboxes the page inside the safe area and every env(safe-area-inset-*)
  // reads 0 — so the insets the phone controls pad by would silently do nothing.
  it('extends under the notch so safe-area insets are real', () => {
    expect(SITE_VIEWPORT.viewportFit).toBe('cover')
  })

  it('tints the browser chrome with the paper ground, not a new brand colour', () => {
    expect(SITE_VIEWPORT.themeColor).toBe('#F5F1E6')   // palette.css --paper-1
  })
})
