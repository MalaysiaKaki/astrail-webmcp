/**
 * The resolved top safe-area inset, in CSS pixels, for camera padding.
 *
 * The phone map controls sit at `max(12px, env(safe-area-inset-top))` (MobileMapControls), and
 * `viewport-fit=cover` makes that inset real on notched phones (~47px). JavaScript cannot read
 * `env()` directly, so one hidden probe element carries it as `padding-top` and its computed value
 * is read — once, cached, and re-read after a resize or rotation (when the inset can change).
 * Frame padding uses it so the camera's clearance matches where the controls really are.
 *
 * 0 wherever env() does not resolve to a length (desktop browsers, SSR, jsdom).
 */

let probe: HTMLElement | null = null
let cached: number | null = null
let listening = false

function invalidate(): void {
  cached = null
}

function ensureProbe(): HTMLElement {
  if (probe && probe.isConnected) return probe
  probe = document.createElement('div')
  probe.dataset.safeAreaProbe = ''
  probe.setAttribute('aria-hidden', 'true')
  // One style attribute rather than style.* setters: a parser that does not know env() drops a
  // setter's value, and the raw declaration is what a browser that does know it should see.
  probe.setAttribute(
    'style',
    'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;'
      + 'padding-top:env(safe-area-inset-top, 0px)',
  )
  document.body.appendChild(probe)
  return probe
}

export function readSafeAreaTop(): number {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !document.body) return 0
  if (!listening) {
    window.addEventListener('resize', invalidate)
    window.addEventListener('orientationchange', invalidate)
    listening = true
  }
  if (cached !== null) return cached
  const px = parseFloat(window.getComputedStyle(ensureProbe()).paddingTop)
  cached = Number.isFinite(px) && px > 0 ? px : 0
  return cached
}

/** Test seam: drop the probe, the cache and the listeners. */
export function resetSafeAreaProbe(): void {
  probe?.remove()
  probe = null
  cached = null
  if (listening && typeof window !== 'undefined') {
    window.removeEventListener('resize', invalidate)
    window.removeEventListener('orientationchange', invalidate)
  }
  listening = false
}
