import type { Viewport } from 'next'

/**
 * The root `viewport` export, kept out of app/layout.tsx so it can be tested without loading
 * next/font. Device-width is already Next's default, so only the two non-defaults live here.
 *
 * `viewportFit: 'cover'` lets the page run under the notch and home indicator, which is what makes
 * env(safe-area-inset-*) non-zero on iOS. The controls that sit at a screen edge (the trip top bar,
 * the reopen pill, the agent dock, the approval card) pad themselves by those insets; nothing else
 * does, so desktop (where every inset is 0) is unchanged.
 */
export const SITE_VIEWPORT: Viewport = {
  viewportFit: 'cover',
  themeColor: '#F5F1E6', // palette.css --paper-1, the page ground
}
